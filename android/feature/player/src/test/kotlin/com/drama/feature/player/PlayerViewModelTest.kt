package com.drama.feature.player

import androidx.lifecycle.SavedStateHandle
import androidx.media3.common.Player
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.locale.FixedDeviceLocale
import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.share.HostShareLinkProvider
import com.drama.core.common.time.Clock
import com.drama.core.player.engine.AvailableTracks
import com.drama.core.player.engine.PlaybackEngine
import com.drama.core.player.engine.PlaybackEngineFactory
import com.drama.core.player.engine.PlaybackEvent
import com.drama.core.player.engine.PlaybackPosition
import com.drama.core.ui.text.UiText
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.PlaySession
import com.drama.domain.model.PlaybackSource
import com.drama.domain.model.PlayerSettings
import com.drama.domain.model.StreamFormat
import com.drama.domain.model.Subtitle
import com.drama.domain.model.SubtitleMode
import com.drama.domain.model.VideoQuality
import com.drama.domain.model.WatchProgress
import com.drama.domain.repository.PlayerSettingsRepository
import com.drama.domain.usecase.GetSeriesEpisodesUseCase
import com.drama.domain.usecase.PlaybackStart
import com.drama.domain.usecase.ReportProgressUseCase
import com.drama.domain.usecase.StartPlaybackUseCase
import com.drama.feature.player.navigation.PlayerRoute
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import com.drama.core.ui.R as CoreR

@OptIn(ExperimentalCoroutinesApi::class)
class PlayerViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val engine = FakePlaybackEngine()
    private val analytics = RecordingAnalytics()

    private val episodes =
        (1..3).map { index ->
            Episode(
                id = "ep$index",
                seriesId = "s1",
                index = index,
                title = "Episode $index",
                durationMs = 30_000,
                thumbnailUrl = null,
                access = if (index == 3) EpisodeAccess.LOCKED else EpisodeAccess.FREE,
                coinCost = if (index == 3) 10 else 0,
            )
        }

    private var getEpisodes = GetSeriesEpisodesUseCase { AppResult.Success(episodes) }
    private val reported = mutableListOf<WatchProgress>()
    private val reportProgress =
        ReportProgressUseCase {
            reported += it
            AppResult.Success(Unit)
        }
    private var resumePositions = mutableMapOf<String, Long>()
    private val expiresAtByEpisode = mutableMapOf<String, Long>()
    private val subtitlesByEpisode = mutableMapOf<String, List<Subtitle>>()
    private val playFailures = mutableMapOf<String, AppError>()
    private val settingsRepository = FakePlayerSettingsRepository()
    private var deviceLanguage = "fr"
    private val playCalls = mutableListOf<String>()
    private val startPlayback =
        StartPlaybackUseCase { episodeId ->
            playCalls += episodeId
            val episode = episodes.first { it.id == episodeId }
            val failure = playFailures[episodeId]
            if (failure != null) {
                AppResult.Failure(failure)
            } else if (episode.access == EpisodeAccess.LOCKED) {
                AppResult.Failure(AppError.Locked(episodeId, "s1", 10))
            } else {
                val resume = resumePositions[episodeId] ?: 0L
                val subtitles = subtitlesByEpisode[episodeId].orEmpty()
                AppResult.Success(
                    PlaybackStart(
                        session =
                            PlaySession(
                                episodeId = episodeId,
                                seriesId = "s1",
                                episodeNumber = episode.index,
                                source =
                                    PlaybackSource(
                                        "https://cdn/$episodeId.m3u8",
                                        StreamFormat.HLS,
                                        subtitles = subtitles,
                                    ),
                                // Consumed once: the re-requested URL never expires, so no further timer runs.
                                expiresAtEpochMs = expiresAtByEpisode.remove(episodeId) ?: Long.MAX_VALUE,
                                resumePositionMs = resume,
                                durationMs = 30_000,
                                nextEpisodeId = episodes.getOrNull(episode.index)?.id,
                                subtitles = subtitles,
                            ),
                        startPositionMs = resume,
                    ),
                )
            }
        }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(episodeId: String? = null) =
        PlayerViewModel(
            savedStateHandle =
                SavedStateHandle(
                    buildMap {
                        put(PlayerRoute.ARG_SERIES_ID, "s1")
                        episodeId?.let { put(PlayerRoute.ARG_EPISODE_ID, it) }
                    },
                ),
            getSeriesEpisodes = getEpisodes,
            startPlayback = startPlayback,
            reportProgress = reportProgress,
            analytics = analytics,
            clock = Clock { 0L },
            logger = NoOpLogger,
            playerSettings = settingsRepository,
            deviceLocale = FixedDeviceLocale(deviceLanguage, "FR"),
            shareLinks = HostShareLinkProvider("links.drama.example"),
            engineFactory = PlaybackEngineFactory { engine },
        )

    @Test
    fun `loads episodes, resolves play for the first one and prefetches the next`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()

            val state = viewModel.uiState.value
            assertFalse(state.isLoading)
            assertEquals(3, state.episodes.size)
            assertEquals(0, state.currentIndex)
            assertEquals(3, engine.playlistSize)
            assertEquals(listOf("ep1", "ep2"), playCalls)
            assertEquals(listOf(0 to 0L), engine.played)
            assertTrue(engine.hasSource(1))
            assertEquals(PageState.Ready, state.pageState(0))
            assertEquals(PageState.Ready, state.pageState(1))
            assertEquals(AnalyticsEvent.EpisodeStart("s1", "ep1", 1, resumed = false), analytics.events.single())
        }

    @Test
    fun `http 403 from the media host re-resolves once and restarts at the same position`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()
            engine.setPosition(7_000, 30_000)
            advanceUntilIdle()
            assertEquals(listOf("ep1", "ep2"), playCalls)

            engine.emit(PlaybackEvent.Error(0, "ERROR_CODE_IO_BAD_HTTP_STATUS", httpStatus = 403))
            advanceUntilIdle()
            assertEquals(listOf("ep1", "ep2", "ep1"), playCalls)
            assertEquals(listOf(0 to 7_000L), engine.restarted)
            assertNull(viewModel.uiState.value.errorMessage)

            // A second 403 on the same page is not retried: the error surfaces.
            engine.emit(PlaybackEvent.Error(0, "ERROR_CODE_IO_BAD_HTTP_STATUS", httpStatus = 403))
            advanceUntilIdle()
            assertEquals(3, playCalls.size)
            assertEquals(1, engine.restarted.size)
            assertEquals(
                UiText.of(R.string.player_error_engine, "ERROR_CODE_IO_BAD_HTTP_STATUS"),
                viewModel.uiState.value.errorMessage,
            )
        }

    @Test
    fun `other playback errors surface without any re-resolve`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()
            engine.emit(PlaybackEvent.Error(0, "ERROR_CODE_IO_NETWORK_CONNECTION_FAILED", httpStatus = null))
            advanceUntilIdle()
            assertEquals(2, playCalls.size)
            assertTrue(engine.restarted.isEmpty())
            assertEquals(
                UiText.of(R.string.player_error_engine, "ERROR_CODE_IO_NETWORK_CONNECTION_FAILED"),
                viewModel.uiState.value.errorMessage,
            )
        }

    @Test
    fun `series load failure surfaces a localised message`() =
        runTest(dispatcher) {
            getEpisodes = GetSeriesEpisodesUseCase { AppResult.Failure(AppError.Network()) }
            val viewModel = createViewModel()
            advanceUntilIdle()

            val state = viewModel.uiState.value
            assertFalse(state.isLoading)
            assertTrue(state.episodes.isEmpty())
            assertEquals(UiText.Res(CoreR.string.error_network_short), state.errorMessage)
        }

    @Test
    fun `play resolution failures map to localised page messages`() =
        runTest(dispatcher) {
            playFailures["ep1"] = AppError.Server(503)
            playFailures["ep2"] = AppError.Http(400)
            val viewModel = createViewModel()
            advanceUntilIdle()

            assertEquals(
                PageState.Failed(UiText.of(CoreR.string.error_server_short, 503)),
                viewModel.uiState.value.pageState(0),
            )
            assertEquals(
                PageState.Failed(UiText.Res(R.string.player_error_playback)),
                viewModel.uiState.value.pageState(1),
            )
            assertTrue(engine.played.isEmpty())
        }

    @Test
    fun `signed url is re-requested thirty seconds before it expires`() =
        runTest(dispatcher) {
            expiresAtByEpisode["ep1"] = 100_000L // clock is fixed at 0: refresh due at 70 s
            createViewModel()
            runCurrent() // not advanceUntilIdle: that would run the 70 s timer right away
            assertEquals(listOf("ep1", "ep2"), playCalls)

            advanceTimeBy(69_000)
            runCurrent()
            assertEquals(2, playCalls.size)
            advanceTimeBy(1_001)
            runCurrent()
            assertEquals(listOf("ep1", "ep2", "ep1"), playCalls)
            // The attached source is refreshed without restarting playback.
            assertTrue(engine.restarted.isEmpty())
            assertEquals(1, engine.played.size)
        }

    @Test
    fun `resumes at the server position`() =
        runTest(dispatcher) {
            resumePositions["ep1"] = 12_000L
            createViewModel()
            advanceUntilIdle()

            assertEquals(listOf(0 to 12_000L), engine.played)
            assertEquals(AnalyticsEvent.EpisodeStart("s1", "ep1", 1, resumed = true), analytics.events.single())
        }

    @Test
    fun `opens at the requested episode`() =
        runTest(dispatcher) {
            val viewModel = createViewModel(episodeId = "ep2")
            advanceUntilIdle()

            assertEquals(1, viewModel.uiState.value.currentIndex)
            assertEquals(1, engine.played.single().first)
        }

    @Test
    fun `locked episode shows the placeholder instead of playing`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onPageSettled(2)
            advanceUntilIdle()

            assertEquals(PageState.Locked(10), viewModel.uiState.value.pageState(2))
            assertTrue(engine.played.none { it.first == 2 })
            assertTrue(analytics.events.contains(AnalyticsEvent.PaywallView("s1", "ep3", 3, 10)))
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
            assertEquals(listOf(0, 1), engine.played.map { it.first })
        }

    @Test
    fun `double tap seeks by ten seconds and clamps to the episode bounds`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()
            engine.setPosition(5_000, 30_000)
            advanceUntilIdle()

            viewModel.onDoubleTap(rightHalf = true)
            assertEquals(15_000L, engine.lastSeek)

            engine.setPosition(3_000, 30_000)
            advanceUntilIdle()
            viewModel.onDoubleTap(rightHalf = false)
            assertEquals(0L, engine.lastSeek)

            engine.setPosition(25_000, 30_000)
            advanceUntilIdle()
            viewModel.onDoubleTap(rightHalf = true)
            assertEquals(30_000L, engine.lastSeek)
        }

    @Test
    fun `seek bar seeks to the requested position`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()
            engine.setPosition(0, 30_000)
            advanceUntilIdle()

            viewModel.onSeekTo(21_500)
            assertEquals(21_500L, engine.lastSeek)
            assertEquals(21_500L, viewModel.uiState.value.position.positionMs)
        }

    @Test
    fun `mute toggles the engine volume`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onToggleMute()
            assertTrue(engine.isMutedNow)
            assertTrue(viewModel.uiState.value.isMuted)
            viewModel.onToggleMute()
            assertFalse(engine.isMutedNow)
        }

    @Test
    fun `end of episode reports completion, shows next affordance and auto-advances after the countdown`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()
            engine.setPosition(30_000, 30_000)
            advanceUntilIdle()

            engine.emit(PlaybackEvent.Ended(0))
            advanceTimeBy(100)

            val end = viewModel.uiState.value.endOfEpisode
            assertEquals(1, end?.nextIndex)
            assertEquals(3, end?.countdownSeconds)
            assertTrue(reported.last().completed)
            assertEquals("ep1", reported.last().episodeId)
            assertTrue(analytics.events.contains(AnalyticsEvent.EpisodeComplete("s1", "ep1", 1)))

            advanceTimeBy(3_100)
            advanceUntilIdle()
            assertEquals(1, viewModel.uiState.value.currentIndex)
            assertNull(viewModel.uiState.value.endOfEpisode)
            assertEquals(listOf(0, 1), engine.played.map { it.first })
        }

    @Test
    fun `next episode button skips the countdown`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()

            engine.emit(PlaybackEvent.Ended(0))
            advanceTimeBy(100)
            viewModel.onNextEpisode()
            advanceUntilIdle()

            assertEquals(1, viewModel.uiState.value.currentIndex)
            assertEquals(listOf(0, 1), engine.played.map { it.first })
        }

    @Test
    fun `last episode offers replay instead of next`() =
        runTest(dispatcher) {
            val viewModel = createViewModel(episodeId = "ep2")
            advanceUntilIdle()
            // ep3 is locked, so from the user's point of view ep2 can still advance; make the list end at ep2.
            engine.emit(PlaybackEvent.Ended(1))
            advanceTimeBy(100)
            assertEquals(
                2,
                viewModel.uiState.value.endOfEpisode
                    ?.nextIndex,
            )
        }

    @Test
    fun `progress is reported every five seconds while playing and on pause`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()
            engine.emit(PlaybackEvent.IsPlayingChanged(true))
            engine.setPosition(1_000, 30_000)
            runCurrent()

            assertTrue(reported.isEmpty())
            advanceTimeBy(5_100)
            assertEquals(1, reported.size)
            assertEquals(1_000L, reported.single().positionMs)
            assertEquals(1, reported.single().episodeIndex)

            engine.setPosition(1_000, 30_000) // unchanged position: not re-sent
            advanceTimeBy(5_000)
            assertEquals(1, reported.size)

            engine.setPosition(7_000, 30_000)
            advanceTimeBy(5_000)
            assertEquals(2, reported.size)

            engine.setPosition(9_000, 30_000)
            viewModel.onTap() // pause flushes immediately
            runCurrent()
            assertEquals(9_000L, reported.last().positionMs)
            engine.emit(PlaybackEvent.IsPlayingChanged(false))
            advanceUntilIdle() // ticker cancelled: the scheduler becomes idle
        }

    @Test
    fun `background flushes progress, pauses and foreground resumes only if it was playing`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()
            engine.emit(PlaybackEvent.IsPlayingChanged(true))
            engine.setPosition(4_000, 30_000)
            runCurrent()

            viewModel.onBackground()
            runCurrent()
            assertEquals(1, engine.pauseCount)
            assertEquals(4_000L, reported.last().positionMs)
            viewModel.onForeground()
            assertEquals(1, engine.resumeCount)

            engine.emit(PlaybackEvent.IsPlayingChanged(false))
            advanceUntilIdle()
            viewModel.onBackground()
            viewModel.onForeground()
            assertEquals(1, engine.resumeCount)
        }

    @Test
    fun `first frame events are recorded as startup metrics`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()

            engine.emit(PlaybackEvent.PreloadCompleted(1))
            engine.emit(
                PlaybackEvent.FirstFrameRendered(index = 0, startupMs = 420, readyMs = 300, wasPreloaded = false),
            )
            advanceUntilIdle()

            val state = viewModel.uiState.value
            assertEquals(setOf(1), state.preloadedIndices)
            assertEquals(420L, state.lastStartup?.startupMs)
        }

    // --- settings (S03-A2-01 / S03-A2-02) ---

    @Test
    fun `persisted settings are applied to the engine on start`() =
        runTest(dispatcher) {
            settingsRepository.state.value =
                PlayerSettings(speed = 1.5f, quality = VideoQuality.P360, subtitles = SubtitleMode.Off)
            createViewModel()
            advanceUntilIdle()

            assertEquals(1.5f, engine.speed)
            assertEquals(360, engine.maxShortSide)
            assertNull(engine.activeSubtitle)
        }

    @Test
    fun `selecting speed and quality persists them and applies immediately`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onSpeedSelected(2f)
            viewModel.onQualitySelected(VideoQuality.P540)
            advanceUntilIdle()

            assertEquals(2f, engine.speed)
            assertEquals(540, engine.maxShortSide)
            assertEquals(2f, settingsRepository.state.value.speed)
            assertEquals(VideoQuality.P540, settingsRepository.state.value.quality)
            assertEquals("2x", viewModel.uiState.value.speedLabel)
            assertEquals("540p", viewModel.uiState.value.manualQualityLabel)
            // unknown speeds are ignored
            viewModel.onSpeedSelected(3f)
            assertEquals(2f, engine.speed)
        }

    @Test
    fun `settings survive an episode change`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()
            viewModel.onSpeedSelected(1.25f)
            viewModel.onQualitySelected(VideoQuality.P360)
            advanceUntilIdle()

            viewModel.onPageSettled(1)
            advanceUntilIdle()

            assertEquals(1, viewModel.uiState.value.currentIndex)
            assertEquals(1.25f, engine.speed)
            assertEquals(360, engine.maxShortSide)
            assertEquals(1.25f, viewModel.uiState.value.settings.speed)
        }

    @Test
    fun `auto subtitles default to the device language when the episode offers it`() =
        runTest(dispatcher) {
            subtitlesByEpisode["ep1"] =
                listOf(Subtitle("fr", "u/fr.vtt", "Français"), Subtitle("en", "u/en.vtt", "English"))
            subtitlesByEpisode["ep2"] = listOf(Subtitle("en", "u/en.vtt", "English"))
            val viewModel = createViewModel()
            advanceUntilIdle()

            assertEquals("fr", engine.activeSubtitle)
            assertEquals("fr", viewModel.uiState.value.activeSubtitleLanguage)
            assertEquals(2, viewModel.uiState.value.subtitleOptions.size)

            // Episode 2 has no French track: subtitles switch off without touching the preference.
            viewModel.onPageSettled(1)
            advanceUntilIdle()
            assertNull(engine.activeSubtitle)
            assertEquals(SubtitleMode.Auto, settingsRepository.state.value.subtitles)
        }

    @Test
    fun `choosing a subtitle language persists it and off disables the text track`() =
        runTest(dispatcher) {
            subtitlesByEpisode["ep1"] = listOf(Subtitle("fr", "u/fr.vtt"), Subtitle("en", "u/en.vtt"))
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onSubtitleSelected(SubtitleMode.Language("en"))
            advanceUntilIdle()
            assertEquals("en", engine.activeSubtitle)
            assertEquals(SubtitleMode.Language("en"), settingsRepository.state.value.subtitles)
            assertEquals("EN", viewModel.uiState.value.subtitleCode)

            viewModel.onSubtitleSelected(SubtitleMode.Off)
            advanceUntilIdle()
            assertNull(engine.activeSubtitle)
            assertEquals(SubtitleMode.Off, settingsRepository.state.value.subtitles)
            assertNull(viewModel.uiState.value.subtitleCode)
        }

    @Test
    fun `quality options and live rendition follow the engine tracks`() =
        runTest(dispatcher) {
            val viewModel = createViewModel()
            advanceUntilIdle()

            engine.setTracks(
                AvailableTracks(videoShortSides = listOf(360, 720), playingWidth = 360, playingHeight = 640),
            )
            advanceUntilIdle()

            assertEquals(
                listOf(VideoQuality.AUTO, VideoQuality.P720, VideoQuality.P360),
                viewModel.uiState.value.qualityOptions,
            )
            // Auto mode: the UI renders the localised "Auto · 360p" from these two fields.
            assertNull(viewModel.uiState.value.manualQualityLabel)
            assertEquals(360, viewModel.uiState.value.playingShortSide)
        }

    private class FakePlayerSettingsRepository : PlayerSettingsRepository {
        val state = MutableStateFlow(PlayerSettings())
        override val settings: StateFlow<PlayerSettings> = state

        override suspend fun setSpeed(speed: Float) = state.update { it.copy(speed = speed) }

        override suspend fun setQuality(quality: VideoQuality) = state.update { it.copy(quality = quality) }

        override suspend fun setSubtitles(mode: SubtitleMode) = state.update { it.copy(subtitles = mode) }
    }

    private class RecordingAnalytics : AnalyticsTracker {
        val events = mutableListOf<AnalyticsEvent>()

        override fun track(event: AnalyticsEvent) {
            events += event
        }

        override fun setUserId(userId: String?) = Unit
    }

    private class FakePlaybackEngine : PlaybackEngine {
        private val eventsFlow = MutableSharedFlow<PlaybackEvent>()
        override val events: SharedFlow<PlaybackEvent> = eventsFlow
        override val activePlayer: StateFlow<Player?> = MutableStateFlow(null)
        private val positionFlow = MutableStateFlow(PlaybackPosition())
        override val position: StateFlow<PlaybackPosition> = positionFlow
        private val tracksFlow = MutableStateFlow(AvailableTracks())
        override val tracks: StateFlow<AvailableTracks> = tracksFlow
        var speed = 1f
        var maxShortSide = 0
        var activeSubtitle: String? = null

        fun setTracks(tracks: AvailableTracks) {
            tracksFlow.value = tracks
        }

        var playlistSize = 0
        private val sources = mutableMapOf<Int, PlaybackSource>()
        val played = mutableListOf<Pair<Int, Long>>()
        var pauseCount = 0
        var resumeCount = 0
        var lastSeek = -1L
        var isMutedNow = false
        var released = false

        suspend fun emit(event: PlaybackEvent) = eventsFlow.emit(event)

        fun setPosition(
            positionMs: Long,
            durationMs: Long,
        ) {
            positionFlow.value = PlaybackPosition(positionMs, durationMs, durationMs)
        }

        override fun setPlaylist(count: Int) {
            playlistSize = count
            sources.clear()
        }

        override fun growPlaylist(count: Int) {
            if (count > playlistSize) playlistSize = count
        }

        val restarted = mutableListOf<Pair<Int, Long>>()

        override fun restart(
            index: Int,
            startPositionMs: Long,
        ) {
            restarted += index to startPositionMs
        }

        override fun setSource(
            index: Int,
            source: PlaybackSource,
        ) {
            sources[index] = source
        }

        override fun hasSource(index: Int): Boolean = sources.containsKey(index)

        override fun play(
            index: Int,
            startPositionMs: Long,
        ) {
            played += index to startPositionMs
        }

        override fun stop() = Unit

        override fun togglePlayPause() = Unit

        override fun pause() {
            pauseCount++
        }

        override fun resume() {
            resumeCount++
        }

        override fun seekTo(positionMs: Long) {
            lastSeek = positionMs
            positionFlow.value = positionFlow.value.copy(positionMs = positionMs)
        }

        override fun setMuted(muted: Boolean) {
            isMutedNow = muted
        }

        override fun setPlaybackSpeed(speed: Float) {
            this.speed = speed
        }

        override fun setMaxVideoShortSide(shortSide: Int) {
            maxShortSide = shortSide
        }

        override fun setSubtitleLanguage(language: String?) {
            activeSubtitle = language
        }

        override fun currentPositionMs(): Long = positionFlow.value.positionMs

        override fun currentDurationMs(): Long = positionFlow.value.durationMs

        override fun release() {
            released = true
        }
    }
}
