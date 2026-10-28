package com.drama.core.database.preferences

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

data class UserPreferences(
    val dataSaverEnabled: Boolean = false,
    val playbackSpeed: Float = 1f,
)

/** DataStore-backed user preferences (M-13 speed, M-17 data saver). */
@Singleton
class UserPreferencesDataSource
    @Inject
    constructor(
        private val dataStore: DataStore<Preferences>,
    ) {
        val preferences: Flow<UserPreferences> =
            dataStore.data.map { prefs ->
                UserPreferences(
                    dataSaverEnabled = prefs[Keys.DATA_SAVER] ?: false,
                    playbackSpeed = prefs[Keys.PLAYBACK_SPEED] ?: 1f,
                )
            }

        suspend fun setDataSaverEnabled(enabled: Boolean) {
            dataStore.edit { it[Keys.DATA_SAVER] = enabled }
        }

        suspend fun setPlaybackSpeed(speed: Float) {
            dataStore.edit { it[Keys.PLAYBACK_SPEED] = speed }
        }

        private object Keys {
            val DATA_SAVER = booleanPreferencesKey("data_saver_enabled")
            val PLAYBACK_SPEED = floatPreferencesKey("playback_speed")
        }
    }
