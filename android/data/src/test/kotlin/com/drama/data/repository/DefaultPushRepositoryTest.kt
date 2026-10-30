package com.drama.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import com.drama.core.common.locale.FixedDeviceLocale
import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.push.AppInfoProvider
import com.drama.core.common.push.PushTokenProvider
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.database.preferences.UserPreferencesDataSource
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.NotificationsApi
import com.drama.domain.model.SessionReplacement
import com.drama.domain.model.SessionState
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** FCM token registration (M-54): once per (token, user), re-sent on user change / refresh, removed on logout. */
class DefaultPushRepositoryTest {
    private val server = MockWebServer()
    private val session = FakeSessionRepository()
    private val tokenProvider = FakeTokenProvider()
    private val preferences = UserPreferencesDataSource(InMemoryDataStore())
    private lateinit var repository: DefaultPushRepository

    private val requests = mutableListOf<Triple<String, String, String>>()
    private var registerStatus = 204

    @Before
    fun setUp() {
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    requests +=
                        Triple(request.method.orEmpty(), request.url.encodedPath, request.body?.utf8().orEmpty())
                    return when {
                        request.url.encodedPath == "/me/devices/push" -> MockResponse(code = registerStatus)
                        request.url.encodedPath.startsWith("/me/devices/push/") -> MockResponse(code = 204)
                        else -> MockResponse(code = 404)
                    }
                }
            }
        server.start()
        val json =
            Json {
                ignoreUnknownKeys = true
                encodeDefaults = true
            }
        val retrofit =
            Retrofit
                .Builder()
                .baseUrl(server.url("/"))
                .client(OkHttpClient())
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
        repository =
            DefaultPushRepository(
                api = retrofit.create(NotificationsApi::class.java),
                tokenProvider = tokenProvider,
                preferences = preferences,
                sessionRepository = session,
                deviceLocale = FixedDeviceLocale("fr", "CI"),
                appInfo =
                    object : AppInfoProvider {
                        override val versionName = "0.5.0-test"
                    },
                errorMapper = ApiErrorMapper(json),
                logger = NoOpLogger,
            )
    }

    @After
    fun tearDown() = server.close()

    @Test
    fun `sync registers the token once for a user and skips when nothing changed`() =
        runTest {
            assertTrue(repository.syncToken() is AppResult.Success)
            assertTrue(repository.syncToken() is AppResult.Success)
            val puts = requests.filter { it.first == "PUT" }
            assertEquals(1, puts.size)
            assertEquals("/me/devices/push", puts.first().second)
            assertTrue(puts.first().third.contains("\"token\":\"fcm-token-1\""))
            assertTrue(puts.first().third.contains("\"platform\":\"android\""))
            assertTrue(puts.first().third.contains("\"locale\":\"fr-CI\""))
            assertTrue(puts.first().third.contains("\"appVersion\":\"0.5.0-test\""))
            assertEquals("fcm-token-1", preferences.preferences.first().pushToken)
            assertEquals("guest-1", preferences.preferences.first().pushTokenUserId)
        }

    @Test
    fun `a new user or a refreshed token registers again`() =
        runTest {
            repository.syncToken()
            session.state.value = SessionState.Authenticated("user-2", isGuest = false)
            repository.syncToken()
            repository.onNewToken("fcm-token-2")
            val puts = requests.filter { it.first == "PUT" }
            assertEquals(3, puts.size)
            assertTrue(puts[2].third.contains("fcm-token-2"))
            assertEquals("user-2", preferences.preferences.first().pushTokenUserId)
        }

    @Test
    fun `a failed registration is not remembered so it is retried next time`() =
        runTest {
            registerStatus = 404
            val result = repository.syncToken()
            assertTrue(result is AppResult.Failure && (result.error is AppError.NotFound))
            assertNull(preferences.preferences.first().pushToken)
            registerStatus = 204
            assertTrue(repository.syncToken() is AppResult.Success)
            assertEquals(2, requests.count { it.first == "PUT" })
        }

    @Test
    fun `without a session or a token nothing is sent`() =
        runTest {
            tokenProvider.token = null
            assertTrue(repository.syncToken() is AppResult.Failure)
            tokenProvider.token = "fcm-token-1"
            session.state.value = SessionState.SignedOut
            assertTrue(repository.syncToken() is AppResult.Failure)
            assertTrue(requests.isEmpty())
        }

    @Test
    fun `unregister deletes the registered token and forgets it`() =
        runTest {
            assertTrue(repository.unregister() is AppResult.Success) // nothing registered: no call
            repository.syncToken()
            assertTrue(repository.unregister() is AppResult.Success)
            val deletes = requests.filter { it.first == "DELETE" }
            assertEquals(listOf("/me/devices/push/fcm-token-1"), deletes.map { it.second })
            assertNull(preferences.preferences.first().pushToken)
            // The same token registers again for the next session.
            repository.syncToken()
            assertEquals(2, requests.count { it.first == "PUT" })
        }

    private class FakeSessionRepository : SessionRepository {
        override val state = MutableStateFlow<SessionState>(SessionState.Authenticated("guest-1", isGuest = true))

        override suspend fun ensureSession(): AppResult<SessionState.Authenticated> =
            AppResult.Success(state.value as SessionState.Authenticated)

        override suspend fun logout() {
            state.value = SessionState.SignedOut
        }

        override val sessionReplacement: Flow<SessionReplacement?> = MutableStateFlow(null)

        override fun dismissSessionReplacement() = Unit
    }

    private class FakeTokenProvider : PushTokenProvider {
        var token: String? = "fcm-token-1"

        override suspend fun currentToken(): String? = token
    }

    private class InMemoryDataStore : DataStore<Preferences> {
        private val state = MutableStateFlow<Preferences>(emptyPreferences())
        override val data: Flow<Preferences> = state

        override suspend fun updateData(transform: suspend (t: Preferences) -> Preferences): Preferences {
            val next = transform(state.value.toMutablePreferences())
            state.value = next
            return next
        }
    }
}
