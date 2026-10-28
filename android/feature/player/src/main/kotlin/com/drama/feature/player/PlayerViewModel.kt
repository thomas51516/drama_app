package com.drama.feature.player

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.Player
import com.drama.core.common.result.AppResult
import com.drama.domain.model.EpisodeNavigation
import com.drama.domain.usecase.GetSeriesEpisodesUseCase
import com.drama.feature.player.engine.PlaybackEngine
import com.drama.feature.player.engine.PlaybackEngineFactory
import com.drama.feature.player.engine.PlaybackEvent
import com.drama.feature.player.navigation.PlayerRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class PlayerViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val getSeriesEpisodes: GetSeriesEpisodesUseCase,
        engineFactory: PlaybackEngineFactory,
    ) : ViewModel() {
        private val seriesId: String = checkNotNull(savedStateHandle[PlayerRoute.ARG_SERIES_ID])

        private val engine: PlaybackEngine = engineFactory.create()

        /** Exposed to the UI so the visible page can attach its surface. */
        val activePlayer: StateFlow<Player?> get() = engine.activePlayer

        private val uiStateFlow = MutableStateFlow(PlayerUiState())
        val uiState: StateFlow<PlayerUiState> = uiStateFlow.asStateFlow()

        private var started = false
        private var wasPlayingBeforeBackground = false

        init {
            viewModelScope.launch { engine.events.collect(::onEvent) }
            load()
        }

        private fun load() {
            viewModelScope.launch {
                when (val result = getSeriesEpisodes(seriesId)) {
                    is AppResult.Success -> {
                        val episodes = result.value
                        uiStateFlow.update { it.copy(isLoading = false, episodes = episodes, errorMessage = null) }
                        engine.setPlaylist(episodes.map { it.playback })
                        if (episodes.isNotEmpty()) startAt(uiStateFlow.value.currentIndex.coerceIn(episodes.indices))
                    }
                    is AppResult.Failure -> {
                        uiStateFlow.update {
                            it.copy(
                                isLoading = false,
                                errorMessage = "Impossible de charger la série",
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
            startAt(index)
        }

        fun onTap() = engine.togglePlayPause()

        fun onBackground() {
            wasPlayingBeforeBackground = uiStateFlow.value.isPlaying
            engine.pause()
        }

        fun onForeground() {
            if (wasPlayingBeforeBackground) engine.resume()
            wasPlayingBeforeBackground = false
        }

        private fun startAt(index: Int) {
            started = true
            uiStateFlow.update { it.copy(currentIndex = index) }
            engine.play(index)
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
                is PlaybackEvent.IsPlayingChanged ->
                    uiStateFlow.update { it.copy(isPlaying = event.isPlaying) }
                is PlaybackEvent.Ended -> {
                    // Auto-advance keeps the binge flow going; the pager follows currentIndex.
                    EpisodeNavigation.nextIndex(event.index, uiStateFlow.value.episodes.size)?.let(::startAt)
                }
                is PlaybackEvent.Error ->
                    uiStateFlow.update { it.copy(errorMessage = "Erreur de lecture : ${event.message}") }
            }
        }

        override fun onCleared() {
            engine.release()
        }
    }
