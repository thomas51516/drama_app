package com.drama.feature.player

import com.drama.core.player.engine.PlaybackPosition
import com.drama.core.player.engine.TrackSelectionMapper
import com.drama.core.ui.text.UiText
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

    /** 403 EPISODE_LOCKED (or known locked from the catalogue): the page offers the paywall (M-20). */
    data class Locked(
        val coinCost: Int?,
        /** Balance reported by the server with the 403 (contract v1.4); null otherwise. */
        val balance: Int? = null,
    ) : PageState

    data class Failed(
        val message: UiText,
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
    val errorMessage: UiText? = null,
    /** Persisted preferences (M-13, M-14). */
    val settings: PlayerSettings = PlayerSettings(),
    /** Text tracks offered by the current episode (from `/play`). */
    val subtitleOptions: List<Subtitle> = emptyList(),
    /** Language actually enabled for the current episode, null when subtitles are off or unavailable. */
    val activeSubtitleLanguage: String? = null,
    val qualityOptions: List<VideoQuality> = VideoQuality.entries,
    /** Short side of the rendition being rendered (360, 540, ...), when known. */
    val playingShortSide: Int? = null,
    /** Paywall sheet currently shown over the video (M-20); null when hidden. */
    val paywall: PaywallTarget? = null,
    /** Mirror of `wallet.autoUnlock` (M-21): a locked next episode is then simply played (the server debits). */
    val autoUnlock: Boolean = false,
) {
    val currentEpisode: Episode? get() = episodes.getOrNull(currentIndex)
    val lastStartup: StartupMetric? get() = startupMetrics.lastOrNull { it.index == currentIndex }

    fun pageState(index: Int): PageState = pages[index] ?: PageState.Idle

    /** Technical label (`1.5x`), identical in every language. */
    val speedLabel: String get() = TrackSelectionMapper.speedLabel(settings.speed)

    /**
     * Manual cap label (`540p`), or null in `Auto` mode: the UI then renders the localised "Auto" together with
     * [playingShortSide] when known (S05-A2-03, labels are resolved from resources in the composables).
     */
    val manualQualityLabel: String?
        get() = settings.quality.takeIf { it != VideoQuality.AUTO }?.let(TrackSelectionMapper::qualityLabel)

    /** Upper-cased code of the active text track (`FR`), or null when subtitles are off or unavailable. */
    val subtitleCode: String? get() = activeSubtitleLanguage?.uppercase()
}
