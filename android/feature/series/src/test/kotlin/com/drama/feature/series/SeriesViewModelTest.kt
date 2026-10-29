package com.drama.feature.series

import androidx.lifecycle.SavedStateHandle
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.result.AppError
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.ResumeTarget
import com.drama.domain.model.Series
import com.drama.domain.model.WatchHistoryEntry
import com.drama.domain.model.WatchProgress
import com.drama.domain.usecase.ObserveSeriesDetailUseCase
import com.drama.domain.usecase.SeriesDetail
import com.drama.feature.series.navigation.SeriesRoute
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
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

    private fun viewModel(
        source: String? = null,
        deepLink: Boolean = false,
    ) = SeriesViewModel(
        savedStateHandle =
            SavedStateHandle(
                buildMap {
                    put(SeriesRoute.ARG_SERIES_ID, "s1")
                    source?.let { put(SeriesRoute.ARG_SOURCE, it) }
                    if (deepLink) put(androidx.navigation.NavController.KEY_DEEP_LINK_INTENT, "intent")
                },
            ),
        observeSeriesDetail = ObserveSeriesDetailUseCase { details },
        analytics = analytics,
    )

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
            val vm = viewModel(source = SeriesRoute.SOURCE_HOME, deepLink = true)
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
            assertEquals("Reprendre l'épisode 2", loaded.primaryActionLabel)
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
            assertEquals("Regarder", stale.primaryActionLabel)
            assertFalse(stale.showError)
            assertTrue(stale.error is AppError.Network)

            vm.onToggleSynopsis()
            assertTrue(vm.uiState.value.synopsisExpanded)
        }

    @Test
    fun `source defaults to home without a deep link`() =
        runTest(dispatcher) {
            viewModel()
            assertEquals(AnalyticsEvent.SeriesView("s1", "home"), events.single())
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
