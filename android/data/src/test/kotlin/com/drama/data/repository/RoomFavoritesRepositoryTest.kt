package com.drama.data.repository

import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.core.database.dao.CatalogDao
import com.drama.core.database.dao.FavoritesDao
import com.drama.core.database.entity.CacheMetaEntity
import com.drama.core.database.entity.EpisodeEntity
import com.drama.core.database.entity.FavoriteEntity
import com.drama.core.database.entity.HomeBannerEntity
import com.drama.core.database.entity.HomeRowEntity
import com.drama.core.database.entity.HomeRowItemEntity
import com.drama.core.database.entity.SeriesEntity
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.CatalogApi
import com.drama.core.network.api.UserApi
import com.drama.data.media.MediaUrlResolver
import com.drama.domain.model.LikeState
import com.drama.domain.model.Series
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** Optimistic toggles over MockWebServer: local write first, rollback when the server refuses. */
class RoomFavoritesRepositoryTest {
    private val server = MockWebServer()
    private val favoritesDao = InMemoryFavoritesDao()
    private val catalogDao = InMemoryCatalogDao()
    private lateinit var repository: RoomFavoritesRepository

    /** HTTP status answered by the next mutation; null = success. */
    private var mutationStatus: Int? = null
    private var putRouted = true
    private val requests = mutableListOf<String>()
    private var favoritesBody = """{"items":[],"total":0,"page":1,"pageSize":100}"""

    @Before
    fun setUp() {
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    requests += "${request.method} ${request.url.encodedPath}"
                    val path = request.url.encodedPath
                    return when {
                        request.method == "GET" && path == "/me/favorites" ->
                            MockResponse(
                                code = 200,
                                body = favoritesBody,
                            )
                        path.startsWith("/me/favorites/") && request.method == "PUT" && !putRouted ->
                            MockResponse(code = 404, body = """{"statusCode":404,"code":"NOT_FOUND"}""")
                        path.startsWith("/me/favorites/") ->
                            mutationStatus?.let {
                                MockResponse(
                                    code = it,
                                    body = """{"statusCode":$it,"code":"ERR"}""",
                                )
                            }
                                ?: MockResponse(code = 204)
                        path.endsWith("/like") ->
                            mutationStatus?.let {
                                MockResponse(
                                    code = it,
                                    body = """{"statusCode":$it,"code":"ERR"}""",
                                )
                            }
                                ?: MockResponse(code = 200, body = likeBody(liked = request.method == "POST"))
                        else -> MockResponse(code = 404)
                    }
                }
            }
        server.start()
        val json = Json { ignoreUnknownKeys = true }
        val retrofit =
            Retrofit
                .Builder()
                .baseUrl(server.url("/"))
                .client(OkHttpClient())
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
        repository =
            RoomFavoritesRepository(
                userApi = retrofit.create(UserApi::class.java),
                catalogApi = retrofit.create(CatalogApi::class.java),
                favoritesDao = favoritesDao,
                catalogDao = catalogDao,
                errorMapper = ApiErrorMapper(json),
                media = MediaUrlResolver("http://10.0.2.2:9000/drama-media", rewriteLoopback = false),
                json = json,
                clock = Clock { 1_000L },
                logger = NoOpLogger,
            )
    }

    @After
    fun tearDown() = server.close()

    @Test
    fun `adding a favorite writes locally then PUTs, and rolls back on failure`() =
        runTest {
            val result = repository.setFavorite(series("s1"), favorite = true)
            assertTrue(result is AppResult.Success)
            assertEquals(setOf("s1"), repository.observeFavoriteIds().first())
            assertEquals(listOf("PUT /me/favorites/s1"), requests)
            assertEquals(
                "Série s1",
                repository
                    .observeFavorites()
                    .first()
                    .single()
                    .title,
            )

            mutationStatus = 500
            val failed = repository.setFavorite(series("s2"), favorite = true)
            assertTrue(failed is AppResult.Failure)
            assertEquals(setOf("s1"), repository.observeFavoriteIds().first()) // s2 rolled back
        }

    @Test
    fun `removing a favorite rolls back to the previous row on failure`() =
        runTest {
            repository.setFavorite(series("s1"), favorite = true)
            mutationStatus = 503
            val failed = repository.setFavorite(series("s1"), favorite = false)
            assertTrue(failed is AppResult.Failure)
            assertTrue(repository.observeIsFavorite("s1").first())

            mutationStatus = null
            repository.setFavorite(series("s1"), favorite = false)
            assertFalse(repository.observeIsFavorite("s1").first())
            assertEquals("DELETE /me/favorites/s1", requests.last())
        }

    @Test
    fun `PUT not routed falls back to the v1 POST`() =
        runTest {
            putRouted = false
            val result = repository.setFavorite(series("s1"), favorite = true)
            assertTrue(result is AppResult.Success)
            assertEquals(listOf("PUT /me/favorites/s1", "POST /me/favorites/s1"), requests)
        }

    @Test
    fun `refresh accepts both the v1_2 and the v1 item shapes and replaces the cache`() =
        runTest {
            repository.setFavorite(series("old"), favorite = true)
            favoritesBody =
                """{"items":[${summaryJson("a")},{"series":${summaryJson("b")},"createdAt":"2026-10-29T10:00:00Z"}],
                   "total":2,"page":1,"pageSize":100}"""
            assertTrue(repository.refreshFavorites() is AppResult.Success)
            assertEquals(listOf("a", "b"), repository.observeFavorites().first().map { it.id })
            assertEquals(setOf("a", "b"), repository.observeFavoriteIds().first())
        }

    @Test
    fun `like is optimistic and the server count wins, rollback on failure`() =
        runTest {
            catalogDao.upsertSeries(listOf(entity("s1", likes = 10)))
            val liked = repository.setLiked("s1", liked = true)
            assertEquals(AppResult.Success(LikeState(43, liked = true)), liked)
            assertEquals(LikeState(43, liked = true), repository.observeLikeState("s1").first())

            mutationStatus = 500
            val failed = repository.setLiked("s1", liked = false)
            assertTrue(failed is AppResult.Failure)
            assertEquals(LikeState(43, liked = true), repository.observeLikeState("s1").first())
        }

    private fun likeBody(liked: Boolean) = """{"likes":${if (liked) 43 else 41},"liked":$liked}"""

    private fun series(id: String) = Series(id, id, "Série $id", "", null, null, listOf("drame"), 3, 2, 10, "ALL")

    private fun entity(
        id: String,
        likes: Int?,
    ) = SeriesEntity(id, id, "Série $id", "", null, null, "drame", 3, 2, 10, "ALL", null, 0L, likes = likes)

    private fun summaryJson(id: String) =
        """{"id":"$id","slug":"$id","title":"Série $id","genres":["drame"],"posterVerticalUrl":null,"posterHorizontalUrl":null,
           "episodeCount":3,"freeEpisodeCount":2,"coinCostPerEpisode":10,"ageRating":"ALL","publishedAt":null}"""

    private class InMemoryFavoritesDao : FavoritesDao {
        val rows = MutableStateFlow<Map<String, FavoriteEntity>>(emptyMap())
        lateinit var seriesLookup: () -> Map<String, SeriesEntity>

        override fun observeFavoriteSeries(): Flow<List<SeriesEntity>> =
            rows.map { map ->
                map.values
                    .sortedWith(compareBy<FavoriteEntity> { it.position }.thenByDescending { it.addedAtEpochMs })
                    .mapNotNull { seriesLookup()[it.seriesId] }
            }

        override fun observeIds(): Flow<List<String>> = rows.map { it.keys.toList() }

        override fun observeIsFavorite(seriesId: String): Flow<Boolean> = rows.map { seriesId in it }

        override suspend fun get(seriesId: String): FavoriteEntity? = rows.value[seriesId]

        override suspend fun nextTopPosition(): Int = (rows.value.values.minOfOrNull { it.position } ?: 0) - 1

        override suspend fun upsert(favorite: FavoriteEntity) = rows.update { it + (favorite.seriesId to favorite) }

        override suspend fun upsertAll(favorites: List<FavoriteEntity>) =
            rows.update {
                it +
                    favorites.associateBy { f -> f.seriesId }
            }

        override suspend fun delete(favorite: FavoriteEntity) = rows.update { it - favorite.seriesId }

        override suspend fun deleteById(seriesId: String) = rows.update { it - seriesId }

        override suspend fun clear() = rows.update { emptyMap() }
    }

    private inner class InMemoryCatalogDao : CatalogDao {
        val series = MutableStateFlow<Map<String, SeriesEntity>>(emptyMap())

        init {
            favoritesDao.seriesLookup = { series.value }
        }

        override suspend fun upsertSeries(series: List<SeriesEntity>) =
            this.series.update {
                it +
                    series.associateBy { s -> s.id }
            }

        override suspend fun getSeries(seriesId: String): SeriesEntity? = series.value[seriesId]

        override fun observeSeries(seriesId: String): Flow<SeriesEntity?> = series.map { it[seriesId] }

        override fun observeSeriesByIds(ids: List<String>): Flow<List<SeriesEntity>> =
            series.map { m ->
                ids.mapNotNull {
                    m[it]
                }
            }

        override fun observeAllSeries(): Flow<List<SeriesEntity>> = series.map { it.values.toList() }

        override suspend fun updateLike(
            seriesId: String,
            liked: Boolean,
            likes: Int?,
        ) = series.update { m ->
            m[seriesId]?.let { m + (seriesId to it.copy(liked = liked, likes = likes ?: it.likes)) }
                ?: m
        }

        override suspend fun upsertEpisodes(episodes: List<EpisodeEntity>) = Unit

        override suspend fun deleteEpisodesOfSeries(seriesId: String) = Unit

        override suspend fun getEpisodes(seriesId: String): List<EpisodeEntity> = emptyList()

        override fun observeEpisodes(seriesId: String): Flow<List<EpisodeEntity>> = MutableStateFlow(emptyList())

        override fun observeEpisodesByIds(ids: List<String>): Flow<List<EpisodeEntity>> = MutableStateFlow(emptyList())

        override suspend fun upsertHomeRows(rows: List<HomeRowEntity>) = Unit

        override suspend fun upsertHomeRowItems(items: List<HomeRowItemEntity>) = Unit

        override suspend fun deleteHomeRows() = Unit

        override suspend fun deleteHomeRowItems() = Unit

        override suspend fun upsertHomeBanners(banners: List<HomeBannerEntity>) = Unit

        override suspend fun deleteHomeBanners() = Unit

        override fun observeHomeBanners(): Flow<List<HomeBannerEntity>> = MutableStateFlow(emptyList())

        override fun observeHomeRows(): Flow<List<HomeRowEntity>> = MutableStateFlow(emptyList())

        override fun observeHomeRowItems(): Flow<List<HomeRowItemEntity>> = MutableStateFlow(emptyList())

        override suspend fun upsertCacheMeta(meta: CacheMetaEntity) = Unit

        override suspend fun getFetchedAt(key: String): Long? = null

        override fun observeFetchedAt(key: String): Flow<Long?> = MutableStateFlow(null)

        override suspend fun clearEpisodes() = Unit

        override suspend fun clearSeries() = series.update { emptyMap() }

        override suspend fun clearCacheMeta() = Unit
    }
}
