package com.drama.feature.search

import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.GenreLabels
import com.drama.domain.model.SearchResult
import com.drama.domain.model.Series
import com.drama.domain.repository.GenresRepository
import com.drama.domain.repository.SearchRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import com.drama.core.ui.R as CoreR

@OptIn(ExperimentalCoroutinesApi::class)
class SearchViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val repository = FakeSearchRepository()
    private val events = mutableListOf<AnalyticsEvent>()
    private val analytics =
        object : AnalyticsTracker {
            override fun track(event: AnalyticsEvent) {
                events += event
            }

            override fun setUserId(userId: String?) = Unit
        }

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel() = SearchViewModel(repository, analytics, FakeGenresRepository())

    @Test
    fun `typing is debounced into one suggestion call for the last query`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            viewModel.onQueryChanged("l")
            viewModel.onQueryChanged("la")
            viewModel.onQueryChanged("lag")
            advanceTimeBy(SearchViewModel.DEBOUNCE_MS - 1)
            runCurrent()
            assertTrue(repository.suggestCalls.isEmpty())

            advanceTimeBy(2)
            runCurrent()
            assertEquals(listOf("lag"), repository.suggestCalls)
            assertEquals(listOf("Le Secret du Lagon"), viewModel.uiState.value.suggestions)
            assertTrue(viewModel.uiState.value.showSuggestions)
        }

    @Test
    fun `submitting searches records the query and exposes results`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            viewModel.onQueryChanged("lagon")
            viewModel.onSubmit()
            advanceUntilIdle()

            val state = viewModel.uiState.value
            assertEquals(listOf("lagon" to null), repository.searchCalls)
            assertEquals(1, state.results.size)
            assertEquals(1, state.total)
            assertTrue(state.searched)
            assertFalse(state.isSearching)
            assertEquals(listOf("lagon"), state.recentSearches)
            assertEquals(listOf(AnalyticsEvent.Search("lagon", 1)), events)
        }

    @Test
    fun `queries shorter than two characters are ignored`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            viewModel.onQueryChanged("a")
            viewModel.onSubmit()
            advanceUntilIdle()
            assertTrue(repository.searchCalls.isEmpty())
            assertTrue(repository.suggestCalls.isEmpty())
            assertTrue(viewModel.uiState.value.isIdle)
        }

    @Test
    fun `genre chip filters the current query and toggles off`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            viewModel.onQueryChanged("lagon")
            viewModel.onSubmit()
            advanceUntilIdle()
            viewModel.onGenreSelected("drame")
            advanceUntilIdle()
            assertEquals("lagon" to "drame", repository.searchCalls.last())
            viewModel.onGenreSelected("drame")
            advanceUntilIdle()
            assertEquals("lagon" to null, repository.searchCalls.last())
        }

    @Test
    fun `empty results keep the server suggestions and errors are exposed`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            viewModel.onQueryChanged("zzz")
            viewModel.onSubmit()
            advanceUntilIdle()
            assertTrue(viewModel.uiState.value.showEmpty)
            assertEquals(listOf("Le Secret du Lagon"), viewModel.uiState.value.suggestions)

            repository.failNext = true
            viewModel.onSubmit("lagon")
            advanceUntilIdle()
            assertTrue(viewModel.uiState.value.error is AppError.Network)
            assertEquals(UiText.Res(CoreR.string.error_network), viewModel.uiState.value.errorMessage)
            assertTrue(
                viewModel.uiState.value.results
                    .isEmpty(),
            )
        }

    @Test
    fun `a 501 answer is announced as coming soon, other failures as a plain error`() {
        assertEquals(
            UiText.Res(R.string.search_error_coming_soon),
            SearchUiState(error = AppError.Http(501)).errorMessage,
        )
        assertEquals(UiText.Res(R.string.search_error_failed), SearchUiState(error = AppError.Http(400)).errorMessage)
        assertEquals(
            UiText.of(CoreR.string.error_server, 503),
            SearchUiState(error = AppError.Server(503)).errorMessage,
        )
        assertEquals(null, SearchUiState().errorMessage)
    }

    @Test
    fun `recent searches are capped at ten most recent and clearable`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            (1..12).forEach { viewModel.onSubmit("requête $it") }
            advanceUntilIdle()
            assertEquals(10, viewModel.uiState.value.recentSearches.size)
            assertEquals(
                "requête 12",
                viewModel.uiState.value.recentSearches
                    .first(),
            )
            viewModel.onClearRecent()
            advanceUntilIdle()
            assertTrue(
                viewModel.uiState.value.recentSearches
                    .isEmpty(),
            )
        }

    private class FakeSearchRepository : SearchRepository {
        val suggestCalls = mutableListOf<String>()
        val searchCalls = mutableListOf<Pair<String, String?>>()
        var failNext = false
        private val recent = MutableStateFlow<List<String>>(emptyList())
        private val series =
            Series("s1", "le-secret-du-lagon", "Le Secret du Lagon", "", null, null, listOf("drame"), 3, 2, 10, "PG12")

        override suspend fun search(
            query: String,
            genre: String?,
            page: Int,
            pageSize: Int,
        ): AppResult<SearchResult> {
            searchCalls += query to genre
            if (failNext) {
                failNext = false
                return AppResult.Failure(AppError.Network())
            }
            val items = if (series.title.contains(query, ignoreCase = true)) listOf(series) else emptyList()
            return AppResult.Success(SearchResult(query, items, items.size, page, pageSize, listOf(series.title)))
        }

        override suspend fun suggest(query: String): AppResult<List<String>> {
            suggestCalls += query
            return AppResult.Success(listOf(series.title))
        }

        override val recentSearches: Flow<List<String>> = recent

        override suspend fun addRecentSearch(query: String) {
            recent.value = (listOf(query) + recent.value.filterNot { it.equals(query, ignoreCase = true) }).take(10)
        }

        override suspend fun removeRecentSearch(query: String) {
            recent.value = recent.value - query
        }

        override suspend fun clearRecentSearches() {
            recent.value = emptyList()
        }
    }
}

private class FakeGenresRepository : GenresRepository {
    override val labels: Flow<GenreLabels> = MutableStateFlow(GenreLabels.EMPTY)

    override suspend fun refresh(force: Boolean): GenreLabels = GenreLabels.EMPTY
}
