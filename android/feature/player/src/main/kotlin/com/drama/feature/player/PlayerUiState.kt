package com.drama.feature.player

import com.drama.core.player.engine.PlaybackPosition
import com.drama.core.player.engine.TrackSelectionMapper
import com.drama.domain.model.Episode
import com.drama.domain.model.PlayerSettings
import com.drama.domain.model.Subtitle
import com.drama.domain.model.VideoQuality

data class StartupMetric(
    val index: Int,
    val startupMs: Long,
    val readyMs: Long?,
    val wasPreloaded: Boolean,
)

/** Per-page resolution of `POST /episodes/{id}/play`. */
sealed interface PageState {
    data object Idle : PageState

    data object Loading : PageState

    data object Ready : PageState

    /** 403 EPISODE_LOCKED: placeholder until the paywall (Sprint 7). */
    data class Locked(
        val coinCost: Int?,
    ) : PageState

    data class Failed(
        val message: String,
    ) : PageState
}

/** Shown when the current episode reached its end; [nextIndex] null on the last episode. */
data class EndOfEpisode(
    val nextIndex: Int?,
    val countdownSeconds: Int,
)

data class PlayerUiState(
    val isLoading: Boolean = true,
    val episodes: List<Episode> = emptyList(),
    val currentIndex: Int = 0,
    val isPlaying: Boolean = false,
    val isMuted: Boolean = false,
    val position: PlaybackPosition = PlaybackPosition(),
    val pages: Map<Int, PageState> = emptyMap(),
    val endOfEpisode: EndOfEpisode? = null,
    val preloadedIndices: Set<Int> = emptySet(),
    val startupMetrics: List<StartupMetric> = emptyList(),
    val errorMessage: String? = null,
    /** Persisted preferences (M-13, M-14). */
    val settings: PlayerSettings = PlayerSettings(),
    /** Text tracks offered by the current episode (from `/play`). */
    val subtitleOptions: List<Subtitle> = emptyList(),
    /** Language actually enabled for the current episode, null when subtitles are off or unavailable. */
    val activeSubtitleLanguage: String? = null,
    val qualityOptions: List<VideoQuality> = VideoQuality.entries,
    /** Short side of the rendition being rendered (360, 540, ...), when known. */
    val playingShortSide: Int? = null,
) {
    val currentEpisode: Episode? get() = episodes.getOrNull(currentIndex)
    val lastStartup: StartupMetric? get() = startupMetrics.lastOrNull { it.index == currentIndex }

    fun pageState(index: Int): PageState = pages[index] ?: PageState.Idle

    val speedLabel: String get() = TrackSelectionMapper.speedLabel(settings.speed)

    /** "Auto" plus the live rendition when known (`Auto · 540p`), or the manual cap. */
    val qualityLabel: String
        get() =
            if (settings.quality == VideoQuality.AUTO) {
                playingShortSide?.let { "Auto · ${it}p" } ?: "Auto"
            } else {
                TrackSelectionMapper.qualityLabel(settings.quality)
            }

    val subtitleLabel: String get() = activeSubtitleLanguage?.uppercase() ?: "Off"
}
