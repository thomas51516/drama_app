package com.drama.feature.player

import androidx.lifecycle.SavedStateHandle
import androidx.media3.common.Player
import app.cash.turbine.test
import com.drama.core.common.result.AppResult
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.PlaybackSource
import com.drama.domain.model.StreamFormat
import com.drama.domain.usecase.GetSeriesEpisodesUseCase
import com.drama.feature.player.engine.PlaybackEngine
import com.drama.feature.player.engine.PlaybackEngineFactory
import com.drama.feature.player.engine.PlaybackEvent
import com.drama.feature.player.navigation.PlayerRoute
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PlayerViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val engine = FakePlaybackEngine()

    private val episodes =
        (1..3).map { index ->
            Episode(
                id = "ep$index",
                seriesId = "test-series",
                index = index,
                title = "Episode $index",
                durationMs = null,
                access = EpisodeAccess.FREE,
                playback = PlaybackSource("https://example.com/$index.m3u8", StreamFormat.HLS),
            )
        }

    private val getEpisodes = GetSeriesEpisodesUseCase { AppResult.Success(episodes) }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel() =
        PlayerViewModel(
            savedStateHandle = SavedStateHandle(mapOf(PlayerRoute.ARG_SERIES_ID to "test-series")),
            getSeriesEpisodes = getEpisodes,
            engineFactory = PlaybackEngineFactory { engine },
        )

    @Test
    fun `loads episodes and starts the first one`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()

            val state = viewModel.uiState.value
            assertFalse(state.isLoading)
            assertEquals(3, state.episodes.size)
            assertEquals(0, state.currentIndex)
            assertEquals(3, engine.playlistSize)
            assertEquals(listOf(0), engine.playedIndices)
        }

    @Test
    fun `settling on another page starts that episode once`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onPageSettled(0) // same page: ignored
            viewModel.onPageSettled(1)
            viewModel.onPageSettled(1) // duplicate: ignored
            advanceUntilIdle()

            assertEquals(1, viewModel.uiState.value.currentIndex)
            assertEquals(listOf(0, 1), engine.playedIndices)
        }

    @Test
    fun `first frame events are recorded as startup metrics`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.uiState.test {
                awaitItem()
                engine.emit(PlaybackEvent.PreloadCompleted(1))
                assertEquals(setOf(1), awaitItem().preloadedIndices)

                engine.emit(
                    PlaybackEvent.FirstFrameRendered(index = 0, startupMs = 420, readyMs = 300, wasPreloaded = false),
                )
                val metric = awaitItem().lastStartup
                assertEquals(420L, metric?.startupMs)
                assertEquals(false, metric?.wasPreloaded)

                engine.emit(PlaybackEvent.IsPlayingChanged(true))
                assertTrue(awaitItem().isPlaying)
                cancelAndIgnoreRemainingEvents()
            }
        }

    @Test
    fun `end of episode auto-advances to the next one`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()

            engine.emit(PlaybackEvent.Ended(0))
            advanceUntilIdle()

            assertEquals(1, viewModel.uiState.value.currentIndex)
            assertEquals(listOf(0, 1), engine.playedIndices)
        }

    @Test
    fun `background pauses and foreground resumes only if it was playing`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()
            engine.emit(PlaybackEvent.IsPlayingChanged(true))
            advanceUntilIdle()

            viewModel.onBackground()
            assertEquals(1, engine.pauseCount)
            viewModel.onForeground()
            assertEquals(1, engine.resumeCount)

            engine.emit(PlaybackEvent.IsPlayingChanged(false))
            advanceUntilIdle()
            viewModel.onBackground()
            viewModel.onForeground()
            assertEquals(1, engine.resumeCount)
        }

    private class FakePlaybackEngine : PlaybackEngine {
        private val eventsFlow = MutableSharedFlow<PlaybackEvent>()
        override val events: SharedFlow<PlaybackEvent> = eventsFlow
        override val activePlayer: StateFlow<Player?> = MutableStateFlow(null)

        var playlistSize = 0
        val playedIndices = mutableListOf<Int>()
        var pauseCount = 0
        var resumeCount = 0
        var released = false

        suspend fun emit(event: PlaybackEvent) = eventsFlow.emit(event)

        override fun setPlaylist(sources: List<PlaybackSource>) {
            playlistSize = sources.size
        }

        override fun play(index: Int) {
            playedIndices += index
        }

        override fun togglePlayPause() = Unit

        override fun pause() {
            pauseCount++
        }

        override fun resume() {
            resumeCount++
        }

        override fun release() {
            released = true
        }
    }
}
