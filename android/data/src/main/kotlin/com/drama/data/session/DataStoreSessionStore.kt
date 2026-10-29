package com.drama.data.session

import com.drama.core.database.preferences.PersistedSession
import com.drama.core.database.preferences.SessionPreferencesDataSource
import com.drama.core.network.auth.AuthTokens
import com.drama.core.network.auth.DeviceIdProvider
import com.drama.core.network.auth.SessionStore
import com.drama.core.network.auth.StoredSession
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/** Bridges the network session contract to the encrypted DataStore in :core:database. */
@Singleton
class DataStoreSessionStore
    @Inject
    constructor(
        private val preferences: SessionPreferencesDataSource,
    ) : SessionStore {
        override val session: Flow<StoredSession?> = preferences.session.map { it?.toStored() }

        override suspend fun read(): StoredSession? = preferences.read()?.toStored()

        override suspend fun write(session: StoredSession) = preferences.write(session.toPersisted())

        override suspend fun clear() = preferences.clearSession()

        private fun PersistedSession.toStored() =
            StoredSession(
                userId = userId,
                isGuest = isGuest,
                tokens =
                    AuthTokens(
                        accessToken = accessToken,
                        accessTokenExpiresAtEpochMs = accessTokenExpiresAtEpochMs,
                        refreshToken = refreshToken,
                        refreshTokenExpiresAtEpochMs = refreshTokenExpiresAtEpochMs,
                    ),
            )

        private fun StoredSession.toPersisted() =
            PersistedSession(
                userId = userId,
                isGuest = isGuest,
                accessToken = tokens.accessToken,
                accessTokenExpiresAtEpochMs = tokens.accessTokenExpiresAtEpochMs,
                refreshToken = tokens.refreshToken,
                refreshTokenExpiresAtEpochMs = tokens.refreshTokenExpiresAtEpochMs,
            )
    }

/** Installation UUID generated on first launch and kept in DataStore; never ANDROID_ID or IMEI. */
@Singleton
class InstallationDeviceIdProvider
    @Inject
    constructor(
        private val preferences: SessionPreferencesDataSource,
    ) : DeviceIdProvider {
        override suspend fun deviceId(): String = preferences.installationId()
    }
