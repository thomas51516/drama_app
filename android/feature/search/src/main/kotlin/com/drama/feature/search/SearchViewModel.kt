package com.drama.feature.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.GenreLabels
import com.drama.domain.model.Series
import com.drama.domain.repository.GenresRepository
import com.drama.domain.repository.SearchRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.drama.core.ui.R as CoreR

data class SearchUiState(
    val query: String = "",
    val selectedGenre: String? = null,
    val suggestions: List<String> = emptyList(),
    val recentSearches: List<String> = emptyList(),
    val results: List<Series> = emptyList(),
    val total: Int = 0,
    /** True once a search ran for the current query (drives the empty state). */
    val searched: Boolean = false,
    val isSearching: Boolean = false,
    val error: AppError? = null,
    /** Localised genre labels (DEF-012): the server's list when fetched, the capitalised keys otherwise. */
    val genreLabels: GenreLabels = GenreLabels.EMPTY,
) {
    val isIdle: Boolean get() = query.trim().length < SearchRepository.MIN_QUERY_LENGTH
    val showEmpty: Boolean get() = searched && !isSearching && error == null && results.isEmpty()
    val showSuggestions: Boolean get() = !isIdle && !searched && suggestions.isNotEmpty()

    /** Genre keys offered as chips: the server's genres (DEF-012) or the fixed defaults, plus what the results carry. */
    val genreChips: List<String>
        get() = (genreLabels.keys.ifEmpty { DEFAULT_GENRES } + results.flatMap { it.genres }).distinct()

    /** Label shown on a chip for [genre]. */
    fun genreLabel(genre: String): String = genreLabels.label(genre)

    /** User-facing message for [error], resolved by the UI (S05-A2-03). */
    val errorMessage: UiText?
        get() =
            when (val error = error) {
                null -> null
                is AppError.Network -> UiText.Res(CoreR.string.error_network)
                is AppError.Server -> UiText.of(CoreR.string.error_server, error.code)
                is AppError.Http ->
                    if (error.code == HTTP_NOT_IMPLEMENTED) {
                        UiText.Res(R.string.search_error_coming_soon)
                    } else {
                        UiText.Res(R.string.search_error_failed)
                    }
                else -> UiText.Res(R.string.search_error_failed)
            }

    companion object {
        /** Catalogue genre keys (server identifiers, shown capitalised as-is). */
        val DEFAULT_GENRES = listOf("romance", "drame", "comédie", "thriller", "famille", "action")
        private const val HTTP_NOT_IMPLEMENTED = 501
    }
}

/**
 * Search (M-03, S05-A1-01): typing is debounced ([DEBOUNCE_MS]) into `GET /search/suggest`; submitting (or
 * picking a suggestion / recent / genre chip) runs `GET /search` and records the query locally (10 max).
 */
@OptIn(FlowPreview::class)
@HiltViewModel
class SearchViewModel
    @Inject
    constructor(
        private val repository: SearchRepository,
        private val analytics: AnalyticsTracker,
        private val genres: GenresRepository,
    ) : ViewModel() {
        private val uiStateFlow = MutableStateFlow(SearchUiState())
        val uiState: StateFlow<SearchUiState> = uiStateFlow.asStateFlow()

        private val queryInput = MutableStateFlow("")
        private var searchJob: Job? = null

        init {
            viewModelScope.launch {
                repository.recentSearches.collect { recent -> uiStateFlow.update { it.copy(recentSearches = recent) } }
            }
            viewModelScope.launch {
                genres.labels.collect { labels ->
                    uiStateFlow.update { it.copy(genreLabels = labels) }
                }
            }
            viewModelScope.launch { genres.refresh() }
            viewModelScope.launch {
                queryInput
                    .debounce(DEBOUNCE_MS)
                    .distinctUntilChanged()
                    .collect { query -> loadSuggestions(query) }
            }
        }

        fun onQueryChanged(query: String) {
            uiStateFlow.update {
                it.copy(
                    query = query,
                    searched = false,
                    error = null,
                    suggestions = if (query.isBlank()) emptyList() else it.suggestions,
                )
            }
            queryInput.value = query
        }

        /** Keyboard "search" action or a tap on a suggestion / recent query. */
        fun onSubmit(query: String = uiStateFlow.value.query) {
            val trimmed = query.trim()
            if (trimmed.length < SearchRepository.MIN_QUERY_LENGTH) return
            uiStateFlow.update { it.copy(query = trimmed, suggestions = emptyList()) }
            queryInput.value = trimmed
            runSearch(trimmed, uiStateFlow.value.selectedGenre, record = true)
        }

        fun onGenreSelected(genre: String?) {
            val selected = if (uiStateFlow.value.selectedGenre == genre) null else genre
            uiStateFlow.update { it.copy(selectedGenre = selected) }
            val query = uiStateFlow.value.query.trim()
            if (query.length >= SearchRepository.MIN_QUERY_LENGTH) {
                runSearch(query, selected, record = false)
            } else if (selected != null) {
                // Genre alone: search the genre name so the chip is useful before anything is typed.
                runSearch(selected, selected, record = false)
            }
        }

        fun onClear() {
            searchJob?.cancel()
            queryInput.value = ""
            uiStateFlow.update {
                it.copy(
                    query = "",
                    suggestions = emptyList(),
                    results = emptyList(),
                    total = 0,
                    searched = false,
                    error = null,
                )
            }
        }

        fun onRemoveRecent(query: String) {
            viewModelScope.launch { repository.removeRecentSearch(query) }
        }

        fun onClearRecent() {
            viewModelScope.launch { repository.clearRecentSearches() }
        }

        fun retry() {
            val query = uiStateFlow.value.query.trim()
            if (query.isNotEmpty()) runSearch(query, uiStateFlow.value.selectedGenre, record = false)
        }

        private fun loadSuggestions(query: String) {
            if (query.trim().length < SearchRepository.MIN_QUERY_LENGTH) {
                uiStateFlow.update { it.copy(suggestions = emptyList()) }
                return
            }
            // A search already ran for this query: its own suggestions (empty results) must stay.
            if (uiStateFlow.value.searched) return
            viewModelScope.launch {
                val result = repository.suggest(query)
                if (uiStateFlow.value.query != query) return@launch
                val suggestions = (result as? AppResult.Success)?.value.orEmpty()
                uiStateFlow.update { it.copy(suggestions = suggestions) }
            }
        }

        private fun runSearch(
            query: String,
            genre: String?,
            record: Boolean,
        ) {
            searchJob?.cancel()
            uiStateFlow.update { it.copy(isSearching = true, error = null) }
            // Recorded outside the cancellable search: a quick second submit must not lose the first query.
            if (record) viewModelScope.launch { repository.addRecentSearch(query) }
            searchJob =
                viewModelScope.launch {
                    when (val result = repository.search(query, genre)) {
                        is AppResult.Success -> {
                            val page = result.value
                            analytics.track(AnalyticsEvent.Search(query, page.total))
                            uiStateFlow.update {
                                it.copy(
                                    isSearching = false,
                                    searched = true,
                                    results = page.items,
                                    total = page.total,
                                    suggestions = if (page.items.isEmpty()) page.suggestions else emptyList(),
                                )
                            }
                        }
                        is AppResult.Failure ->
                            uiStateFlow.update {
                                it.copy(
                                    isSearching = false,
                                    searched = true,
                                    results = emptyList(),
                                    total = 0,
                                    error = result.error,
                                )
                            }
                    }
                }
        }

        companion object {
            const val DEBOUNCE_MS = 300L
        }
    }
