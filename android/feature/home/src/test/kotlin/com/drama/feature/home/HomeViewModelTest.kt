package com.drama.feature.home

import com.drama.core.common.result.AppError
import com.drama.core.common.result.Resource
import com.drama.core.ui.text.UiText
import com.drama.domain.model.ContinueWatchingItem
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.HomeBanner
import com.drama.domain.model.HomeContent
import com.drama.domain.model.HomeItem
import com.drama.domain.model.HomeRow
import com.drama.domain.model.HomeRowType
import com.drama.domain.model.Series
import com.drama.domain.usecase.ObserveContinueWatchingUseCase
import com.drama.domain.usecase.ObserveHomeUseCase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
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
class HomeViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val home = MutableSharedFlow<Resource<HomeContent>>(replay = 1)
    private val local = MutableStateFlow<List<ContinueWatchingItem>>(emptyList())

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private var homeLoads = 0

    private fun viewModel() =
        HomeViewModel(
            observeHome =
                ObserveHomeUseCase {
                    homeLoads++
                    home
                },
            observeContinueWatching = ObserveContinueWatchingUseCase { local },
        )

    @Test
    fun `a language change refetches the home, the first report and repeats do not`() =
        runTest(dispatcher) {
            val vm = viewModel()
            advanceUntilIdle()
            assertEquals(1, homeLoads)
            vm.onLanguageChanged("fr-FR")
            vm.onLanguageChanged("fr-FR")
            advanceUntilIdle()
            assertEquals(1, homeLoads)
            vm.onLanguageChanged("en")
            advanceUntilIdle()
            assertEquals(2, homeLoads)
        }

    @Test
    fun `empty rows are dropped and banners are exposed`() {
        val rows =
            HomeViewModel.buildRows(
                HomeContent(
                    banners = listOf(banner("b1", "s1")),
                    rows =
                        listOf(
                            HomeRow("trending", "Tendances", listOf(HomeItem(series("s1")))),
                            HomeRow("new", "Nouveautés", emptyList()),
                            HomeRow("genre:romance", "Romance", listOf(HomeItem(series("s2"))), HomeRowType.GENRE),
                        ),
                ),
                local = emptyList(),
            )
        assertEquals(listOf("trending", "genre:romance"), rows.map { it.key })
        assertEquals(listOf(HomeRowType.TRENDING, HomeRowType.GENRE), rows.map { it.type })
        assertEquals(UiText.Raw("Tendances"), rows[0].title)
        val card = rows[0].cards.single()
        assertEquals("s1", card.seriesId)
        assertNull(card.resumeEpisodeId)
        assertNull(card.badge)
        // "12 ép. · Romance": the short episode count plural with the first genre capitalised.
        assertEquals(UiText.Plural(R.plurals.home_card_meta, 12, listOf(12, "Romance")), card.subtitle)
    }

    @Test
    fun `local history builds a continue-watching row placed first with progress and resume target`() {
        val rows =
            HomeViewModel.buildRows(
                HomeContent(emptyList(), listOf(HomeRow("trending", "Tendances", listOf(HomeItem(series("s1")))))),
                local =
                    listOf(
                        continueItem("s2", "ep2-3", 3, positionMs = 15_000, durationMs = 60_000, lastWatched = 2),
                        continueItem("s3", "ep3-1", 1, positionMs = 30_000, durationMs = 60_000, lastWatched = 5),
                        continueItem(
                            "s4",
                            "ep4-1",
                            1,
                            positionMs = 60_000,
                            durationMs = 60_000,
                            lastWatched = 9,
                            completed = true,
                        ),
                    ),
            )
        assertEquals(HomeRowType.CONTINUE_WATCHING, rows.first().type)
        assertEquals(UiText.Res(R.string.home_continue_watching), rows.first().title)
        // newest first, completed entries excluded
        assertEquals(listOf("s3", "s2"), rows.first().cards.map { it.seriesId })
        assertEquals(0.5f, rows.first().cards[0].progress)
        assertEquals("ep3-1", rows.first().cards[0].resumeEpisodeId)
        assertEquals(UiText.of(CoreR.string.episode_number, 1), rows.first().cards[0].subtitle)
        assertEquals(UiText.of(CoreR.string.episode_short, 1), rows.first().cards[0].badge)
        assertEquals(0.25f, rows.first().cards[1].progress)
        assertEquals("trending", rows[1].key)
    }

    @Test
    fun `server continue-watching row keeps its position and merges with local entries`() {
        val serverEpisode = episode("s9", "ep9-2", 2, durationMs = 100_000)
        val rows =
            HomeViewModel.buildRows(
                HomeContent(
                    emptyList(),
                    listOf(
                        HomeRow("trending", "Tendances", listOf(HomeItem(series("s1")))),
                        HomeRow(
                            "continue_watching",
                            "Reprendre",
                            listOf(
                                HomeItem(series("s9"), serverEpisode, positionMs = 25_000),
                                HomeItem(series("s2"), episode("s2", "ep2-1", 1), positionMs = 1_000),
                            ),
                            HomeRowType.CONTINUE_WATCHING,
                        ),
                    ),
                ),
                local = listOf(continueItem("s2", "ep2-3", 3, 15_000, 60_000, lastWatched = 1)),
            )
        assertEquals(listOf("trending", "continue_watching"), rows.map { it.key })
        val cw = rows[1]
        assertEquals(UiText.Raw("Reprendre"), cw.title)
        // local s2 wins over the server's s2; server-only s9 follows
        assertEquals(listOf("s2", "s9"), cw.cards.map { it.seriesId })
        assertEquals("ep2-3", cw.cards[0].resumeEpisodeId)
        assertEquals("ep9-2", cw.cards[1].resumeEpisodeId)
        assertEquals(0.25f, cw.cards[1].progress)
        assertEquals(UiText.of(CoreR.string.episode_number, 2), cw.cards[1].subtitle)
    }

    @Test
    fun `loading, success and stale error states`() =
        runTest(dispatcher) {
            val vm = viewModel()
            advanceUntilIdle()
            assertTrue(vm.uiState.value.isLoading)

            home.emit(Resource.Loading(null))
            advanceUntilIdle()
            assertTrue(vm.uiState.value.isLoading)

            val content =
                HomeContent(listOf(banner("b", "s1")), listOf(HomeRow("trending", "T", listOf(HomeItem(series("s1"))))))
            home.emit(Resource.Success(content))
            advanceUntilIdle()
            val loaded = vm.uiState.value
            assertFalse(loaded.isLoading)
            assertEquals(1, loaded.banners.size)
            assertEquals(1, loaded.rows.size)
            assertTrue(loaded.hasContent)

            home.emit(Resource.Error(AppError.Network(), content))
            advanceUntilIdle()
            val stale = vm.uiState.value
            assertFalse(stale.showError)
            assertTrue(stale.error is AppError.Network)
            assertEquals(1, stale.rows.size)
        }

    @Test
    fun `local continue watching appears even before the server answers`() =
        runTest(dispatcher) {
            val vm = viewModel()
            local.value = listOf(continueItem("s2", "ep2-1", 1, 5_000, 10_000, lastWatched = 1))
            advanceUntilIdle()
            val state = vm.uiState.value
            assertEquals(1, state.rows.size)
            assertEquals(HomeRowType.CONTINUE_WATCHING, state.rows.single().type)
        }

    private fun series(id: String) =
        Series(id, "slug-$id", "Série $id", "", null, null, listOf("romance"), 12, 3, 10, "PG12")

    private fun banner(
        id: String,
        seriesId: String,
    ) = HomeBanner(id, seriesId, "https://img/$id.jpg", "Bannière $id", null)

    private fun episode(
        seriesId: String,
        id: String,
        index: Int,
        durationMs: Long = 60_000,
    ) = Episode(id, seriesId, index, "Ep $index", durationMs, null, EpisodeAccess.FREE, 0)

    private fun continueItem(
        seriesId: String,
        episodeId: String,
        index: Int,
        positionMs: Long,
        durationMs: Long,
        lastWatched: Long,
        completed: Boolean = false,
    ) = ContinueWatchingItem(series(seriesId), episodeId, index, positionMs, durationMs, completed, lastWatched)
}
