package com.drama.core.network.auth

import kotlinx.coroutines.flow.Flow

data class AuthTokens(
    val accessToken: String,
    val accessTokenExpiresAtEpochMs: Long,
    val refreshToken: String,
    val refreshTokenExpiresAtEpochMs: Long,
)

/** What the data layer persists (DataStore, tokens encrypted). */
data class StoredSession(
    val userId: String,
    val isGuest: Boolean,
    val tokens: AuthTokens,
)

/** Session as seen by the rest of the app; mapped to the domain `SessionState` in :data. */
sealed interface SessionStatus {
    data object Unknown : SessionStatus

    data object Connecting : SessionStatus

    data class Authenticated(
        val userId: String,
        val isGuest: Boolean,
    ) : SessionStatus

    data object SignedOut : SessionStatus
}

/** Persistence of the session; implemented over DataStore in :data so :core:network stays storage-agnostic. */
interface SessionStore {
    val session: Flow<StoredSession?>

    suspend fun read(): StoredSession?

    suspend fun write(session: StoredSession)

    suspend fun clear()
}

/** Stable, app-generated installation id (UUID persisted on first launch). Never a hardware identifier. */
fun interface DeviceIdProvider {
    suspend fun deviceId(): String
}
