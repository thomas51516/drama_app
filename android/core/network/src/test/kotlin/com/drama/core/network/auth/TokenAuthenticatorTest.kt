package com.drama.core.network.auth

import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.AuthApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** End-to-end through OkHttp + MockWebServer: 401 -> single-flight refresh -> retry with the rotated token. */
class TokenAuthenticatorTest {
    private val server = MockWebServer()
    private val store = InMemorySessionStore()
    private lateinit var sessionManager: SessionManager
    private lateinit var client: OkHttpClient

    /** Access tokens the server currently accepts; everything else is answered 401. */
    private val validTokens = mutableSetOf<String>()
    private val refreshCalls = AtomicInteger()
    private val guestCalls = AtomicInteger()
    private var refreshAnswer: (RecordedRequest) -> MockResponse = { rotate("refresh") }
    private var tokenCounter = 0

    @Before
    fun setUp() {
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse =
                    when (request.url.encodedPath) {
                        "/auth/guest" -> {
                            guestCalls.incrementAndGet()
                            rotate("guest")
                        }
                        "/auth/refresh" -> {
                            refreshCalls.incrementAndGet()
                            refreshAnswer(request)
                        }
                        else -> {
                            val token = request.headers["Authorization"]?.removePrefix("Bearer ")
                            if (token != null && token in validTokens) {
                                MockResponse(code = 200, body = """{"ok":true,"token":"$token"}""")
                            } else {
                                MockResponse(code = 401, body = apiError(401, "INVALID_TOKEN"))
                            }
                        }
                    }
            }
        server.start()

        val json =
            Json {
                ignoreUnknownKeys = true
                explicitNulls = false
            }
        val bare = OkHttpClient.Builder().build()
        val authApi =
            Retrofit
                .Builder()
                .baseUrl(server.url("/"))
                .client(bare)
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
                .create(AuthApi::class.java)
        sessionManager =
            SessionManager(
                authApi = authApi,
                store = store,
                deviceIdProvider = { "test-device-0001" },
                errorMapper = ApiErrorMapper(json),
                clock = Clock { 1_000L },
                logger = NoOpLogger,
            )
        client =
            bare
                .newBuilder()
                .addInterceptor(AuthInterceptor(sessionManager))
                .authenticator(TokenAuthenticator(sessionManager))
                .build()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun apiError(
        status: Int,
        code: String,
    ) = """{"statusCode":$status,"code":"$code","message":"x","path":"/","timestamp":"t"}"""

    private fun rotate(prefix: String): MockResponse {
        val access = "$prefix-access-${++tokenCounter}"
        validTokens += access
        return MockResponse(
            code = 200,
            body =
                """{"user":{"id":"u1","type":"GUEST","status":"ACTIVE","language":"fr","country":null,"isVip":false,
                   "vipExpiresAt":null,"createdAt":"2026-10-28T00:00:00.000Z"},
                   "tokens":{"tokenType":"Bearer","accessToken":"$access","accessTokenExpiresIn":900,
                   "refreshToken":"$prefix-refresh-$tokenCounter-0123456789abcdef0123456789abcdef",
                   "refreshTokenExpiresAt":"2026-11-27T00:00:00.000Z"}}""",
        )
    }

    private fun seedSession(
        access: String,
        refresh: String = "seed-refresh-0123456789abcdef0123456789abcdef",
    ) {
        runBlocking {
            store.write(StoredSession("u1", true, AuthTokens(access, 10_000L, refresh, Long.MAX_VALUE)))
        }
    }

    private fun get(path: String) = client.newCall(Request.Builder().url(server.url(path)).build()).execute()

    @Test
    fun `first request without a session creates a guest and carries its bearer`() {
        val response = get("/home")

        assertEquals(200, response.code)
        assertEquals(1, guestCalls.get())
        assertEquals("guest-access-1", store.current?.tokens?.accessToken)
        assertTrue(sessionManager.status.value is SessionStatus.Authenticated)
    }

    @Test
    fun `401 triggers a refresh, rotates the stored tokens and retries once`() {
        seedSession(access = "expired-access")

        val response = get("/series/1/episodes")

        assertEquals(200, response.code)
        assertEquals(1, refreshCalls.get())
        assertEquals(0, guestCalls.get())
        assertEquals("refresh-access-1", store.current?.tokens?.accessToken)
        assertTrue(
            store.current
                ?.tokens
                ?.refreshToken
                ?.startsWith("refresh-refresh-1") == true,
        )
        assertEquals("Bearer refresh-access-1", response.request.header("Authorization"))
        // The 401 attempt, then the retry: no infinite loop.
        assertNotNull(response.priorResponse)
        assertNull(response.priorResponse?.priorResponse)
    }

    @Test
    fun `concurrent 401s share a single refresh`() {
        seedSession(access = "expired-access")
        val threads = 6
        val pool = Executors.newFixedThreadPool(threads)
        val ready = CountDownLatch(threads)
        val results =
            (1..threads).map {
                pool.submit<Int> {
                    ready.countDown()
                    ready.await()
                    get("/home").code
                }
            }

        assertTrue(results.all { it.get(10, TimeUnit.SECONDS) == 200 })
        assertEquals(1, refreshCalls.get())
        assertEquals(0, guestCalls.get())
        pool.shutdown()
    }

    @Test
    fun `rejected refresh clears the session and falls back to a new guest`() {
        seedSession(access = "expired-access", refresh = "revoked-refresh-0123456789abcdef0123456789abcdef")
        refreshAnswer = { MockResponse(code = 401, body = apiError(401, "REFRESH_TOKEN_REUSED")) }

        val response = get("/home")

        assertEquals(200, response.code)
        assertEquals(1, refreshCalls.get())
        assertEquals(1, guestCalls.get())
        assertEquals("guest-access-1", store.current?.tokens?.accessToken)
    }

    @Test
    fun `a server that keeps answering 401 does not loop`() {
        seedSession(access = "expired-access")
        refreshAnswer = { rotate("refresh").also { validTokens.clear() } }

        val response = get("/home")

        assertEquals(401, response.code)
        assertEquals(1, refreshCalls.get())
        assertEquals(2, server.requestCount - refreshCalls.get())
    }

    @Test
    fun `logout clears the stored session`() {
        seedSession(access = "a")
        runBlocking { sessionManager.logout() }
        assertNull(store.current)
        assertEquals(SessionStatus.SignedOut, sessionManager.status.value)
        runBlocking { assertTrue(sessionManager.ensureSession() is AppResult.Success) }
        assertEquals(1, guestCalls.get())
    }

    @Test
    fun `DEF-006 - a rejected refresh publishes the replaced session with the previous user id and the code`() {
        seedSession(access = "expired-access", refresh = "revoked-refresh-0123456789abcdef0123456789abcdef")
        refreshAnswer = { MockResponse(code = 401, body = apiError(401, "REFRESH_TOKEN_EXPIRED")) }
        assertNull(sessionManager.replacement.value)

        assertEquals(200, get("/home").code)

        val replaced = sessionManager.replacement.value
        assertNotNull(replaced)
        assertEquals("u1", replaced?.previousUserId)
        assertEquals(true, replaced?.previousWasGuest)
        assertEquals("REFRESH_TOKEN_EXPIRED", replaced?.code)
        assertEquals(store.current?.userId, replaced?.newUserId)

        sessionManager.dismissReplacement()
        assertNull(sessionManager.replacement.value)
    }

    private class InMemorySessionStore : SessionStore {
        private val flow = MutableStateFlow<StoredSession?>(null)
        val current: StoredSession? get() = flow.value
        override val session: Flow<StoredSession?> = flow

        override suspend fun read(): StoredSession? = flow.value

        override suspend fun write(session: StoredSession) {
            flow.value = session
        }

        override suspend fun clear() {
            flow.value = null
        }
    }
}
