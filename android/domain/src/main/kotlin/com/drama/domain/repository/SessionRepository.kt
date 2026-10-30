package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.SessionReplacement
import com.drama.domain.model.SessionState
import kotlinx.coroutines.flow.Flow

interface SessionRepository {
    val state: Flow<SessionState>

    /**
     * Set when a rejected refresh forced a new guest session (DEF-006): the UI shows a dismissible banner so
     * the viewer knows the previous account is gone until they sign in again. Null once dismissed.
     */
    val sessionReplacement: Flow<SessionReplacement?>

    fun dismissSessionReplacement()

    /** Creates the guest session on first launch (`POST /auth/guest`); no-op when a session exists. */
    suspend fun ensureSession(): AppResult<SessionState.Authenticated>

    /** Clears tokens and local user data. The next [ensureSession] creates a fresh guest. */
    suspend fun logout()
}
