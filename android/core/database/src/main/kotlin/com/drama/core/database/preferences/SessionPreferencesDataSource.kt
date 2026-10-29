package com.drama.core.database.preferences

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.drama.core.database.di.SessionPreferences
import com.drama.core.database.security.TokenCipher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Raw persisted session; the data layer maps it to the network `StoredSession`. */
data class PersistedSession(
    val userId: String,
    val isGuest: Boolean,
    val accessToken: String,
    val accessTokenExpiresAtEpochMs: Long,
    val refreshToken: String,
    val refreshTokenExpiresAtEpochMs: Long,
)

/**
 * Session + installation id, in a DataStore separate from user preferences so that a logout can wipe it
 * wholesale. Tokens are encrypted with [TokenCipher]; the installation id (a random UUID) is not secret.
 */
@Singleton
class SessionPreferencesDataSource
    @Inject
    constructor(
        @SessionPreferences private val dataStore: DataStore<Preferences>,
        private val cipher: TokenCipher,
    ) {
        val session: Flow<PersistedSession?> = dataStore.data.map { it.toSession() }

        suspend fun read(): PersistedSession? = dataStore.data.first().toSession()

        suspend fun write(session: PersistedSession) {
            dataStore.edit { prefs ->
                prefs[Keys.USER_ID] = session.userId
                prefs[Keys.IS_GUEST] = session.isGuest
                prefs[Keys.ACCESS_TOKEN] = cipher.encrypt(session.accessToken)
                prefs[Keys.ACCESS_EXPIRES_AT] = session.accessTokenExpiresAtEpochMs
                prefs[Keys.REFRESH_TOKEN] = cipher.encrypt(session.refreshToken)
                prefs[Keys.REFRESH_EXPIRES_AT] = session.refreshTokenExpiresAtEpochMs
            }
        }

        suspend fun clearSession() {
            dataStore.edit { prefs ->
                listOf(
                    Keys.USER_ID,
                    Keys.IS_GUEST,
                    Keys.ACCESS_TOKEN,
                    Keys.ACCESS_EXPIRES_AT,
                    Keys.REFRESH_TOKEN,
                    Keys.REFRESH_EXPIRES_AT,
                ).forEach { prefs.remove(it) }
            }
        }

        /** Generated once per installation (survives logout, not reinstall). */
        suspend fun installationId(): String {
            dataStore.data.first()[Keys.INSTALLATION_ID]?.let { return it }
            val generated = UUID.randomUUID().toString()
            val prefs =
                dataStore.edit { prefs ->
                    if (prefs[Keys.INSTALLATION_ID] ==
                        null
                    ) {
                        prefs[Keys.INSTALLATION_ID] = generated
                    }
                }
            return prefs[Keys.INSTALLATION_ID] ?: generated
        }

        private fun Preferences.toSession(): PersistedSession? {
            val userId = this[Keys.USER_ID] ?: return null
            val access = this[Keys.ACCESS_TOKEN]?.let(cipher::decrypt) ?: return null
            val refresh = this[Keys.REFRESH_TOKEN]?.let(cipher::decrypt) ?: return null
            return PersistedSession(
                userId = userId,
                isGuest = this[Keys.IS_GUEST] ?: true,
                accessToken = access,
                accessTokenExpiresAtEpochMs = this[Keys.ACCESS_EXPIRES_AT] ?: 0L,
                refreshToken = refresh,
                refreshTokenExpiresAtEpochMs = this[Keys.REFRESH_EXPIRES_AT] ?: Long.MAX_VALUE,
            )
        }

        private object Keys {
            val INSTALLATION_ID = stringPreferencesKey("installation_id")
            val USER_ID = stringPreferencesKey("user_id")
            val IS_GUEST = booleanPreferencesKey("is_guest")
            val ACCESS_TOKEN = stringPreferencesKey("access_token_enc")
            val ACCESS_EXPIRES_AT = longPreferencesKey("access_token_expires_at")
            val REFRESH_TOKEN = stringPreferencesKey("refresh_token_enc")
            val REFRESH_EXPIRES_AT = longPreferencesKey("refresh_token_expires_at")
        }
    }
