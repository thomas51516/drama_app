package com.drama.feature.player

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.Player
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeNavigation
import com.drama.domain.model.PlaySession
import com.drama.domain.model.WatchProgress
import com.drama.domain.usecase.GetSeriesEpisodesUseCase
import com.drama.domain.usecase.PlaybackStart
import com.drama.domain.usecase.ReportProgressUseCase
import com.drama.domain.usecase.StartPlaybackUseCase
import com.drama.feature.player.engine.PlaybackEngine
import com.drama.feature.player.engine.PlaybackEngineFactory
import com.drama.feature.player.engine.PlaybackEvent
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

/**
 * Vertical player (S02-A2-01..03 + real playback flow).
 *
 * - Episodes come from `GET /series/{id}/episodes`; each page resolves its stream with `POST /episodes/{id}/play`
 *   when it becomes current (and the next page is resolved ahead so the engine can preload it, M-12).
 * - A locked episode (403 `EPISODE_LOCKED`) shows the paywall placeholder; playback simply does not start.
 * - Progress is reported every [PROGRESS_INTERVAL_MS] while playing, on pause, on page change, on
 *   background and when the screen leaves; the end of an episode reports `completed = true` (M-15).
 * - Resume: server position wins over local (see `DefaultStartPlaybackUseCase`).
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

        init {
            viewModelScope.launch { engine.events.collect(::onEvent) }
            viewModelScope.launch { engine.position.collect { pos -> uiStateFlow.update { it.copy(position = pos) } } }
            load()
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
                                errorMessage = result.error.toUserMessage("Impossible de charger la série"),
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

        private fun resolve(
            index: Int,
            episode: Episode,
            playWhenReady: Boolean,
        ) {
            resolving[index]?.cancel()
            if (!playWhenReady) {
                val fresh = sessions[episode.id]?.takeIf { !it.isExpired(clock.nowEpochMs()) }
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
            if (!playWhenReady || uiStateFlow.value.currentIndex != index) return
            engine.play(index, start.startPositionMs)
            trackStart(episode, resumed = start.isResume)
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
                    else -> PageState.Failed(error.toUserMessage("Lecture impossible"))
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
                is PlaybackEvent.FirstFrameRendered ->
                    uiStateFlow.update {
                        it.copy(
                            startupMetrics =
                                it.startupMetrics +
                                    StartupMetric(event.index, event.startupMs, event.readyMs, event.wasPreloaded),
                        )
                    }
                is PlaybackEvent.PreloadCompleted ->
                    uiStateFlow.update { it.copy(preloadedIndices = it.preloadedIndices + event.index) }
                is PlaybackEvent.IsPlayingChanged -> onIsPlayingChanged(event.isPlaying)
                is PlaybackEvent.Ended -> onEnded(event.index)
                is PlaybackEvent.Error ->
                    uiStateFlow.update { it.copy(errorMessage = "Erreur de lecture : ${event.message}") }
            }
        }

        override fun onCleared() {
            flushProgress(completed = false)
            engine.release()
        }

        private fun AppError.toUserMessage(fallback: String): String =
            when (this) {
                is AppError.Network -> "Pas de connexion"
                is AppError.Unauthenticated -> "Session expirée, réessayez"
                is AppError.NotFound -> "Contenu introuvable"
                is AppError.Server -> "Service indisponible ($code)"
                else -> fallback
            }

        companion object {
            private const val TAG = "Player"
            const val SEEK_STEP_MS = 10_000L
            const val PROGRESS_INTERVAL_MS = 5_000L
            const val NEXT_COUNTDOWN_S = 3
        }
    }
