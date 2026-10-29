package com.drama.core.network.auth

import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.AuthApi
import com.drama.core.network.dto.AuthResponseDto
import com.drama.core.network.dto.GuestAuthRequestDto
import com.drama.core.network.dto.RefreshTokenRequestDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.HttpException
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeParseException
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Owns the guest session (S02-A1-02).
 *
 * - [ensureSession] creates the guest account on first launch (`POST /auth/guest` with the persisted
 *   installation UUID) and is a no-op afterwards.
 * - [recoverFrom401] is the single-flight refresh used by [TokenAuthenticator]: concurrent 401s wait on
 *   the same mutex and callers whose token was already rotated simply get the new one. A refresh token
 *   rejected by the server (`INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_REUSED`, `REFRESH_TOKEN_EXPIRED`)
 *   clears the session and bootstraps a new guest: without account linking (M-50, Sprint 5) a guest whose
 *   refresh token is gone has no other way back in.
 * - [logout] clears the tokens; the next [ensureSession] creates a fresh guest.
 *
 * Tokens are cached in memory after the first read so interceptors do not hit DataStore per request.
 */
@Singleton
class SessionManager
    @Inject
    constructor(
        private val authApi: AuthApi,
        private val store: SessionStore,
        private val deviceIdProvider: DeviceIdProvider,
        private val errorMapper: ApiErrorMapper,
        private val clock: Clock,
        private val logger: Logger,
    ) {
        private val mutex = Mutex()
        private var loaded = false
        private var cached: StoredSession? = null
        private var nextBootstrapAttemptAtMs = 0L
        private var bootstrapFailures = 0

        private val statusFlow = MutableStateFlow<SessionStatus>(SessionStatus.Unknown)
        val status: StateFlow<SessionStatus> = statusFlow.asStateFlow()

        /** Current access token without any network call; null when no session exists yet. */
        suspend fun currentAccessToken(): String? = mutex.withLock { loadLocked()?.tokens?.accessToken }

        suspend fun currentSession(): StoredSession? = mutex.withLock { loadLocked() }

        /**
         * Returns the existing session or creates a guest one. After a failure, further attempts are
         * skipped (returning the same failure) until a backoff elapses, so the `/auth` endpoints rate limits are respected.
         */
        suspend fun ensureSession(): AppResult<StoredSession> =
            mutex.withLock {
                loadLocked()?.let { return AppResult.Success(it) }
                if (clock.nowEpochMs() < nextBootstrapAttemptAtMs) {
                    return AppResult.Failure(AppError.Network(null))
                }
                bootstrapGuestLocked()
            }

        /**
         * Called by the authenticator after a 401. [failedAccessToken] is the bearer that was rejected.
         * Returns the access token to retry with, or null when the request should fail.
         */
        suspend fun recoverFrom401(failedAccessToken: String?): String? =
            mutex.withLock {
                val current = loadLocked()
                if (current != null && current.tokens.accessToken != failedAccessToken) {
                    // Another request already rotated the tokens while we were waiting.
                    return current.tokens.accessToken
                }
                if (current == null) {
                    if (clock.nowEpochMs() < nextBootstrapAttemptAtMs) return null
                    return (bootstrapGuestLocked() as? AppResult.Success)?.value?.tokens?.accessToken
                }
                when (val refreshed = refreshLocked(current)) {
                    is RefreshOutcome.Success -> refreshed.session.tokens.accessToken
                    is RefreshOutcome.Rejected -> {
                        logger.w(TAG, "refresh rejected (${refreshed.error}): clearing session, new guest")
                        clearLocked()
                        (bootstrapGuestLocked() as? AppResult.Success)?.value?.tokens?.accessToken
                    }
                    is RefreshOutcome.Transient -> null
                }
            }

        suspend fun logout() {
            mutex.withLock {
                clearLocked()
                logger.i(TAG, "session cleared (logout)")
            }
        }

        private suspend fun loadLocked(): StoredSession? {
            if (!loaded) {
                cached = store.read()
                loaded = true
                statusFlow.value =
                    cached?.let { SessionStatus.Authenticated(it.userId, it.isGuest) } ?: SessionStatus.SignedOut
            }
            return cached
        }

        private suspend fun bootstrapGuestLocked(): AppResult<StoredSession> {
            statusFlow.value = SessionStatus.Connecting
            val deviceId = deviceIdProvider.deviceId()
            return try {
                val response =
                    authApi.guest(
                        GuestAuthRequestDto(
                            deviceId = deviceId,
                            platform = "android",
                            language = Locale.getDefault().language.ifBlank { "fr" },
                        ),
                    )
                val session = response.toStoredSession(clock.nowEpochMs())
                persistLocked(session)
                bootstrapFailures = 0
                nextBootstrapAttemptAtMs = 0L
                logger.i(TAG, "guest session created user=${session.userId}")
                AppResult.Success(session)
            } catch (e: CancellationException) {
                throw e
            } catch (
                @Suppress("TooGenericExceptionCaught") e: Exception,
            ) {
                bootstrapFailures++
                val backoff = (BOOTSTRAP_BACKOFF_MS shl (bootstrapFailures - 1).coerceAtMost(MAX_BACKOFF_SHIFT))
                nextBootstrapAttemptAtMs = clock.nowEpochMs() + backoff
                statusFlow.value = SessionStatus.SignedOut
                val error = errorMapper.map(e)
                logger.w(TAG, "guest bootstrap failed: $error (next attempt in ${backoff}ms)")
                AppResult.Failure(error)
            }
        }

        private suspend fun refreshLocked(current: StoredSession): RefreshOutcome {
            statusFlow.value = SessionStatus.Connecting
            return try {
                val response = authApi.refresh(RefreshTokenRequestDto(current.tokens.refreshToken))
                val session = response.toStoredSession(clock.nowEpochMs())
                persistLocked(session)
                logger.i(TAG, "tokens rotated user=${session.userId}")
                RefreshOutcome.Success(session)
            } catch (e: CancellationException) {
                throw e
            } catch (e: HttpException) {
                val error = errorMapper.map(e)
                if (e.code() in REJECTED_REFRESH_CODES) {
                    RefreshOutcome.Rejected(error)
                } else {
                    statusFlow.value = SessionStatus.Authenticated(current.userId, current.isGuest)
                    RefreshOutcome.Transient(error)
                }
            } catch (e: IOException) {
                statusFlow.value = SessionStatus.Authenticated(current.userId, current.isGuest)
                RefreshOutcome.Transient(AppError.Network(e))
            }
        }

        private suspend fun persistLocked(session: StoredSession) {
            store.write(session)
            cached = session
            loaded = true
            statusFlow.value = SessionStatus.Authenticated(session.userId, session.isGuest)
        }

        private suspend fun clearLocked() {
            store.clear()
            cached = null
            loaded = true
            statusFlow.value = SessionStatus.SignedOut
        }

        private sealed interface RefreshOutcome {
            data class Success(
                val session: StoredSession,
            ) : RefreshOutcome

            data class Rejected(
                val error: AppError,
            ) : RefreshOutcome

            data class Transient(
                val error: AppError,
            ) : RefreshOutcome
        }

        companion object {
            private const val TAG = "Session"
            private const val BOOTSTRAP_BACKOFF_MS = 2_000L
            private const val MAX_BACKOFF_SHIFT = 5
            private val REJECTED_REFRESH_CODES = setOf(400, 401, 403)

            internal fun AuthResponseDto.toStoredSession(nowEpochMs: Long): StoredSession =
                StoredSession(
                    userId = user.id,
                    isGuest = user.type.equals("GUEST", ignoreCase = true),
                    tokens =
                        AuthTokens(
                            accessToken = tokens.accessToken,
                            accessTokenExpiresAtEpochMs = nowEpochMs + tokens.accessTokenExpiresIn * 1_000,
                            refreshToken = tokens.refreshToken,
                            refreshTokenExpiresAtEpochMs = parseInstant(tokens.refreshTokenExpiresAt) ?: Long.MAX_VALUE,
                        ),
                )

            private fun parseInstant(iso: String): Long? =
                try {
                    Instant.parse(iso).toEpochMilli()
                } catch (_: DateTimeParseException) {
                    null
                }
        }
    }
