package com.drama.feature.series

import androidx.lifecycle.SavedStateHandle
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.share.HostShareLinkProvider
import com.drama.core.ui.text.UiText
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.GenreLabels
import com.drama.domain.model.LedgerPage
import com.drama.domain.model.LedgerType
import com.drama.domain.model.LikeState
import com.drama.domain.model.ResumeTarget
import com.drama.domain.model.Series
import com.drama.domain.model.UnlockAllQuote
import com.drama.domain.model.UnlockAllResult
import com.drama.domain.model.UnlockResult
import com.drama.domain.model.Wallet
import com.drama.domain.model.WatchHistoryEntry
import com.drama.domain.model.WatchProgress
import com.drama.domain.repository.FavoritesRepository
import com.drama.domain.repository.GenresRepository
import com.drama.domain.repository.PushRepository
import com.drama.domain.repository.UnlockRepository
import com.drama.domain.repository.WalletRepository
import com.drama.domain.usecase.ObserveSeriesDetailUseCase
import com.drama.domain.usecase.SeriesDetail
import com.drama.feature.series.navigation.SeriesRoute
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
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
class SeriesViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val details = MutableSharedFlow<SeriesDetail>(replay = 1)
    private val events = mutableListOf<AnalyticsEvent>()
    private val analytics =
        object : AnalyticsTracker {
            override fun track(event: AnalyticsEvent) {
                events += event
            }

            override fun setUserId(userId: String?) = Unit
        }

    private val episodes = (1..4).map { episode(it, if (it <= 2) EpisodeAccess.FREE else EpisodeAccess.LOCKED) }

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    /** [source] null = a deep link: the route was parsed from the URL and carries no explicit source. */
    private fun viewModel(source: String? = SeriesRoute.SOURCE_HOME) =
        SeriesViewModel(
            savedStateHandle =
                SavedStateHandle(
                    buildMap {
                        put(SeriesRoute.ARG_SERIES_ID, "s1")
                        source?.let { put(SeriesRoute.ARG_SOURCE, it) }
                    },
                ),
            observeSeriesDetail = ObserveSeriesDetailUseCase { details },
            favorites = favorites,
            shareLinks = HostShareLinkProvider("links.drama.example"),
            analytics = analytics,
            push = push,
            wallet = walletRepository,
            unlocks = unlocks,
            genres = FakeGenresRepository(),
        )

    private val favorites = FakeFavoritesRepository()
    private val push = FakePushRepository()
    private val walletRepository = FakeWalletRepository()
    private val unlocks =
        object : UnlockRepository {
            override suspend fun unlock(
                seriesId: String,
                episodeId: String,
            ): AppResult<UnlockResult> = AppResult.Failure(AppError.NotFound("not used"))

            override suspend fun refreshUnlocks(seriesId: String): AppResult<Set<String>> =
                AppResult.Success(emptySet())

            override suspend fun quoteUnlockAll(seriesId: String): AppResult<UnlockAllQuote> =
                AppResult.Success(UnlockAllQuote(lockedCount = 0, fullPrice = 0, discountPercent = 0, price = 0))

            override suspend fun unlockAll(seriesId: String): AppResult<UnlockAllResult> =
                AppResult.Failure(AppError.NotFound("not used"))
        }

    private class FakeGenresRepository : GenresRepository {
        override val labels: Flow<GenreLabels> = MutableStateFlow(GenreLabels.EMPTY)

        override suspend fun refresh(force: Boolean): GenreLabels = GenreLabels.EMPTY
    }

    @Test
    fun `first favourite asks for the notification permission once`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            details.emit(SeriesDetail(series(), episodes, null, isRefreshing = false, error = null))
            advanceUntilIdle()
            viewModel.onToggleFavorite()
            advanceUntilIdle()
            assertTrue(viewModel.uiState.value.requestNotificationPermission)
            viewModel.onNotificationPermissionPrompted()
            advanceUntilIdle()
            assertFalse(viewModel.uiState.value.requestNotificationPermission)
            assertTrue(push.shown.value)
            viewModel.onToggleFavorite() // remove
            advanceUntilIdle()
            viewModel.onToggleFavorite() // add again: already prompted
            advanceUntilIdle()
            assertFalse(viewModel.uiState.value.requestNotificationPermission)
        }

    private class FakeWalletRepository : WalletRepository {
        val state = MutableStateFlow<Wallet?>(null)
        var refreshResult: AppResult<Wallet> =
            AppResult.Success(
                Wallet(purchased = 50, bonus = 0, total = 50, autoUnlock = false),
            )
        var autoUnlockResult: AppResult<Unit> = AppResult.Success(Unit)
        val autoUnlockCalls = mutableListOf<Boolean>()
        override val wallet: Flow<Wallet?> = state

        override suspend fun refresh(): AppResult<Wallet> {
            (refreshResult as? AppResult.Success)?.let { state.value = it.value }
            return refreshResult
        }

        override suspend fun transactions(
            page: Int,
            pageSize: Int,
            type: LedgerType?,
        ): AppResult<LedgerPage> = AppResult.Success(LedgerPage(emptyList(), 0, page, pageSize))

        override suspend fun setAutoUnlock(enabled: Boolean): AppResult<Unit> {
            autoUnlockCalls += enabled
            if (autoUnlockResult is AppResult.Success) {
                state.value =
                    (state.value ?: Wallet.EMPTY).copy(autoUnlock = enabled)
            }
            return autoUnlockResult
        }
    }

    private class FakePushRepository : PushRepository {
        val shown = MutableStateFlow(false)
        override val permissionPromptShown: Flow<Boolean> = shown

        override suspend fun markPermissionPromptShown() {
            shown.value = true
        }

        override suspend fun syncToken(force: Boolean): AppResult<Unit> = AppResult.Success(Unit)

        override suspend fun onNewToken(token: String): AppResult<Unit> = AppResult.Success(Unit)

        override suspend fun unregister(): AppResult<Unit> = AppResult.Success(Unit)
    }

    @Test
    fun `favorite heart is optimistic and rolls back on failure`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            details.emit(SeriesDetail(series(), episodes, null, isRefreshing = false, error = null))
            advanceUntilIdle()
            assertFalse(viewModel.uiState.value.isFavorite)

            viewModel.onToggleFavorite()
            advanceUntilIdle()
            assertTrue(viewModel.uiState.value.isFavorite)
            assertEquals(UiText.Res(R.string.series_notice_added), viewModel.uiState.value.notice)
            assertTrue(events.contains(AnalyticsEvent.Favorite("s1", added = true, source = "home")))

            favorites.failNext = true
            viewModel.onToggleFavorite()
            advanceUntilIdle()
            assertTrue(viewModel.uiState.value.isFavorite) // rolled back to "favorite"
            assertEquals(UiText.Res(R.string.series_notice_favorite_failed), viewModel.uiState.value.notice)
        }

    @Test
    fun `like toggles the count optimistically and share tracks the event`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            details.emit(
                SeriesDetail(
                    series().copy(likes = 10, liked = false),
                    episodes,
                    null,
                    isRefreshing = false,
                    error = null,
                ),
            )
            advanceUntilIdle()
            assertEquals(LikeState(10, liked = false), viewModel.uiState.value.likeState)

            viewModel.onToggleLike()
            assertEquals(LikeState(11, liked = true), viewModel.uiState.value.likeState)
            advanceUntilIdle()
            assertEquals(LikeState(42, liked = true), viewModel.uiState.value.likeState) // server count wins

            val text = viewModel.onShare()
            assertTrue(text.contains("https://links.drama.example/s/s1"))
            assertTrue(events.contains(AnalyticsEvent.Share("s1", "series")))
        }

    private class FakeFavoritesRepository : FavoritesRepository {
        private val ids = MutableStateFlow<Set<String>>(emptySet())
        var failNext = false

        override fun observeFavorites(): Flow<List<Series>> = MutableStateFlow(emptyList())

        override fun observeFavoriteIds(): Flow<Set<String>> = ids

        override fun observeIsFavorite(seriesId: String): Flow<Boolean> = ids.map { seriesId in it }

        override suspend fun refreshFavorites(): AppResult<Unit> = AppResult.Success(Unit)

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
        ): AppResult<LikeState> = AppResult.Success(LikeState(42, liked))

        override suspend fun clear() = Unit
    }

    @Test
    fun `never watched - first episode and Regarder`() {
        val target = ResumeTarget.resolve(episodes, history = null, lastProgress = null)
        assertEquals("ep1", target?.episodeId)
        assertFalse(target!!.isResume)
    }

    @Test
    fun `in progress - last watched episode is resumed`() {
        val target = ResumeTarget.resolve(episodes, history("ep2", 2), WatchProgress("ep2", "s1", 10_000, 30_000))
        assertEquals("ep2", target?.episodeId)
        assertTrue(target!!.isResume)
    }

    @Test
    fun `completed episode - the next one is proposed`() {
        val target =
            ResumeTarget.resolve(
                episodes,
                history("ep2", 2),
                WatchProgress("ep2", "s1", 30_000, 30_000, completed = true),
            )
        assertEquals("ep3", target?.episodeId)
        assertEquals(3, target?.episodeIndex)
        assertTrue(target!!.isResume)
    }

    @Test
    fun `completed last episode - stays on it, empty list gives null`() {
        val target =
            ResumeTarget.resolve(
                episodes,
                history("ep4", 4),
                WatchProgress("ep4", "s1", 30_000, 30_000, completed = true),
            )
        assertEquals("ep4", target?.episodeId)
        assertNull(ResumeTarget.resolve(emptyList(), history("ep4", 4), null))
    }

    @Test
    fun `history pointing to a removed episode falls back to the first one`() {
        val target = ResumeTarget.resolve(episodes, history("gone", 9), null)
        assertEquals("ep1", target?.episodeId)
        assertFalse(target!!.isResume)
    }

    @Test
    fun `tracks series_view with the navigation source and exposes the resume label`() =
        runTest(dispatcher) {
            val vm = viewModel(source = null)
            assertEquals(AnalyticsEvent.SeriesView("s1", "deeplink"), events.single())

            details.emit(
                SeriesDetail(
                    series = null,
                    episodes = emptyList(),
                    resumeTarget = null,
                    isRefreshing = true,
                    error = null,
                ),
            )
            advanceUntilIdle()
            assertTrue(vm.uiState.value.isLoading)

            details.emit(
                SeriesDetail(
                    series = series(),
                    episodes = episodes,
                    resumeTarget = ResumeTarget("ep2", 2, isResume = true),
                    isRefreshing = false,
                    error = null,
                ),
            )
            advanceUntilIdle()
            val loaded = vm.uiState.value
            assertFalse(loaded.isLoading)
            assertEquals(UiText.of(R.string.series_resume_episode, 2), loaded.primaryActionLabel)
            assertEquals(4, loaded.episodes.size)

            details.emit(
                SeriesDetail(
                    series = series(),
                    episodes = episodes,
                    resumeTarget = ResumeTarget("ep1", 1, isResume = false),
                    isRefreshing = false,
                    error = AppError.Network(),
                ),
            )
            advanceUntilIdle()
            val stale = vm.uiState.value
            assertEquals(UiText.Res(CoreR.string.action_watch), stale.primaryActionLabel)
            assertFalse(stale.showError)
            assertTrue(stale.error is AppError.Network)

            vm.onToggleSynopsis()
            assertTrue(vm.uiState.value.synopsisExpanded)
        }

    @Test
    fun `in-app navigation reports its own source`() =
        runTest(dispatcher) {
            viewModel(source = "search")
            assertEquals(AnalyticsEvent.SeriesView("s1", "search"), events.single())
        }

    @Test
    fun `error without cache shows the error state`() =
        runTest(dispatcher) {
            val vm = viewModel()
            details.emit(
                SeriesDetail(
                    null,
                    emptyList(),
                    null,
                    isRefreshing = false,
                    error = AppError.NotFound("SERIES_NOT_FOUND"),
                ),
            )
            advanceUntilIdle()
            assertTrue(vm.uiState.value.showError)
            assertFalse(vm.uiState.value.isLoading)
        }

    private fun series() = Series("s1", "s1", "Série", "Synopsis", null, null, listOf("drame"), 4, 2, 10, "PG12")

    private fun episode(
        index: Int,
        access: EpisodeAccess,
    ) = Episode(
        "ep$index",
        "s1",
        index,
        "Ep $index",
        30_000,
        null,
        access,
        if (access ==
            EpisodeAccess.LOCKED
        ) {
            10
        } else {
            0
        },
    )

    private fun history(
        episodeId: String,
        index: Int,
    ) = WatchHistoryEntry("s1", episodeId, index, 10_000, 1L)
}
