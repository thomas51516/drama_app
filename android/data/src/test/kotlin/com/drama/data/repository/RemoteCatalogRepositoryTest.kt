package com.drama.data.repository

import app.cash.turbine.test
import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.Resource
import com.drama.core.common.time.Clock
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.CatalogApi
import com.drama.data.local.CatalogLocalDataSource
import com.drama.data.local.CatalogLocalDataSource.Companion.KEY_HOME
import com.drama.data.local.CatalogLocalDataSource.Companion.episodesKey
import com.drama.data.local.CatalogLocalDataSource.Companion.seriesKey
import com.drama.data.media.MediaUrlResolver
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.HomeContent
import com.drama.domain.model.Series
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

class RemoteCatalogRepositoryTest {
    private val server = MockWebServer()
    private val local = InMemoryCatalogLocalDataSource()
    private var now = 1_000_000L
    private lateinit var repository: RemoteCatalogRepository

    @Before
    fun setUp() {
        server.start()
        val json =
            Json {
                ignoreUnknownKeys = true
                explicitNulls = false
                coerceInputValues = true
            }
        val api =
            Retrofit
                .Builder()
                .baseUrl(server.url("/"))
                .client(OkHttpClient())
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
                .create(CatalogApi::class.java)
        repository =
            RemoteCatalogRepository(
                api = api,
                local = local,
                errorMapper = ApiErrorMapper(json),
                media = MediaUrlResolver("http://10.0.2.2:9000/drama-media", rewriteLoopback = true),
                clock = Clock { now },
                logger = NoOpLogger,
                homeTtlMs = 5 * 60_000L,
                seriesTtlMs = 10 * 60_000L,
            )
    }

    @After
    fun tearDown() {
        server.close()
    }

    @Test
    fun `empty cache - loading then network value, cache populated`() =
        runTest {
            server.enqueue(MockResponse(code = 200, body = HOME_JSON))

            repository.observeHome().test {
                assertEquals(Resource.Loading<HomeContent>(null), awaitItem())
                val success = awaitItem() as Resource.Success
                assertEquals(
                    "Le Secret du Lagon",
                    success.data.rows
                        .first()
                        .items
                        .first()
                        .series.title,
                )
                assertEquals(
                    "Tendances",
                    success.data.rows
                        .first()
                        .title,
                )
                assertEquals(1, success.data.banners.size)
                cancelAndIgnoreRemainingEvents()
            }
            assertEquals(1, server.requestCount)
            assertEquals(now, local.fetchedAt(KEY_HOME))
        }

    @Test
    fun `fresh cache - served without any network call`() =
        runTest {
            local.saveHome(homeContent("cached"), nowEpochMs = now - 60_000L)

            repository.observeHome().test {
                val item = awaitItem() as Resource.Success
                assertTrue(item.fromCache)
                assertEquals(
                    "cached",
                    item.data.rows
                        .first()
                        .items
                        .first()
                        .series.title,
                )
                cancelAndIgnoreRemainingEvents()
            }
            assertEquals(0, server.requestCount)
        }

    @Test
    fun `stale cache - cached value shown while refreshing, then refreshed value`() =
        runTest {
            local.saveHome(homeContent("stale"), nowEpochMs = now - 6 * 60_000L)
            server.enqueue(MockResponse(code = 200, body = HOME_JSON))

            repository.observeHome().test {
                val loading = awaitItem() as Resource.Loading
                assertEquals(
                    "stale",
                    loading.data
                        ?.rows
                        ?.first()
                        ?.items
                        ?.first()
                        ?.series
                        ?.title,
                )
                val refreshed = awaitItem() as Resource.Success
                assertEquals(
                    "Le Secret du Lagon",
                    refreshed.data.rows
                        .first()
                        .items
                        .first()
                        .series.title,
                )
                cancelAndIgnoreRemainingEvents()
            }
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `stale cache and network failure - error carries the stale value`() =
        runTest {
            local.saveHome(homeContent("stale"), nowEpochMs = now - 6 * 60_000L)
            server.enqueue(MockResponse(code = 503, body = "{}"))

            repository.observeHome().test {
                awaitItem() // loading with stale
                val error = awaitItem() as Resource.Error
                assertTrue(error.error is AppError.Server)
                assertEquals(
                    "stale",
                    error.data
                        ?.rows
                        ?.first()
                        ?.items
                        ?.first()
                        ?.series
                        ?.title,
                )
                awaitComplete()
            }
        }

    @Test
    fun `getEpisodes one-shot - stale cache is served when the network fails, NotFound is not masked`() =
        runTest {
            local.saveEpisodes("s1", listOf(episode("s1", 1)), nowEpochMs = now - 11 * 60_000L)
            server.enqueue(MockResponse(code = 500, body = "{}"))
            val stale = repository.getEpisodes("s1")
            assertEquals(1, (stale as AppResult.Success).value.size)

            server.enqueue(
                MockResponse(
                    code = 404,
                    body = """{"statusCode":404,"code":"SERIES_NOT_FOUND","message":"x","path":"/","timestamp":"t"}""",
                ),
            )
            assertTrue(repository.getEpisodes("s1") is AppResult.Failure)
        }

    @Test
    fun `getEpisodes maps access, duration and rewrites loopback thumbnails`() =
        runTest {
            server.enqueue(MockResponse(code = 200, body = EPISODES_JSON))

            val episodes = (repository.getEpisodes("s1") as AppResult.Success).value

            assertEquals(listOf(1, 2, 3), episodes.map { it.index })
            assertEquals(EpisodeAccess.LOCKED, episodes[2].access)
            assertEquals(10, episodes[2].coinCost)
            assertEquals(30_000L, episodes[0].durationMs)
            assertEquals("http://10.0.2.2:9000/drama-media/hls/samples/ep1/thumbnail.jpg", episodes[0].thumbnailUrl)
            assertEquals(now, local.fetchedAt(episodesKey("s1")))
            // Second call within the TTL: cache hit, no network.
            repository.getEpisodes("s1")
            assertEquals(1, server.requestCount)
        }

    @Test
    fun `getSeries refreshes a stale entry and keeps the synopsis`() =
        runTest {
            local.saveSeries(series("s1", "old"), nowEpochMs = now - 11 * 60_000L)
            server.enqueue(MockResponse(code = 200, body = SERIES_JSON))

            val fresh = (repository.getSeries("s1") as AppResult.Success).value
            assertEquals("Le Secret du Lagon", fresh.title)
            assertEquals("Une famille, un lagon.", fresh.synopsis)
            assertEquals(now, local.fetchedAt(seriesKey("s1")))
        }

    private fun series(
        id: String,
        title: String,
    ) = Series(id, "slug-$id", title, "", null, null, listOf("drame"), 3, 2, 10, "PG12")

    private fun episode(
        seriesId: String,
        index: Int,
    ) = Episode("ep$index", seriesId, index, "Ep $index", 30_000, null, EpisodeAccess.FREE, 0)

    private fun homeContent(title: String) =
        HomeContent(
            banners = emptyList(),
            rows =
                listOf(
                    com.drama.domain.model.HomeRow(
                        "trending",
                        "Tendances",
                        listOf(
                            com.drama.domain.model
                                .HomeItem(series("s1", title)),
                        ),
                    ),
                ),
        )

    /** In-memory stand-in for the Room-backed local source. */
    private class InMemoryCatalogLocalDataSource : CatalogLocalDataSource {
        private val fetched = mutableMapOf<String, Long>()
        private val home = MutableStateFlow<HomeContent?>(null)
        private val series = MutableStateFlow<Map<String, Series>>(emptyMap())
        private val episodes = MutableStateFlow<Map<String, List<Episode>>>(emptyMap())

        override suspend fun fetchedAt(key: String): Long? = fetched[key]

        override suspend fun getHome(): HomeContent? = home.value

        override fun observeHome(): Flow<HomeContent?> = home

        override suspend fun saveHome(
            content: HomeContent,
            nowEpochMs: Long,
        ) {
            home.value = content
            fetched[KEY_HOME] = nowEpochMs
        }

        override suspend fun getSeries(seriesId: String): Series? = series.value[seriesId]

        override fun observeSeries(seriesId: String): Flow<Series?> = MutableStateFlow(series.value[seriesId])

        override suspend fun saveSeries(
            series: Series,
            nowEpochMs: Long,
        ) {
            this.series.update { it + (series.id to series) }
            fetched[seriesKey(series.id)] = nowEpochMs
        }

        override suspend fun getEpisodes(seriesId: String): List<Episode>? = episodes.value[seriesId]

        override fun observeEpisodes(seriesId: String): Flow<List<Episode>?> =
            MutableStateFlow(episodes.value[seriesId])

        override suspend fun saveEpisodes(
            seriesId: String,
            episodes: List<Episode>,
            nowEpochMs: Long,
        ) {
            this.episodes.update { it + (seriesId to episodes) }
            fetched[episodesKey(seriesId)] = nowEpochMs
        }

        override suspend fun clear() {
            fetched.clear()
            home.value = null
            series.value = emptyMap()
            episodes.value = emptyMap()
        }
    }

    private companion object {
        const val SERIES_SUMMARY = """{"id":"s1","slug":"le-secret-du-lagon","title":"Le Secret du Lagon","genres":["romance","drame"],
            "posterVerticalUrl":"https://placehold.co/1080x1920","posterHorizontalUrl":null,"episodeCount":3,
            "freeEpisodeCount":2,"coinCostPerEpisode":10,"ageRating":"PG12","publishedAt":"2026-10-01T08:00:00.000Z"}"""
        const val HOME_JSON =
            """{"banners":[$SERIES_SUMMARY],
            "rows":[{"key":"trending","title":"Tendances","items":[{"series":$SERIES_SUMMARY}]}]}"""
        const val SERIES_JSON = """{"id":"s1","slug":"le-secret-du-lagon","title":"Le Secret du Lagon","genres":["romance"],
            "posterVerticalUrl":null,"posterHorizontalUrl":null,"episodeCount":3,"freeEpisodeCount":2,"coinCostPerEpisode":10,
            "ageRating":"PG12","publishedAt":null,"synopsis":"Une famille, un lagon.","tags":[],"originalLanguage":"fr","status":"PUBLISHED"}"""
        const val EPISODES_JSON = """[
            {"id":"e1","seriesId":"s1","number":1,"title":"L'héritage","durationSeconds":30,
             "thumbnailUrl":"http://localhost:9000/drama-media/hls/samples/ep1/thumbnail.jpg",
             "access":"free","coinCost":0,"subtitleLanguages":["fr"],"publishedAt":null},
            {"id":"e3","seriesId":"s1","number":3,"title":"Le testament","durationSeconds":30,"thumbnailUrl":null,
             "access":"locked","coinCost":10,"subtitleLanguages":[],"publishedAt":null},
            {"id":"e2","seriesId":"s1","number":2,"title":null,"durationSeconds":30,"thumbnailUrl":null,
             "access":"unlocked","coinCost":0,"subtitleLanguages":[],"publishedAt":null}
        ]"""
    }
}
