package com.drama.data.repository

import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.AuthApi
import com.drama.core.network.api.WalletApi
import com.drama.core.network.auth.AuthTokens
import com.drama.core.network.auth.SessionManager
import com.drama.core.network.auth.SessionStore
import com.drama.core.network.auth.StoredSession
import com.drama.data.local.CatalogLocalDataSource
import com.drama.data.wallet.WalletStore
import com.drama.domain.model.Episode
import com.drama.domain.model.HomeContent
import com.drama.domain.model.Series
import com.drama.domain.model.UnlockMethod
import com.drama.domain.repository.UnlockKeyStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** Idempotent unlock (S07-A1-02): one key per (user, episode) until success, 402 mapped, cache flipped. */
class RemoteUnlockRepositoryTest {
    private val server = MockWebServer()
    private val json = Json { ignoreUnknownKeys = true }
    private val keys = InMemoryKeyStore()
    private val walletStore = WalletStore()
    private val catalogLocal = RecordingCatalogLocal()
    private lateinit var repository: RemoteUnlockRepository

    private val unlockBodies = mutableListOf<String>()
    private var answers = ArrayDeque<MockResponse>()

    @Before
    fun setUp() {
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    if (request.url.encodedPath.endsWith("/unlock")) {
                        unlockBodies += request.body?.utf8().orEmpty()
                        return answers.removeFirstOrNull() ?: MockResponse(code = 500)
                    }
                    if (request.url.encodedPath.endsWith("/unlocks")) {
                        return MockResponse(code = 200, body = """{"unlockedEpisodeIds":["e1","e2"]}""")
                    }
                    return MockResponse(code = 404)
                }
            }
        server.start()
        val retrofit =
            Retrofit
                .Builder()
                .baseUrl(server.url("/"))
                .client(OkHttpClient())
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
        val store =
            object : SessionStore {
                private val flow =
                    MutableStateFlow<StoredSession?>(
                        StoredSession("user-1", true, AuthTokens("a", Long.MAX_VALUE, "r", Long.MAX_VALUE)),
                    )
                override val session: Flow<StoredSession?> = flow

                override suspend fun read(): StoredSession? = flow.value

                override suspend fun write(session: StoredSession) {
                    flow.value = session
                }

                override suspend fun clear() {
                    flow.value = null
                }
            }
        val sessionManager =
            SessionManager(
                authApi = retrofit.create(AuthApi::class.java),
                store = store,
                deviceIdProvider = { "device" },
                errorMapper = ApiErrorMapper(json),
                clock = Clock { 0L },
                logger = NoOpLogger,
            )
        repository =
            RemoteUnlockRepository(
                api = retrofit.create(WalletApi::class.java),
                keys = keys,
                walletStore = walletStore,
                catalogLocal = catalogLocal,
                sessionManager = sessionManager,
                errorMapper = ApiErrorMapper(json),
                logger = NoOpLogger,
            )
    }

    @After
    fun tearDown() = server.close()

    @Test
    fun `a failed attempt keeps its idempotency key for the retry, success clears it and flips the cache`() =
        runTest {
            answers.addLast(MockResponse(code = 503, body = """{"statusCode":503,"code":"UNAVAILABLE"}"""))
            answers.addLast(
                MockResponse(
                    code = 200,
                    body =
                        """{"episodeId":"e3","method":"coins","charged":{"bonus":4,"purchased":6},
                           "wallet":{"purchased":44,"bonus":0,"total":44,"autoUnlock":false,"bonusExpiring":[]}}""",
                ),
            )

            val first = repository.unlock("s1", "e3")
            assertTrue(first is AppResult.Failure)
            val second = repository.unlock("s1", "e3")
            val unlock = (second as AppResult.Success).value

            assertEquals(2, unlockBodies.size)
            assertEquals(keyOf(unlockBodies[0]), keyOf(unlockBodies[1]))
            assertTrue(keyOf(unlockBodies[0]).length >= 32)
            assertEquals(UnlockMethod.COINS, unlock.method)
            assertEquals(10, unlock.charged)
            assertEquals(44, walletStore.wallet.value?.total)
            assertEquals(listOf("s1" to listOf("e3")), catalogLocal.unlocked)
            assertTrue(keys.map.isEmpty())

            // A later unlock of the same episode is a new request with a new key.
            answers.addLast(
                MockResponse(
                    code = 200,
                    body = """{"episodeId":"e3","method":"coins","charged":{"bonus":0,"purchased":0}}""",
                ),
            )
            repository.unlock("s1", "e3")
            assertNotEquals(keyOf(unlockBodies[0]), keyOf(unlockBodies[2]))
        }

    @Test
    fun `402 maps to InsufficientCoins with the server figures and releases the key`() =
        runTest {
            answers.addLast(
                MockResponse(
                    code = 402,
                    body = """{"statusCode":402,"code":"INSUFFICIENT_COINS","details":{"cost":10,"balance":3}}""",
                ),
            )
            val result = repository.unlock("s1", "e3") as AppResult.Failure
            val error = result.error as AppError.InsufficientCoins
            assertEquals(10, error.cost)
            assertEquals(3, error.balance)
            assertEquals(7, error.missing)
            assertTrue(keys.map.isEmpty())
            assertTrue(catalogLocal.unlocked.isEmpty())
        }

    @Test
    fun `the draft OpenAPI answer shape is accepted too`() =
        runTest {
            answers.addLast(
                MockResponse(code = 200, body = """{"method":"COINS","coinsDebited":12,"alreadyUnlocked":false}"""),
            )
            val unlock = (repository.unlock("s1", "e9") as AppResult.Success).value
            assertEquals("e9", unlock.episodeId)
            assertEquals(12, unlock.chargedPurchased)
        }

    @Test
    fun `refreshUnlocks marks the server's list as unlocked in the cache`() =
        runTest {
            val result = repository.refreshUnlocks("s1") as AppResult.Success
            assertEquals(setOf("e1", "e2"), result.value)
            assertEquals(listOf("s1" to listOf("e1", "e2")), catalogLocal.unlocked)
        }

    private fun keyOf(body: String): String =
        json
            .parseToJsonElement(body)
            .jsonObject["idempotencyKey"]!!
            .jsonPrimitive.content

    private class InMemoryKeyStore : UnlockKeyStore {
        val map = mutableMapOf<String, String>()

        override suspend fun getOrCreate(
            userId: String,
            episodeId: String,
            generate: () -> String,
        ): String = map.getOrPut("$userId/$episodeId", generate)

        override suspend fun clear(
            userId: String,
            episodeId: String,
        ) {
            map.remove("$userId/$episodeId")
        }
    }

    class RecordingCatalogLocal : CatalogLocalDataSource {
        val unlocked = mutableListOf<Pair<String, List<String>>>()

        override suspend fun fetchedAt(key: String): Long? = null

        override suspend fun getHome(): HomeContent? = null

        override fun observeHome(): Flow<HomeContent?> = flowOf(null)

        override suspend fun saveHome(
            content: HomeContent,
            nowEpochMs: Long,
        ) = Unit

        override suspend fun getSeries(seriesId: String): Series? = null

        override fun observeSeries(seriesId: String): Flow<Series?> = flowOf(null)

        override suspend fun saveSeries(
            series: Series,
            nowEpochMs: Long,
        ) = Unit

        override suspend fun getEpisodes(seriesId: String): List<Episode>? = null

        override fun observeEpisodes(seriesId: String): Flow<List<Episode>?> = flowOf(null)

        override suspend fun saveEpisodes(
            seriesId: String,
            episodes: List<Episode>,
            nowEpochMs: Long,
        ) = Unit

        override suspend fun markEpisodesUnlocked(
            seriesId: String,
            episodeIds: List<String>,
        ) {
            unlocked += seriesId to episodeIds
        }

        override suspend fun clear() = Unit
    }
}
