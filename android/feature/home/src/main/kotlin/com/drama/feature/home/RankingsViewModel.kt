package com.drama.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.GenreLabels
import com.drama.domain.model.RankingItem
import com.drama.domain.model.RankingPeriod
import com.drama.domain.repository.GenresRepository
import com.drama.domain.repository.RankingsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.drama.core.ui.R as CoreR

data class RankingsUiState(
    val period: RankingPeriod = RankingPeriod.DAY,
    /** Selected genre key; null = all genres. */
    val genre: String? = null,
    val genreLabels: GenreLabels = GenreLabels.EMPTY,
    val items: List<RankingItem> = emptyList(),
    val isLoading: Boolean = true,
    val error: UiText? = null,
) {
    val showError: Boolean get() = error != null && items.isEmpty()
    val isEmpty: Boolean get() = !isLoading && error == null && items.isEmpty()

    /** Genre chips: the localised catalogue genres (DEF-012). */
    val genreChips: List<String> get() = genreLabels.keys

    fun genreLabel(key: String): String = genreLabels.label(key)
}

/** "Classements" (S10-A1-02, M-04): period tabs (jour / semaine / toujours) and genre chips over `GET /rankings`. */
@HiltViewModel
class RankingsViewModel
    @Inject
    constructor(
        private val rankings: RankingsRepository,
        private val genres: GenresRepository,
    ) : ViewModel() {
        private val uiStateFlow = MutableStateFlow(RankingsUiState())
        val uiState: StateFlow<RankingsUiState> = uiStateFlow.asStateFlow()

        private var loadJob: Job? = null

        init {
            viewModelScope.launch {
                genres.labels.collect { labels ->
                    uiStateFlow.update { it.copy(genreLabels = labels) }
                }
            }
            viewModelScope.launch { genres.refresh() }
            load()
        }

        fun onPeriodSelected(period: RankingPeriod) {
            if (period == uiStateFlow.value.period) return
            uiStateFlow.update { it.copy(period = period) }
            load()
        }

        /** Tapping the selected chip clears the genre filter. */
        fun onGenreSelected(genre: String?) {
            val selected = if (uiStateFlow.value.genre == genre) null else genre
            uiStateFlow.update { it.copy(genre = selected) }
            load()
        }

        fun retry() = load()

        private fun load() {
            val state = uiStateFlow.value
            loadJob?.cancel()
            uiStateFlow.update { it.copy(isLoading = true, error = null) }
            loadJob =
                viewModelScope.launch {
                    when (val result = rankings.rankings(state.period, state.genre)) {
                        is AppResult.Success ->
                            uiStateFlow.update { it.copy(isLoading = false, items = result.value.items, error = null) }
                        is AppResult.Failure ->
                            uiStateFlow.update {
                                it.copy(isLoading = false, items = emptyList(), error = result.error.toMessage())
                            }
                    }
                }
        }

        private fun AppError.toMessage(): UiText =
            when (this) {
                is AppError.Network -> UiText.Res(CoreR.string.error_network)
                is AppError.Server -> UiText.of(CoreR.string.error_server, code)
                is AppError.NotFound -> UiText.Res(CoreR.string.state_coming_soon)
                is AppError.Http ->
                    if (code == HTTP_NOT_IMPLEMENTED) {
                        UiText.Res(CoreR.string.state_coming_soon)
                    } else {
                        UiText.Res(R.string.rankings_error_load)
                    }
                else -> UiText.Res(R.string.rankings_error_load)
            }

        private companion object {
            const val HTTP_NOT_IMPLEMENTED = 501
        }
    }
