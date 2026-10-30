package com.drama.core.database.preferences

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

data class UserPreferences(
    val dataSaverEnabled: Boolean = false,
    val playbackSpeed: Float = 1f,
    /** Maximum video height in pixels; 0 = automatic (ABR). */
    val maxVideoHeight: Int = 0,
    /** `auto`, `off` or an ISO 639-1 code; null when never chosen (= auto). */
    val subtitleMode: String? = null,
    /** Recent search queries, most recent first (M-03). */
    val recentSearches: List<String> = emptyList(),
)

/** DataStore-backed user preferences (M-13 speed and quality, M-14 subtitles, M-17 data saver). */
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
                    maxVideoHeight = prefs[Keys.MAX_VIDEO_HEIGHT] ?: 0,
                    subtitleMode = prefs[Keys.SUBTITLE_MODE],
                    recentSearches = prefs[Keys.RECENT_SEARCHES].toSearchList(),
                )
            }

        suspend fun setDataSaverEnabled(enabled: Boolean) {
            dataStore.edit { it[Keys.DATA_SAVER] = enabled }
        }

        suspend fun setPlaybackSpeed(speed: Float) {
            dataStore.edit { it[Keys.PLAYBACK_SPEED] = speed }
        }

        suspend fun setMaxVideoHeight(maxHeight: Int) {
            dataStore.edit { it[Keys.MAX_VIDEO_HEIGHT] = maxHeight }
        }

        suspend fun setSubtitleMode(mode: String) {
            dataStore.edit { it[Keys.SUBTITLE_MODE] = mode }
        }

        /** Stored as one string (a string set would lose the order). */
        suspend fun setRecentSearches(queries: List<String>) {
            dataStore.edit { it[Keys.RECENT_SEARCHES] = queries.joinToString(RECENT_SEPARATOR) }
        }

        private fun String?.toSearchList(): List<String> =
            this?.split(RECENT_SEPARATOR)?.filter { it.isNotBlank() }.orEmpty()

        private object Keys {
            val DATA_SAVER = booleanPreferencesKey("data_saver_enabled")
            val PLAYBACK_SPEED = floatPreferencesKey("playback_speed")
            val MAX_VIDEO_HEIGHT = intPreferencesKey("max_video_height")
            val SUBTITLE_MODE = stringPreferencesKey("subtitle_mode")
            val RECENT_SEARCHES = stringPreferencesKey("recent_searches")
        }

        private companion object {
            /** ASCII unit separator: never typed in a search box. */
            const val RECENT_SEPARATOR = "\u001F"
        }
    }
