package com.drama.domain.model

/** Authentication state exposed to the UI. Tokens never leave the data layer. */
sealed interface SessionState {
    /** Persisted session not read yet (first frames after process start). */
    data object Unknown : SessionState

    /** Guest bootstrap or refresh in progress and no usable token. */
    data object Connecting : SessionState

    data class Authenticated(
        val userId: String,
        val isGuest: Boolean,
    ) : SessionState

    /** No session: either never created (offline first launch) or cleared by logout / rejected refresh. */
    data object SignedOut : SessionState
}

/** A refresh was rejected and a fresh guest replaced the session (DEF-006). [code] is the server error code. */
data class SessionReplacement(
    val previousUserId: String,
    val previousWasGuest: Boolean,
    val newUserId: String,
    val code: String?,
)
