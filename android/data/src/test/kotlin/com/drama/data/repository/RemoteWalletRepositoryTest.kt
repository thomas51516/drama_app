package com.drama.data.repository

import com.drama.core.common.coroutines.DispatcherProvider
import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.AuthApi
import com.drama.core.network.api.UserApi
import com.drama.core.network.api.WalletApi
import com.drama.core.network.auth.SessionManager
import com.drama.core.network.auth.SessionStore
import com.drama.core.network.auth.StoredSession
import com.drama.data.wallet.WalletStore
import com.drama.domain.model.LedgerBucket
import com.drama.domain.model.LedgerType
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
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

/** `GET /wallet` and `GET /wallet/transactions` with the real v1.4 payloads (object `reference`, bonus expiry). */
class RemoteWalletRepositoryTest {
    private val server = MockWebServer()
    private val store = WalletStore()
    private lateinit var repository: RemoteWalletRepository

    @Before
    fun setUp() {
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse =
                    when (request.url.encodedPath) {
                        "/wallet" -> MockResponse(code = 200, body = WALLET)
                        "/wallet/transactions" -> MockResponse(code = 200, body = TRANSACTIONS)
                        "/me" -> MockResponse(code = 200, body = """{"id":"u1","type":"GUEST","autoUnlock":true}""")
                        else -> MockResponse(code = 404)
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
        val sessionStore =
            object : SessionStore {
                override val session: Flow<StoredSession?> = MutableStateFlow(null)

                override suspend fun read(): StoredSession? = null

                override suspend fun write(session: StoredSession) = Unit

                override suspend fun clear() = Unit
            }
        val dispatchers =
            object : DispatcherProvider {
                override val io: CoroutineDispatcher = Dispatchers.Unconfined
                override val default: CoroutineDispatcher = Dispatchers.Unconfined
                override val main: CoroutineDispatcher = Dispatchers.Unconfined
            }
        repository =
            RemoteWalletRepository(
                api = retrofit.create(WalletApi::class.java),
                userApi = retrofit.create(UserApi::class.java),
                store = store,
                errorMapper = ApiErrorMapper(json),
                logger = NoOpLogger,
                sessionManager =
                    SessionManager(
                        authApi = retrofit.create(AuthApi::class.java),
                        store = sessionStore,
                        deviceIdProvider = { "d" },
                        errorMapper = ApiErrorMapper(json),
                        clock = Clock { 0L },
                        logger = NoOpLogger,
                    ),
                dispatchers = dispatchers,
            )
    }

    @After
    fun tearDown() = server.close()

    @Test
    fun `wallet and ledger map the v1_4 payloads, object references included`() =
        runTest {
            val wallet = (repository.refresh() as AppResult.Success).value
            assertEquals(330, wallet.total)
            assertEquals(30, wallet.bonusExpiring.single().amount)
            assertEquals(wallet, store.wallet.value)

            val page = (repository.transactions(page = 1) as AppResult.Success).value
            assertEquals(2, page.items.size)
            assertEquals(2, page.total)
            assertFalse(page.hasMore)
            val bonus = page.items[0]
            assertEquals(LedgerType.BONUS, bonus.type)
            assertEquals(LedgerBucket.BONUS, bonus.bucket)
            assertEquals("purchase:e948beed", bonus.reference)
            assertEquals("Coin pack bonus", bonus.description)
            assertTrue(bonus.expiresAtEpochMs != null)
            assertEquals(300, page.items[1].amount)
            assertEquals(LedgerType.PURCHASE, page.items[1].type)
        }

    @Test
    fun `setAutoUnlock patches me and updates the mirrored wallet`() =
        runTest {
            repository.refresh()
            assertTrue(repository.setAutoUnlock(true) is AppResult.Success)
            assertEquals(true, store.wallet.value?.autoUnlock)
        }

    private companion object {
        const val WALLET =
            """{"purchased":300,"bonus":30,"total":330,"autoUnlock":false,
               "bonusExpiring":[{"amount":30,"expiresAt":"2026-11-29T15:10:19.723Z"}]}"""
        const val TRANSACTIONS =
            """{"items":[
               {"id":"l2","amount":30,"bucket":"BONUS","type":"BONUS","reference":{"type":"purchase","id":"e948beed"},
                "description":"Coin pack bonus","expiresAt":"2026-11-29T15:10:19.723Z","createdAt":"2026-10-30T15:10:19.734Z"},
               {"id":"l1","amount":300,"bucket":"PURCHASED","type":"PURCHASE","reference":{"type":"purchase","id":"e948beed"},
                "description":"Coin pack purchased","expiresAt":null,"createdAt":"2026-10-30T15:10:19.731Z"}],
               "total":2,"page":1,"pageSize":20}"""
    }
}
