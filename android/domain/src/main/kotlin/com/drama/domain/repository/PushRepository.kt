package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import kotlinx.coroutines.flow.Flow

/**
 * FCM device registration (M-54, `PUT /me/devices/push`). The token is registered once per (token, user):
 * at startup / guest bootstrap, after a sign-in or logout (user changes) and on token refresh. It is
 * unregistered before a logout while the bearer of the leaving user is still valid.
 */
interface PushRepository {
    /** True once the POST_NOTIFICATIONS prompt was shown (first favourite or settings), never shown twice. */
    val permissionPromptShown: Flow<Boolean>

    suspend fun markPermissionPromptShown()

    /** Fetches the current FCM token and registers it for the current user when (token, user) changed. */
    suspend fun syncToken(force: Boolean = false): AppResult<Unit>

    /** `FirebaseMessagingService.onNewToken`. */
    suspend fun onNewToken(token: String): AppResult<Unit>

    /** `DELETE /me/devices/push/{token}` for the registered token, then forgets it. */
    suspend fun unregister(): AppResult<Unit>
}
