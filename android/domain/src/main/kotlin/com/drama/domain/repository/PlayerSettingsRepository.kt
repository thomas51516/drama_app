package com.drama.domain.repository

import com.drama.domain.model.PlayerSettings
import com.drama.domain.model.SubtitleMode
import com.drama.domain.model.VideoQuality
import kotlinx.coroutines.flow.Flow

/** DataStore-backed player preferences; every setter persists immediately and [settings] re-emits. */
interface PlayerSettingsRepository {
    val settings: Flow<PlayerSettings>

    suspend fun setSpeed(speed: Float)

    suspend fun setQuality(quality: VideoQuality)

    suspend fun setSubtitles(mode: SubtitleMode)
}
