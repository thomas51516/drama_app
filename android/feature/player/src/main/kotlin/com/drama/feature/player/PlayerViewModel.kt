package com.drama.feature.player

import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.Player
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.locale.DeviceLocaleProvider
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.share.ShareLinkProvider
import com.drama.core.common.time.Clock
import com.drama.core.player.engine.AvailableTracks
import com.drama.core.player.engine.PlaybackEngine
import com.drama.core.player.engine.PlaybackEngineFactory
import com.drama.core.player.engine.PlaybackEvent
import com.drama.core.player.engine.TrackSelectionMapper
import com.drama.core.ui.text.UiText
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeNavigation
import com.drama.domain.model.PlaySession
import com.drama.domain.model.PlayerSettings
import com.drama.domain.model.SignedUrlPolicy
import com.drama.domain.model.SubtitleMode
import com.drama.domain.model.VideoQuality
import com.drama.domain.model.WatchProgress
import com.drama.domain.repository.PlayerSettingsRepository
import com.drama.domain.usecase.GetSeriesEpisodesUseCase
import com.drama.domain.usecase.PlaybackStart
import com.drama.domain.usecase.ReportProgressUseCase
import com.drama.domain.usecase.StartPlaybackUseCase
import com.drama.feature.player.navigation.PlayerRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.drama.core.ui.R as CoreR

/**
 * Vertical player (S02-A2-01..03 + real playback flow).
 *
 * - Episodes come from `GET /series/{id}/episodes`; each page resolves its stream with `POST /episodes/{id}/play`
 *   when it becomes current (and the next page is resolved ahead so the engine can preload it, M-12).
 * - A locked episode (403 `EPISODE_LOCKED`) shows the paywall placeholder; playback simply does not start.
 * - Progress is reported every [PROGRESS_INTERVAL_MS] while playing, on pause, on page change, on
 *   background and when the screen leaves; the end of an episode reports `completed = true` (M-15).
 * - Resume: server position wins over local (see `DefaultStartPlaybackUseCase`).
 * - Settings (S03-A2-01/02): speed, quality cap and subtitle mode come from [PlayerSettingsRepository]; every
 *   change is persisted first and applied to the engine from the flow, so it survives episode changes and
 *   app restarts. The subtitle language is resolved per episode (device language in `Auto` mode).
 * - Signed URLs (S04-A2-01): `/play` answers expire (`expiresAt`). The current page is always re-requested when
 *   it becomes current; a neighbour is re-requested when its URL is within [SignedUrlPolicy.REFRESH_MARGIN_MS]
 *   of expiry; a timer re-requests the playing episode just before expiry so the attached source is fresh; and
 *   an HTTP 403 from the media host triggers one transparent re-resolve + restart at the same position.
 * - Texts are [UiText] so the view model stays free of Android resources (S05-A2-03); the composables resolve them.
 */
@HiltViewModel
class PlayerViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val getSeriesEpisodes: GetSeriesEpisodesUseCase,
        private val startPlayback: StartPlaybackUseCase,
        private val reportProgress: ReportProgressUseCase,
        private val analytics: AnalyticsTracker,
        private val clock: Clock,
        private val logger: Logger,
        private val playerSettings: PlayerSettingsRepository,
        private val deviceLocale: DeviceLocaleProvider,
        private val shareLinks: ShareLinkProvider,
        engineFactory: PlaybackEngineFactory,
    ) : ViewModel() {
        private val seriesId: String = checkNotNull(savedStateHandle[PlayerRoute.ARG_SERIES_ID])
        private val initialEpisodeId: String? = savedStateHandle[PlayerRoute.ARG_EPISODE_ID]

        private val engine: PlaybackEngine = engineFactory.create()

        /** Exposed to the UI so the visible page can attach its surface. */
        val activePlayer: StateFlow<Player?> get() = engine.activePlayer

        private val uiStateFlow = MutableStateFlow(PlayerUiState())
        val uiState: StateFlow<PlayerUiState> = uiStateFlow.asStateFlow()

        private var started = false
        private var wasPlayingBeforeBackground = false
        private val sessions = mutableMapOf<String, PlaySession>()
        private val resolving = mutableMapOf<Int, Job>()
        private var progressJob: Job? = null
        private var countdownJob: Job? = null
        private var lastReportedPositionMs = -1L
        private var startedEpisodeId: String? = null
        private var settingsApplied = false
        private var subtitlesApplied = false
        private var expiryRefreshJob: Job? = null
        private val forbiddenRetries = mutableMapOf<Int, Int>()

        init {
            viewModelScope.launch { engine.events.collect(::onEvent) }
            viewModelScope.launch { engine.position.collect { pos -> uiStateFlow.update { it.copy(position = pos) } } }
            viewModelScope.launch { engine.tracks.collect(::onTracksChanged) }
            viewModelScope.launch { playerSettings.settings.collect(::applySettings) }
            load()
        }

        // --- settings (M-13 / M-14) ---

        fun onSpeedSelected(speed: Float) {
            if (speed !in PlayerSettings.SPEEDS) return
            applySettings(uiStateFlow.value.settings.copy(speed = speed))
            viewModelScope.launch { playerSettings.setSpeed(speed) }
        }

        fun onQualitySelected(quality: VideoQuality) {
            applySettings(uiStateFlow.value.settings.copy(quality = quality))
            viewModelScope.launch { playerSettings.setQuality(quality) }
        }

        fun onSubtitleSelected(mode: SubtitleMode) {
            applySettings(uiStateFlow.value.settings.copy(subtitles = mode))
            viewModelScope.launch { playerSettings.setSubtitles(mode) }
        }

        /** Applies [settings] to the engine (idempotent) and refreshes the derived labels. */
        private fun applySettings(settings: PlayerSettings) {
            val previous = uiStateFlow.value.settings
            uiStateFlow.update { it.copy(settings = settings) }
            if (previous.speed != settings.speed || !settingsApplied) engine.setPlaybackSpeed(settings.speed)
            if (previous.quality != settings.quality ||
                !settingsApplied
            ) {
                engine.setMaxVideoShortSide(settings.quality.maxHeight)
            }
            settingsApplied = true
            applySubtitles()
        }

        /** Resolves the text track for the current episode from the mode, what `/play` offers and the device language. */
        private fun applySubtitles() {
            val state = uiStateFlow.value
            val offered = state.currentEpisode?.let { sessions[it.id]?.subtitles }.orEmpty()
            val language =
                TrackSelectionMapper.resolveSubtitleLanguage(
                    state.settings.subtitles,
                    offered,
                    deviceLocale.language,
                )
            if (offered != state.subtitleOptions || language != state.activeSubtitleLanguage || !subtitlesApplied) {
                engine.setSubtitleLanguage(language)
                subtitlesApplied = true
                logger.i(
                    TAG,
                    "subtitles mode=${state.settings.subtitles} offered=${offered.map {
                        it.language
                    }} active=${language ?: "off"}",
                )
            }
            uiStateFlow.update { it.copy(subtitleOptions = offered, activeSubtitleLanguage = language) }
        }

        private fun onTracksChanged(tracks: AvailableTracks) {
            uiStateFlow.update {
                it.copy(
                    qualityOptions = TrackSelectionMapper.qualityOptions(tracks.videoShortSides),
                    playingShortSide = tracks.playingShortSide,
                )
            }
        }

        private fun load() {
            viewModelScope.launch {
                when (val result = getSeriesEpisodes(seriesId)) {
                    is AppResult.Success -> {
                        val episodes = result.value
                        uiStateFlow.update { it.copy(isLoading = false, episodes = episodes, errorMessage = null) }
                        engine.setPlaylist(episodes.size)
                        if (episodes.isNotEmpty()) {
                            val initial =
                                initialEpisodeId
                                    ?.let { id ->
                                        episodes.indexOfFirst { it.id == id }
                                    }?.takeIf { it >= 0 }
                                    ?: uiStateFlow.value.currentIndex.coerceIn(episodes.indices)
                            startAt(initial)
                        }
                    }
                    is AppResult.Failure -> {
                        uiStateFlow.update {
                            it.copy(
                                isLoading = false,
                                errorMessage = result.error.toUserMessage(R.string.player_error_load_series),
                            )
                        }
                    }
                }
            }
        }

        /** Called when the vertical pager settles on a page (swipe up = next episode, M-11). */
        fun onPageSettled(index: Int) {
            val state = uiStateFlow.value
            if (state.episodes.isEmpty() || index !in state.episodes.indices) return
            if (started && index == state.currentIndex) return
            logger.i(TAG, "page settled index=$index (was ${state.currentIndex})")
            startAt(index)
        }

        fun onTap() {
            if (uiStateFlow.value.endOfEpisode != null) return
            if (uiStateFlow.value.isPlaying) flushProgress(completed = false)
            engine.togglePlayPause()
        }

        /** Double tap on the left/right half: -/+ 10 s (M-13). */
        fun onDoubleTap(rightHalf: Boolean) {
            val delta = if (rightHalf) SEEK_STEP_MS else -SEEK_STEP_MS
            seekTo(uiStateFlow.value.position.positionMs + delta)
        }

        fun onSeekTo(positionMs: Long) = seekTo(positionMs)

        fun onToggleMute() {
            val muted = !uiStateFlow.value.isMuted
            engine.setMuted(muted)
            uiStateFlow.update { it.copy(isMuted = muted) }
        }

        /** "Épisode suivant" affordance at the end of an episode (also triggered by the countdown). */
        fun onNextEpisode() {
            val next = uiStateFlow.value.endOfEpisode?.nextIndex ?: return
            logger.i(TAG, "next episode index=$next")
            startAt(next)
        }

        /** "Revoir" at the end of the last episode. */
        fun onReplay() {
            val index = uiStateFlow.value.currentIndex
            clearEndOfEpisode()
            engine.seekTo(0)
            engine.resume()
            startedEpisodeId = null
            uiStateFlow.value.episodes
                .getOrNull(index)
                ?.let { trackStart(it, resumed = false) }
        }

        /** Share sheet text for the current series (M-16); the UI opens the system chooser. */
        fun onShare(): String? {
            val episode = uiStateFlow.value.currentEpisode ?: return null
            analytics.track(AnalyticsEvent.Share(episode.seriesId, SHARE_SOURCE))
            return shareLinks.seriesLink(episode.seriesId).shareText(null)
        }

        fun onBackground() {
            wasPlayingBeforeBackground = uiStateFlow.value.isPlaying
            flushProgress(completed = false)
            engine.pause()
        }

        fun onForeground() {
            if (wasPlayingBeforeBackground) engine.resume()
            wasPlayingBeforeBackground = false
        }

        private fun seekTo(positionMs: Long) {
            val duration =
                uiStateFlow.value.position.durationMs
                    .takeIf { it > 0 } ?: engine.currentDurationMs()
            val target = if (duration > 0) positionMs.coerceIn(0L, duration) else positionMs.coerceAtLeast(0L)
            clearEndOfEpisode()
            engine.seekTo(target)
            uiStateFlow.update { it.copy(position = it.position.copy(positionMs = target)) }
        }

        private fun startAt(index: Int) {
            val previousIndex = uiStateFlow.value.currentIndex
            if (started && previousIndex != index) flushProgress(completed = false)
            started = true
            clearEndOfEpisode()
            startedEpisodeId = null
            lastReportedPositionMs = -1L
            uiStateFlow.update { it.copy(currentIndex = index) }
            val episode = uiStateFlow.value.episodes.getOrNull(index) ?: return
            resolveAndPlay(index, episode)
            // Resolve the next page ahead so the engine can preload it (M-12).
            EpisodeNavigation.nextIndex(index, uiStateFlow.value.episodes.size)?.let { next ->
                uiStateFlow.value.episodes
                    .getOrNull(next)
                    ?.let { resolve(next, it, playWhenReady = false) }
            }
        }

        private fun resolveAndPlay(
            index: Int,
            episode: Episode,
        ) {
            engine.stop()
            if (uiStateFlow.value.pageState(index) is PageState.Locked) return
            // Always ask /play for the current page: the answer carries the server resume position (M-15);
            // the preloaded source stays attached when the manifest URL did not change.
            resolve(index, episode, playWhenReady = true)
        }

        /** [force] skips the "still fresh" shortcut: used by the expiry timer, which must always re-request. */
        private fun resolve(
            index: Int,
            episode: Episode,
            playWhenReady: Boolean,
            force: Boolean = false,
        ) {
            resolving[index]?.cancel()
            if (!playWhenReady && !force) {
                val fresh =
                    sessions[episode.id]?.takeIf {
                        !SignedUrlPolicy.needsRefresh(it.expiresAtEpochMs, clock.nowEpochMs())
                    }
                if (uiStateFlow.value.pageState(index) is PageState.Locked ||
                    (fresh != null && engine.hasSource(index))
                ) {
                    return
                }
            }
            if (playWhenReady || uiStateFlow.value.pageState(index) !is PageState.Ready) {
                uiStateFlow.update { it.copy(pages = it.pages + (index to PageState.Loading)) }
            }
            resolving[index] =
                viewModelScope.launch {
                    when (val result = startPlayback(episode.id)) {
                        is AppResult.Success -> onResolved(index, episode, result.value, playWhenReady)
                        is AppResult.Failure -> onResolveFailed(index, episode, result.error, playWhenReady)
                    }
                }
        }

        private fun onResolved(
            index: Int,
            episode: Episode,
            start: PlaybackStart,
            playWhenReady: Boolean,
        ) {
            sessions[episode.id] = start.session
            engine.setSource(index, start.session.source)
            uiStateFlow.update { it.copy(pages = it.pages + (index to PageState.Ready), errorMessage = null) }
            if (uiStateFlow.value.currentIndex == index) scheduleExpiryRefresh(index, episode, start.session)
            if (!playWhenReady || uiStateFlow.value.currentIndex != index) return
            // The subtitle choice depends on what this episode offers: resolve it before the player starts.
            applySubtitles()
            engine.play(index, start.startPositionMs)
            trackStart(episode, resumed = start.isResume)
        }

        /** Re-asks `/play` [SignedUrlPolicy.REFRESH_MARGIN_MS] before the current URL expires (S04-A2-01). */
        private fun scheduleExpiryRefresh(
            index: Int,
            episode: Episode,
            session: PlaySession,
        ) {
            expiryRefreshJob?.cancel()
            if (!SignedUrlPolicy.hasExpiry(session.expiresAtEpochMs)) return
            val delayMs = SignedUrlPolicy.refreshDelayMs(session.expiresAtEpochMs, clock.nowEpochMs())
            expiryRefreshJob =
                viewModelScope.launch {
                    delay(delayMs)
                    if (uiStateFlow.value.currentIndex != index) return@launch
                    logger.i(TAG, "signed URL about to expire index=$index: re-requesting /play")
                    resolve(index, episode, playWhenReady = false, force = true)
                }
        }

        /** One transparent retry after an HTTP 403 from the media host: fresh `/play`, restart at the same position. */
        private fun onPlaybackError(event: PlaybackEvent.Error) {
            val index = event.index
            val episode = uiStateFlow.value.episodes.getOrNull(index)
            val retries = forbiddenRetries[index] ?: 0
            if (episode != null && SignedUrlPolicy.shouldRetryAfterHttpError(event.httpStatus, retries)) {
                forbiddenRetries[index] = retries + 1
                val position = engine.currentPositionMs().takeIf { it > 0 } ?: uiStateFlow.value.position.positionMs
                logger.w(TAG, "media host answered 403 index=$index: re-resolving once, resume at ${position}ms")
                resolving[index]?.cancel()
                resolving[index] =
                    viewModelScope.launch {
                        when (val result = startPlayback(episode.id)) {
                            is AppResult.Success -> {
                                sessions[episode.id] = result.value.session
                                engine.setSource(index, result.value.session.source)
                                if (uiStateFlow.value.currentIndex == index) {
                                    scheduleExpiryRefresh(index, episode, result.value.session)
                                    engine.restart(index, position)
                                }
                            }
                            is AppResult.Failure -> onResolveFailed(index, episode, result.error, playWhenReady = true)
                        }
                    }
                return
            }
            uiStateFlow.update { it.copy(errorMessage = UiText.of(R.string.player_error_engine, event.message)) }
        }

        private fun onResolveFailed(
            index: Int,
            episode: Episode,
            error: AppError,
            playWhenReady: Boolean,
        ) {
            val page =
                when (error) {
                    is AppError.Locked -> PageState.Locked(error.coinCost ?: episode.coinCost.takeIf { it > 0 })
                    else -> PageState.Failed(error.toUserMessage(R.string.player_error_playback))
                }
            uiStateFlow.update { it.copy(pages = it.pages + (index to page)) }
            if (error is AppError.Locked && playWhenReady) {
                analytics.track(AnalyticsEvent.PaywallView(episode.seriesId, episode.id, episode.index, error.coinCost))
            }
            logger.w(TAG, "play resolution failed index=$index: $error")
        }

        private fun trackStart(
            episode: Episode,
            resumed: Boolean,
        ) {
            if (startedEpisodeId == episode.id) return
            startedEpisodeId = episode.id
            analytics.track(AnalyticsEvent.EpisodeStart(episode.seriesId, episode.id, episode.index, resumed))
        }

        /** Periodic report while playing; cancelled on pause so the test scheduler and the battery stay idle. */
        private fun onIsPlayingChanged(isPlaying: Boolean) {
            uiStateFlow.update { it.copy(isPlaying = isPlaying) }
            progressJob?.cancel()
            progressJob =
                if (isPlaying) {
                    viewModelScope.launch {
                        while (uiStateFlow.value.isPlaying) {
                            delay(PROGRESS_INTERVAL_MS)
                            flushProgress(completed = false)
                        }
                    }
                } else {
                    null
                }
        }

        /** Writes the current position locally and to the server; no-op when nothing changed. */
        private fun flushProgress(
            completed: Boolean,
            index: Int = uiStateFlow.value.currentIndex,
        ) {
            val episode = uiStateFlow.value.episodes.getOrNull(index) ?: return
            if (uiStateFlow.value.pageState(index) !is PageState.Ready) return
            val position = engine.currentPositionMs().takeIf { it >= 0 } ?: uiStateFlow.value.position.positionMs
            val duration = engine.currentDurationMs().takeIf { it > 0 } ?: uiStateFlow.value.position.durationMs
            if (!completed && position == lastReportedPositionMs) return
            lastReportedPositionMs = position
            val progress =
                WatchProgress(
                    episodeId = episode.id,
                    seriesId = episode.seriesId,
                    positionMs = if (completed) duration.takeIf { it > 0 } ?: position else position,
                    durationMs = duration,
                    completed = completed,
                    episodeIndex = episode.index,
                )
            viewModelScope.launch {
                when (val result = reportProgress(progress)) {
                    is AppResult.Success ->
                        logger.i(TAG, "progress sent episode=${episode.id} position_ms=$position completed=$completed")
                    is AppResult.Failure -> logger.w(TAG, "progress not sent episode=${episode.id}: ${result.error}")
                }
            }
        }

        private fun onEnded(index: Int) {
            if (index != uiStateFlow.value.currentIndex || uiStateFlow.value.endOfEpisode != null) return
            logger.i(TAG, "ended index=$index")
            flushProgress(completed = true, index = index)
            uiStateFlow.value.episodes.getOrNull(index)?.let { episode ->
                analytics.track(AnalyticsEvent.EpisodeComplete(episode.seriesId, episode.id, episode.index))
            }
            val next = EpisodeNavigation.nextIndex(index, uiStateFlow.value.episodes.size)
            uiStateFlow.update { it.copy(endOfEpisode = EndOfEpisode(next, NEXT_COUNTDOWN_S)) }
            if (next == null) return
            countdownJob?.cancel()
            countdownJob =
                viewModelScope.launch {
                    var remaining = NEXT_COUNTDOWN_S
                    while (remaining > 0) {
                        delay(1_000L)
                        remaining--
                        uiStateFlow.update { state ->
                            state.copy(endOfEpisode = state.endOfEpisode?.copy(countdownSeconds = remaining))
                        }
                    }
                    onNextEpisode()
                }
        }

        private fun clearEndOfEpisode() {
            countdownJob?.cancel()
            countdownJob = null
            if (uiStateFlow.value.endOfEpisode != null) uiStateFlow.update { it.copy(endOfEpisode = null) }
        }

        private fun onEvent(event: PlaybackEvent) {
            when (event) {
                is PlaybackEvent.FirstFrameRendered -> {
                    forbiddenRetries.remove(event.index)
                    uiStateFlow.update {
                        it.copy(
                            startupMetrics =
                                it.startupMetrics +
                                    StartupMetric(event.index, event.startupMs, event.readyMs, event.wasPreloaded),
                        )
                    }
                }
                is PlaybackEvent.PreloadCompleted ->
                    uiStateFlow.update { it.copy(preloadedIndices = it.preloadedIndices + event.index) }
                is PlaybackEvent.IsPlayingChanged -> onIsPlayingChanged(event.isPlaying)
                is PlaybackEvent.Ended -> onEnded(event.index)
                is PlaybackEvent.Error -> onPlaybackError(event)
            }
        }

        override fun onCleared() {
            flushProgress(completed = false)
            engine.release()
        }

        private fun AppError.toUserMessage(
            @StringRes fallback: Int,
        ): UiText =
            when (this) {
                is AppError.Network -> UiText.Res(CoreR.string.error_network_short)
                is AppError.Unauthenticated -> UiText.Res(CoreR.string.error_session_expired)
                is AppError.NotFound -> UiText.Res(CoreR.string.error_not_found)
                is AppError.Server -> UiText.of(CoreR.string.error_server_short, code)
                else -> UiText.Res(fallback)
            }

        companion object {
            private const val TAG = "Player"
            const val SEEK_STEP_MS = 10_000L
            const val PROGRESS_INTERVAL_MS = 5_000L
            const val NEXT_COUNTDOWN_S = 3
            const val SHARE_SOURCE = "player"
        }
    }
