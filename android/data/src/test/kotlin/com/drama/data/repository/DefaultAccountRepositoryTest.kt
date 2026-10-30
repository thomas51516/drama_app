package com.drama.data.repository

import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.AccountAuthApi
import com.drama.core.network.api.AuthApi
import com.drama.core.network.api.UserApi
import com.drama.core.network.auth.SessionManager
import com.drama.core.network.auth.SessionStore
import com.drama.core.network.auth.StoredSession
import com.drama.data.local.CatalogLocalDataSource
import com.drama.domain.model.AuthProvider
import com.drama.domain.model.Episode
import com.drama.domain.model.HomeContent
import com.drama.domain.model.LikeState
import com.drama.domain.model.Series
import com.drama.domain.model.SessionReplacement
import com.drama.domain.model.SessionState
import com.drama.domain.repository.FavoritesRepository
import com.drama.domain.repository.PushRepository
import com.drama.domain.repository.SessionRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** Contract v1.2 sign-in flows against MockWebServer: tolerant OTP shapes, session replacement, logout. */
class DefaultAccountRepositoryTest {
    private val server = MockWebServer()
    private val store = InMemorySessionStore()
    private val sessionRepository = FakeSessionRepository()
    private val favorites = FakeFavorites()
    private val push = FakePush()
    private val catalogLocal = FakeCatalogLocal()
    private lateinit var sessionManager: SessionManager
    private lateinit var repository: DefaultAccountRepository

    private val requests = mutableListOf<Pair<String, String>>()
    private var otpRequestBody = """{"requestId":"req-1","expiresIn":300,"resendAfter":60}"""
    private var verifyAcceptsLegacyOnly = false

    @Before
    fun setUp() {
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    val body = request.body?.utf8().orEmpty()
                    requests += request.url.encodedPath to body
                    return when (request.url.encodedPath) {
                        "/auth/otp/request" -> MockResponse(code = 200, body = otpRequestBody)
                        "/auth/otp/verify" ->
                            if (verifyAcceptsLegacyOnly && !body.contains("challengeId")) {
                                MockResponse(code = 400, body = """{"statusCode":400,"code":"VALIDATION_ERROR"}""")
                            } else {
                                MockResponse(code = 200, body = authSessionV12(linked = true))
                            }
                        "/auth/email/login" ->
                            MockResponse(code = 401, body = """{"statusCode":401,"code":"INVALID_CREDENTIALS"}""")
                        "/auth/email/register" -> MockResponse(code = 201, body = authSessionV1())
                        "/auth/logout" -> MockResponse(code = 204)
                        "/me" -> MockResponse(code = 200, body = USER_V12)
                        else -> MockResponse(code = 404)
                    }
                }
            }
        server.start()
        val json =
            Json {
                ignoreUnknownKeys = true
                explicitNulls = false
            }
        val retrofit =
            Retrofit
                .Builder()
                .baseUrl(server.url("/"))
                .client(OkHttpClient())
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
        val mapper = ApiErrorMapper(json)
        sessionManager =
            SessionManager(
                authApi = retrofit.create(AuthApi::class.java),
                store = store,
                deviceIdProvider = { "install-1234" },
                errorMapper = mapper,
                clock = Clock { 1_000L },
                logger = NoOpLogger,
            )
        repository =
            DefaultAccountRepository(
                authApi = retrofit.create(AccountAuthApi::class.java),
                userApi = retrofit.create(UserApi::class.java),
                sessionManager = sessionManager,
                sessionRepository = sessionRepository,
                favorites = favorites,
                push = push,
                catalogLocal = catalogLocal,
                deviceIdProvider = { "install-1234" },
                errorMapper = mapper,
                logger = NoOpLogger,
            )
    }

    @After
    fun tearDown() = server.close()

    @Test
    fun `otp request maps the v1_2 shape and the v1 stub shape`() =
        runTest {
            val v12 = repository.requestOtp("+22890000000")
            assertEquals("req-1", (v12 as AppResult.Success).value.requestId)
            assertEquals(60, v12.value.resendAfterSeconds)
            assertEquals("""{"phone":"+22890000000"}""", requests.last().second)

            otpRequestBody = """{"challengeId":"ch-9","expiresIn":300,"resendAfterSeconds":45}"""
            val v1 = repository.requestOtp("+22890000000")
            assertEquals("ch-9", (v1 as AppResult.Success).value.requestId)
            assertEquals(45, v1.value.resendAfterSeconds)
        }

    @Test
    fun `otp verify replaces the session with the flat v1_2 tokens and reports linked`() =
        runTest {
            val result = repository.verifyOtp("req-1", "123456")
            val signIn = (result as AppResult.Success).value
            assertTrue(signIn.linked)
            assertEquals(listOf(AuthProvider.PHONE), signIn.user.providers)
            assertEquals("+22890000000", signIn.user.phone)
            val stored = store.read()
            assertNotNull(stored)
            assertEquals("access-v12", stored!!.tokens.accessToken)
            assertEquals("refresh-v12", stored.tokens.refreshToken)
            assertFalse(stored.isGuest)
            assertEquals(1_000L + 900 * 1_000L, stored.tokens.accessTokenExpiresAtEpochMs)
            assertEquals(signIn.user, repository.profile.first())
            assertTrue(requests.last().second.contains("\"requestId\":\"req-1\""))
            assertFalse(requests.last().second.contains("challengeId"))
        }

    @Test
    fun `otp verify retries with the legacy challengeId key when the server rejects requestId`() =
        runTest {
            verifyAcceptsLegacyOnly = true
            val result = repository.verifyOtp("req-1", "123456")
            assertTrue(result is AppResult.Success)
            val verifyBodies = requests.filter { it.first == "/auth/otp/verify" }.map { it.second }
            assertEquals(2, verifyBodies.size)
            assertTrue(verifyBodies[1].contains("\"challengeId\":\"req-1\""))
        }

    @Test
    fun `email register accepts the v1 nested tokens and wrong credentials surface as unauthenticated`() =
        runTest {
            val registered = repository.registerWithEmail("thomas@example.com", "longenough")
            assertTrue(registered is AppResult.Success)
            assertEquals("access-v1", store.read()!!.tokens.accessToken)
            assertTrue(requests.last().second.contains("\"deviceId\":\"install-1234\""))

            val login = repository.signInWithEmail("thomas@example.com", "wrong")
            assertTrue((login as AppResult.Failure).error is com.drama.core.common.result.AppError.Unauthenticated)
        }

    @Test
    fun `logout revokes the refresh token, wipes local data and opens a new guest`() =
        runTest {
            repository.verifyOtp("req-1", "123456")
            val result = repository.logout()
            assertTrue(result is AppResult.Success)
            assertEquals("""{"refreshToken":"refresh-v12"}""", requests.first { it.first == "/auth/logout" }.second)
            assertEquals(1, sessionRepository.logouts)
            assertEquals(1, sessionRepository.ensureCalls)
            assertEquals(1, favorites.clears)
            assertEquals(1, push.unregisters)
            assertEquals(null, repository.profile.first())
        }

    private class FakePush : PushRepository {
        var unregisters = 0
        override val permissionPromptShown: Flow<Boolean> = MutableStateFlow(false)

        override suspend fun markPermissionPromptShown() = Unit

        override suspend fun syncToken(force: Boolean): AppResult<Unit> = AppResult.Success(Unit)

        override suspend fun onNewToken(token: String): AppResult<Unit> = AppResult.Success(Unit)

        override suspend fun unregister(): AppResult<Unit> {
            unregisters++
            return AppResult.Success(Unit)
        }
    }

    private class FakeCatalogLocal : CatalogLocalDataSource {
        var clears = 0

        override suspend fun fetchedAt(key: String): Long? = null

        override suspend fun getHome(): HomeContent? = null

        override fun observeHome(): Flow<HomeContent?> = MutableStateFlow(null)

        override suspend fun saveHome(
            content: HomeContent,
            nowEpochMs: Long,
        ) = Unit

        override suspend fun getSeries(seriesId: String): Series? = null

        override fun observeSeries(seriesId: String): Flow<Series?> = MutableStateFlow(null)

        override suspend fun saveSeries(
            series: Series,
            nowEpochMs: Long,
        ) = Unit

        override suspend fun getEpisodes(seriesId: String): List<Episode>? = null

        override fun observeEpisodes(seriesId: String): Flow<List<Episode>?> = MutableStateFlow(null)

        override suspend fun saveEpisodes(
            seriesId: String,
            episodes: List<Episode>,
            nowEpochMs: Long,
        ) = Unit

        override suspend fun markEpisodesUnlocked(
            seriesId: String,
            episodeIds: List<String>,
        ) = Unit

        override suspend fun clear() {
            clears++
        }
    }

    private class InMemorySessionStore : SessionStore {
        private val state = MutableStateFlow<StoredSession?>(null)
        override val session: Flow<StoredSession?> = state

        override suspend fun read(): StoredSession? = state.value

        override suspend fun write(session: StoredSession) {
            state.value = session
        }

        override suspend fun clear() {
            state.value = null
        }
    }

    private class FakeSessionRepository : SessionRepository {
        var logouts = 0
        var ensureCalls = 0
        override val state: Flow<SessionState> = MutableStateFlow(SessionState.Unknown)

        override suspend fun ensureSession(): AppResult<SessionState.Authenticated> {
            ensureCalls++
            return AppResult.Success(SessionState.Authenticated("guest-2", isGuest = true))
        }

        override suspend fun logout() {
            logouts++
        }

        override val sessionReplacement: Flow<SessionReplacement?> = MutableStateFlow(null)

        override fun dismissSessionReplacement() = Unit
    }

    private class FakeFavorites : FavoritesRepository {
        var clears = 0

        override fun observeFavorites(): Flow<List<Series>> = MutableStateFlow(emptyList())

        override fun observeFavoriteIds(): Flow<Set<String>> = MutableStateFlow(emptySet())

        override fun observeIsFavorite(seriesId: String): Flow<Boolean> = MutableStateFlow(false)

        override suspend fun refreshFavorites(): AppResult<Unit> = AppResult.Success(Unit)

        override suspend fun setFavorite(
            series: Series,
            favorite: Boolean,
        ): AppResult<Unit> = AppResult.Success(Unit)

        override fun observeLikeState(seriesId: String): Flow<LikeState?> = MutableStateFlow(null)

        override suspend fun setLiked(
            seriesId: String,
            liked: Boolean,
        ): AppResult<LikeState> = AppResult.Success(LikeState(0, liked))

        override suspend fun clear() {
            clears++
        }
    }

    private companion object {
        const val USER_V12 =
            """{"id":"u1","type":"REGISTERED","displayName":null,"email":null,"phone":"+22890000000","country":"TG",
               "language":"fr","vipStatus":"none","vipExpiresAt":null,"providers":["phone"],"createdAt":"2026-10-29T10:00:00.000Z"}"""

        fun authSessionV12(linked: Boolean) =
            """{"accessToken":"access-v12","refreshToken":"refresh-v12","expiresIn":900,"user":$USER_V12,"linked":$linked}"""

        fun authSessionV1() =
            """{"user":{"id":"u2","type":"REGISTERED","status":"ACTIVE","language":"fr","country":null,"isVip":false,
               "vipExpiresAt":null,"createdAt":"2026-10-29T10:00:00.000Z"},
               "tokens":{"tokenType":"Bearer","accessToken":"access-v1","accessTokenExpiresIn":900,
               "refreshToken":"refresh-v1","refreshTokenExpiresAt":"2026-11-28T10:00:00.000Z"}}"""
    }
}
