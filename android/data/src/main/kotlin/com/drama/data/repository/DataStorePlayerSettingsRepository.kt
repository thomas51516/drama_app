package com.drama.data.repository

import com.drama.core.database.preferences.UserPreferencesDataSource
import com.drama.domain.model.PlayerSettings
import com.drama.domain.model.SubtitleMode
import com.drama.domain.model.VideoQuality
import com.drama.domain.repository.PlayerSettingsRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/** Player preferences over the `user_preferences` DataStore (S03-A2-01, S03-A2-02). */
@Singleton
class DataStorePlayerSettingsRepository
    @Inject
    constructor(
        private val preferences: UserPreferencesDataSource,
    ) : PlayerSettingsRepository {
        override val settings: Flow<PlayerSettings> =
            preferences.preferences
                .map { prefs ->
                    PlayerSettings(
                        speed =
                            prefs.playbackSpeed.takeIf { it in PlayerSettings.SPEEDS } ?: PlayerSettings.DEFAULT_SPEED,
                        quality = VideoQuality.fromMaxHeight(prefs.maxVideoHeight),
                        subtitles = SubtitleMode.parse(prefs.subtitleMode),
                    )
                }.distinctUntilChanged()

        override suspend fun setSpeed(speed: Float) = preferences.setPlaybackSpeed(speed)

        override suspend fun setQuality(quality: VideoQuality) = preferences.setMaxVideoHeight(quality.maxHeight)

        override suspend fun setSubtitles(mode: SubtitleMode) =
            preferences.setSubtitleMode(SubtitleMode.serialize(mode))
    }
