package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.SessionState
import kotlinx.coroutines.flow.Flow

interface SessionRepository {
    val state: Flow<SessionState>

    /** Creates the guest session on first launch (`POST /auth/guest`); no-op when a session exists. */
    suspend fun ensureSession(): AppResult<SessionState.Authenticated>

    /** Clears tokens and local user data. The next [ensureSession] creates a fresh guest. */
    suspend fun logout()
}
