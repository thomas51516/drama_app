package com.drama.feature.feed

import androidx.media3.common.Player
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.network.FixedNetworkStatus
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.core.player.engine.AvailableTracks
import com.drama.core.player.engine.PlaybackEngine
import com.drama.core.player.engine.PlaybackEngineFactory
import com.drama.core.player.engine.PlaybackEvent
import com.drama.core.player.engine.PlaybackPosition
import com.drama.core.ui.text.UiText
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.FeedItem
import com.drama.domain.model.FeedPage
import com.drama.domain.model.LikeState
import com.drama.domain.model.PlaySession
import com.drama.domain.model.PlaybackSource
import com.drama.domain.model.PlayerSettings
import com.drama.domain.model.Series
import com.drama.domain.model.SignedUrlPolicy
import com.drama.domain.model.StreamFormat
import com.drama.domain.model.SubtitleMode
import com.drama.domain.model.VideoQuality
import com.drama.domain.model.WatchProgress
import com.drama.domain.repository.FavoritesRepository
import com.drama.domain.repository.FeedRepository
import com.drama.domain.repository.PlaybackRepository
import com.drama.domain.repository.PlayerSettingsRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import com.drama.core.ui.R as CoreR

@OptIn(ExperimentalCoroutinesApi::class)
class FeedViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val engine = FakePlaybackEngine()
    private val favorites = FakeFavoritesRepository()
    private val events = mutableListOf<AnalyticsEvent>()
    private val analytics =
        object : AnalyticsTracker {
            override fun track(event: AnalyticsEvent) {
                events += event
            }

            override fun setUserId(userId: String?) = Unit
        }
    private var now = 0L

    /** Follows the test scheduler so timers and `expiresAt` comparisons agree. */
    private val clock = Clock { now + dispatcher.scheduler.currentTime }

    /** Two pages of three items; the cursor of page 1 is "c1". */
    private val pages =
        mutableMapOf<String?, FeedPage>(
            null to FeedPage((1..3).map { item(it) }, nextCursor = "c1"),
            "c1" to FeedPage((4..6).map { item(it) }, nextCursor = null),
        )
    private val feedCalls = mutableListOf<String?>()
    private val feedRepository =
        object : FeedRepository {
            override suspend fun load(
                cursor: String?,
                limit: Int,
            ): AppResult<FeedPage> {
                feedCalls += cursor
                return pages[cursor]?.let { AppResult.Success(it) } ?: AppResult.Failure(AppError.Network())
            }
        }
    private val playCalls = mutableListOf<String>()

    /** Expiry of the next `/play` answers; once drained the URLs never expire, so no timer outlives a test. */
    private val playExpiries = ArrayDeque<Long>()

    /** When set, every `/play` call fails with this error. */
    private var playFailure: AppError? = null
    private val playback =
        object : PlaybackRepository {
            override suspend fun startPlayback(episodeId: String): AppResult<PlaySession> {
                playCalls += episodeId
                playFailure?.let { return AppResult.Failure(it) }
                return AppResult.Success(
                    PlaySession(
                        episodeId = episodeId,
                        seriesId = "s",
                        episodeNumber = 1,
                        source = PlaybackSource("https://cdn/$episodeId/fresh.m3u8", StreamFormat.HLS),
                        expiresAtEpochMs = playExpiries.removeFirstOrNull() ?: SignedUrlPolicy.NEVER_EXPIRES,
                        resumePositionMs = 0L,
                        durationMs = 15_000L,
                        nextEpisodeId = null,
                        subtitles = emptyList(),
                    ),
                )
            }

            override suspend fun reportProgress(progress: WatchProgress): AppResult<Unit> = AppResult.Success(Unit)
        }

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel() =
        FeedViewModel(
            feedRepository = feedRepository,
            favorites = favorites,
            playback = playback,
            analytics = analytics,
            clock = clock,
            logger = NoOpLogger,
            engineFactory = PlaybackEngineFactory { engine },
            playerSettings = FakePlayerSettingsRepository(),
            networkStatus = FixedNetworkStatus(metered = false),
        )

    @Test
    fun `first page autoplays the first preview muted and attaches the next one`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            runCurrent()

            val state = viewModel.uiState.value
            assertFalse(state.isLoading)
            assertEquals(3, state.items.size)
            assertEquals(3, engine.playlistSize)
            assertTrue(engine.isMutedNow)
            assertEquals(listOf(0 to 0L), engine.played)
            assertEquals("https://cdn/preview1.m3u8", engine.sources[0]?.url)
            assertEquals("https://cdn/preview2.m3u8", engine.sources[1]?.url)
            assertTrue(playCalls.isEmpty()) // valid previews need no /play
            assertEquals(FeedPageState.Ready, state.pageState(0))
            assertEquals(listOf(AnalyticsEvent.SeriesView("s1", "feed")), events)
        }

    @Test
    fun `approaching the end loads the next page with the cursor and grows the playlist`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            runCurrent()
            assertEquals(listOf<String?>(null), feedCalls)

            viewModel.onPageSettled(1)
            runCurrent()
            assertEquals(listOf(null, "c1"), feedCalls)
            assertEquals(6, viewModel.uiState.value.items.size)
            assertEquals(6, engine.playlistSize)
            assertTrue(viewModel.uiState.value.endReached)
            assertEquals(listOf(0, 1), engine.played.map { it.first })
            assertEquals(listOf("s1", "s2"), events.filterIsInstance<AnalyticsEvent.SeriesView>().map { it.seriesId })

            viewModel.onPageSettled(5)
            runCurrent()
            assertEquals(2, feedCalls.size) // no cursor left: nothing more requested
        }

    @Test
    fun `an expired preview is re-resolved through play before starting`() =
        runTest(dispatcher) {
            pages[null] = FeedPage(listOf(item(1, previewExpiresAt = 10_000L), item(2)), nextCursor = null)
            now = 0L
            val viewModel = viewModel()
            runCurrent()
            // 10 s left < 30 s margin: /play is asked first.
            assertEquals(listOf("ep1"), playCalls)
            assertEquals("https://cdn/ep1/fresh.m3u8", engine.sources[0]?.url)
            assertEquals(listOf(0 to 0L), engine.played)
            assertEquals(FeedPageState.Ready, viewModel.uiState.value.pageState(0))
        }

    @Test
    fun `playing preview is refreshed thirty seconds before expiry without restarting`() =
        runTest(dispatcher) {
            pages[null] = FeedPage(listOf(item(1, previewExpiresAt = 100_000L)), nextCursor = null)
            viewModel()
            runCurrent()
            assertTrue(playCalls.isEmpty())

            playExpiries += 70_001L + 600_000L // the refreshed URL expires 10 min later: a second refresh follows
            advanceTimeBy(70_001)
            runCurrent()
            assertEquals(listOf("ep1"), playCalls)
            assertEquals("https://cdn/ep1/fresh.m3u8", engine.sources[0]?.url)
            assertEquals(1, engine.played.size)
            assertTrue(engine.restarted.isEmpty())

            // The chain continues for the new expiry: next refresh 30 s before it, not earlier.
            advanceTimeBy(569_999)
            runCurrent()
            assertEquals(1, playCalls.size)
            advanceTimeBy(2)
            runCurrent()
            assertEquals(listOf("ep1", "ep1"), playCalls)
        }

    @Test
    fun `http 403 re-resolves once and restarts at the same position then fails`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            runCurrent()
            engine.setPosition(4_000, 15_000)

            engine.emit(PlaybackEvent.Error(0, "ERROR_CODE_IO_BAD_HTTP_STATUS", httpStatus = 403))
            runCurrent()
            assertEquals(listOf("ep1"), playCalls)
            assertEquals(listOf(0 to 4_000L), engine.restarted)
            assertEquals(FeedPageState.Ready, viewModel.uiState.value.pageState(0))

            engine.emit(PlaybackEvent.Error(0, "ERROR_CODE_IO_BAD_HTTP_STATUS", httpStatus = 403))
            runCurrent()
            assertEquals(1, playCalls.size)
            assertEquals(
                FeedPageState.Failed(UiText.of(R.string.feed_playback_failed_reason, "ERROR_CODE_IO_BAD_HTTP_STATUS")),
                viewModel.uiState.value.pageState(0),
            )
        }

    @Test
    fun `a failed resolution exposes a localised message`() =
        runTest(dispatcher) {
            pages[null] = FeedPage(listOf(item(1, previewExpiresAt = 10_000L)), nextCursor = null)
            playFailure = AppError.Network()
            val viewModel = viewModel()
            runCurrent()
            assertEquals(
                FeedPageState.Failed(UiText.Res(CoreR.string.error_network_short)),
                viewModel.uiState.value.pageState(0),
            )
        }

    @Test
    fun `hidden tab pauses and visible tab resumes the current page`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            runCurrent()
            engine.setPosition(3_000, 15_000)
            runCurrent()

            viewModel.setVisible(false)
            assertEquals(1, engine.pauseCount)
            viewModel.setVisible(true)
            runCurrent()
            assertEquals(listOf(0 to 0L, 0 to 3_000L), engine.played)
        }

    @Test
    fun `tap unmutes and favorite toggle is optimistic with rollback`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            runCurrent()

            viewModel.onTap()
            assertFalse(engine.isMutedNow)
            assertFalse(viewModel.uiState.value.isMuted)

            val item = viewModel.uiState.value.items[0]
            viewModel.onToggleFavorite(item)
            runCurrent()
            assertTrue(viewModel.uiState.value.isFavorite(item))
            assertTrue(events.contains(AnalyticsEvent.Favorite("s1", added = true, source = "feed")))

            favorites.failNext = true
            viewModel.onToggleFavorite(item)
            runCurrent()
            assertTrue(viewModel.uiState.value.isFavorite(item)) // rolled back
            assertTrue(viewModel.uiState.value.error is AppError.Network)
        }

    @Test
    fun `feed failure shows the error state and retry reloads`() =
        runTest(dispatcher) {
            pages.remove(null)
            val viewModel = viewModel()
            runCurrent()
            assertTrue(viewModel.uiState.value.showError)

            pages[null] = FeedPage(listOf(item(1)), nextCursor = null)
            viewModel.retry()
            runCurrent()
            assertFalse(viewModel.uiState.value.showError)
            assertEquals(1, viewModel.uiState.value.items.size)
        }

    private fun item(
        n: Int,
        previewExpiresAt: Long = Long.MAX_VALUE,
    ) = FeedItem(
        series = Series("s$n", "s$n", "Série $n", "", null, null, listOf("drame"), 3, 2, 10, "ALL", likes = n * 10),
        episode = Episode("ep$n", "s$n", 1, "Pilote", 15_000L, null, EpisodeAccess.FREE, 0),
        previewUrl = "https://cdn/preview$n.m3u8",
        previewExpiresAtEpochMs = previewExpiresAt,
        isFavorite = false,
        likes = n * 10,
    )

    private class FakeFavoritesRepository : FavoritesRepository {
        private val ids = MutableStateFlow<Set<String>>(emptySet())
        var failNext = false
        var refreshCalls = 0

        override fun observeFavorites(): Flow<List<Series>> = MutableStateFlow(emptyList())

        override fun observeFavoriteIds(): Flow<Set<String>> = ids

        override fun observeIsFavorite(seriesId: String): Flow<Boolean> = ids.map { seriesId in it }

        override suspend fun refreshFavorites(): AppResult<Unit> {
            refreshCalls++
            return AppResult.Success(Unit)
        }

        override suspend fun setFavorite(
            series: Series,
            favorite: Boolean,
        ): AppResult<Unit> {
            if (failNext) {
                failNext = false
                return AppResult.Failure(AppError.Network())
            }
            ids.value = if (favorite) ids.value + series.id else ids.value - series.id
            return AppResult.Success(Unit)
        }

        override fun observeLikeState(seriesId: String): Flow<LikeState?> = MutableStateFlow(null)

        override suspend fun setLiked(
            seriesId: String,
            liked: Boolean,
        ): AppResult<LikeState> = AppResult.Success(LikeState(1, liked))

        override suspend fun clear() = Unit
    }

    private class FakePlaybackEngine : PlaybackEngine {
        private val eventsFlow = MutableSharedFlow<PlaybackEvent>()
        override val events: SharedFlow<PlaybackEvent> = eventsFlow
        override val activePlayer: StateFlow<Player?> = MutableStateFlow(null)
        private val positionFlow = MutableStateFlow(PlaybackPosition())
        override val position: StateFlow<PlaybackPosition> = positionFlow
        override val tracks: StateFlow<AvailableTracks> = MutableStateFlow(AvailableTracks())

        var playlistSize = 0
        val sources = mutableMapOf<Int, PlaybackSource>()
        val played = mutableListOf<Pair<Int, Long>>()
        val restarted = mutableListOf<Pair<Int, Long>>()
        var pauseCount = 0
        var isMutedNow = false

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

        override fun restart(
            index: Int,
            startPositionMs: Long,
        ) {
            restarted += index to startPositionMs
        }

        override fun stop() = Unit

        override fun togglePlayPause() = Unit

        override fun pause() {
            pauseCount++
        }

        override fun resume() = Unit

        override fun seekTo(positionMs: Long) {
            positionFlow.value = positionFlow.value.copy(positionMs = positionMs)
        }

        override fun setMuted(muted: Boolean) {
            isMutedNow = muted
        }

        override fun setPlaybackSpeed(speed: Float) = Unit

        override fun setMaxVideoShortSide(shortSide: Int) = Unit

        override fun setSubtitleLanguage(language: String?) = Unit

        override fun currentPositionMs(): Long = positionFlow.value.positionMs

        override fun currentDurationMs(): Long = positionFlow.value.durationMs

        override fun release() = Unit
    }
}

private class FakePlayerSettingsRepository : PlayerSettingsRepository {
    override val settings: Flow<PlayerSettings> = MutableStateFlow(PlayerSettings())
    override val dataSaver: Flow<Boolean> = MutableStateFlow(false)

    override suspend fun setSpeed(speed: Float) = Unit

    override suspend fun setQuality(quality: VideoQuality) = Unit

    override suspend fun setSubtitles(mode: SubtitleMode) = Unit

    override suspend fun setDataSaver(enabled: Boolean) = Unit
}
