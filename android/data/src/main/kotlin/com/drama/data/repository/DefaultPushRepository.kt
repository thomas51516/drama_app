package com.drama.data.repository

import com.drama.core.common.locale.DeviceLocaleProvider
import com.drama.core.common.logging.Logger
import com.drama.core.common.push.AppInfoProvider
import com.drama.core.common.push.PushTokenProvider
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.database.preferences.UserPreferencesDataSource
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.NotificationsApi
import com.drama.core.network.callUnit
import com.drama.core.network.dto.PushDeviceRequestDto
import com.drama.domain.model.SessionState
import com.drama.domain.repository.PushRepository
import com.drama.domain.repository.SessionRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * FCM registration (S06-A1-02). `PUT /me/devices/push` is idempotent (upsert by token) but is only sent when
 * the (token, user) pair differs from the last successful registration, so a cold start costs no request.
 * A 404/501 from a backend that has not shipped the endpoint yet is logged and treated as "retry later".
 *
 * DEF-011: the startup sync and `onNewToken` race at first launch. Both go through one mutex and both compare the
 * (token, user) pair with the persisted registration, so the second caller finds the first one's result and sends
 * nothing: one `PUT` per (token, user) per process, whatever the order of the callers.
 */
@Singleton
class DefaultPushRepository
    @Inject
    constructor(
        private val api: NotificationsApi,
        private val tokenProvider: PushTokenProvider,
        private val preferences: UserPreferencesDataSource,
        private val sessionRepository: SessionRepository,
        private val deviceLocale: DeviceLocaleProvider,
        private val appInfo: AppInfoProvider,
        private val errorMapper: ApiErrorMapper,
        private val logger: Logger,
    ) : PushRepository {
        private val mutex = Mutex()

        override val permissionPromptShown: Flow<Boolean> = preferences.preferences.map { it.notificationPromptShown }

        override suspend fun markPermissionPromptShown() = preferences.setNotificationPromptShown(true)

        override suspend fun syncToken(force: Boolean): AppResult<Unit> {
            val token =
                tokenProvider.currentToken()
                    ?: return AppResult.Failure(AppError.Unknown(IllegalStateException("no push token")))
            return register(token, force)
        }

        /** A refreshed token differs from the registered one and registers; the same token again is a no-op. */
        override suspend fun onNewToken(token: String): AppResult<Unit> = register(token, force = false)

        override suspend fun unregister(): AppResult<Unit> =
            mutex.withLock {
                val prefs = preferences.preferences.first()
                val token = prefs.pushToken ?: return@withLock AppResult.Success(Unit)
                val result = errorMapper.callUnit { api.unregisterPushDevice(token) }
                when (result) {
                    is AppResult.Success -> logger.i(TAG, "push token unregistered user=${prefs.pushTokenUserId}")
                    is AppResult.Failure -> logger.w(TAG, "push token unregistration failed: ${result.error}")
                }
                // Forget it either way: the next session registers again for its own user.
                preferences.setRegisteredPushToken(null, null)
                result
            }

        private suspend fun register(
            token: String,
            force: Boolean,
        ): AppResult<Unit> =
            mutex.withLock {
                val session = sessionRepository.state.first { it !is SessionState.Unknown }
                val userId =
                    (session as? SessionState.Authenticated)?.userId
                        ?: return@withLock AppResult.Failure(AppError.Unauthenticated())
                val prefs = preferences.preferences.first()
                if (!force && prefs.pushToken == token && prefs.pushTokenUserId == userId) {
                    return@withLock AppResult.Success(Unit)
                }
                val result =
                    errorMapper.callUnit {
                        api.registerPushDevice(
                            PushDeviceRequestDto(
                                token = token,
                                platform = "android",
                                locale = deviceLocale.languageTag,
                                appVersion = appInfo.versionName,
                            ),
                        )
                    }
                when (result) {
                    is AppResult.Success -> {
                        preferences.setRegisteredPushToken(token, userId)
                        logger.i(TAG, "push token registered user=$userId token=${token.take(TOKEN_PREVIEW)}…")
                    }
                    is AppResult.Failure -> logger.w(TAG, "push token registration failed: ${result.error}")
                }
                result
            }

        private companion object {
            const val TAG = "Push"
            const val TOKEN_PREVIEW = 12
        }
    }
