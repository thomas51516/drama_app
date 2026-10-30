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
    /** FCM token last registered with `PUT /me/devices/push` and the user it was registered for (M-54). */
    val pushToken: String? = null,
    val pushTokenUserId: String? = null,
    /** True once the POST_NOTIFICATIONS prompt was shown. */
    val notificationPromptShown: Boolean = false,
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
                    pushToken = prefs[Keys.PUSH_TOKEN],
                    pushTokenUserId = prefs[Keys.PUSH_TOKEN_USER_ID],
                    notificationPromptShown = prefs[Keys.NOTIFICATION_PROMPT_SHOWN] ?: false,
                )
            }

        suspend fun setRegisteredPushToken(
            token: String?,
            userId: String?,
        ) {
            dataStore.edit { prefs ->
                if (token == null) prefs.remove(Keys.PUSH_TOKEN) else prefs[Keys.PUSH_TOKEN] = token
                if (userId == null) prefs.remove(Keys.PUSH_TOKEN_USER_ID) else prefs[Keys.PUSH_TOKEN_USER_ID] = userId
            }
        }

        suspend fun setNotificationPromptShown(shown: Boolean) {
            dataStore.edit { it[Keys.NOTIFICATION_PROMPT_SHOWN] = shown }
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
            val PUSH_TOKEN = stringPreferencesKey("push_token")
            val PUSH_TOKEN_USER_ID = stringPreferencesKey("push_token_user_id")
            val NOTIFICATION_PROMPT_SHOWN = booleanPreferencesKey("notification_prompt_shown")
        }

        private companion object {
            /** ASCII unit separator: never typed in a search box. */
            const val RECENT_SEPARATOR = "\u001F"
        }
    }
