package com.drama.feature.series

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.result.AppError
import com.drama.domain.model.Episode
import com.drama.domain.model.ResumeTarget
import com.drama.domain.model.Series
import com.drama.domain.usecase.ObserveSeriesDetailUseCase
import com.drama.feature.series.navigation.SeriesRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SeriesUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val series: Series? = null,
    val episodes: List<Episode> = emptyList(),
    val resumeTarget: ResumeTarget? = null,
    val error: AppError? = null,
    val synopsisExpanded: Boolean = false,
) {
    val showError: Boolean get() = error != null && series == null

    /** Label of the primary button: "Regarder" for a fresh series, "Reprendre l'épisode N" afterwards. */
    val primaryActionLabel: String
        get() =
            when {
                resumeTarget == null -> "Regarder"
                resumeTarget.isResume -> "Reprendre l'épisode ${resumeTarget.episodeIndex}"
                else -> "Regarder"
            }
}

/** Series sheet (M-10): poster header, synopsis, episode grid with access status, resume target. */
@HiltViewModel
class SeriesViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val observeSeriesDetail: ObserveSeriesDetailUseCase,
        private val analytics: AnalyticsTracker,
    ) : ViewModel() {
        val seriesId: String = checkNotNull(savedStateHandle[SeriesRoute.ARG_SERIES_ID])

        /** A deep-link launch carries the intent under [NavController.KEY_DEEP_LINK_INTENT]; the route default is "home". */
        private val source: String =
            when {
                savedStateHandle.contains(NavController.KEY_DEEP_LINK_INTENT) -> SeriesRoute.SOURCE_DEEP_LINK
                else -> savedStateHandle[SeriesRoute.ARG_SOURCE] ?: SeriesRoute.SOURCE_HOME
            }

        private val uiStateFlow = MutableStateFlow(SeriesUiState())
        val uiState: StateFlow<SeriesUiState> = uiStateFlow.asStateFlow()

        private var collectJob: Job? = null

        init {
            analytics.track(AnalyticsEvent.SeriesView(seriesId = seriesId, source = source))
            load()
        }

        fun retry() = load()

        fun onToggleSynopsis() = uiStateFlow.update { it.copy(synopsisExpanded = !it.synopsisExpanded) }

        private fun load() {
            collectJob?.cancel()
            collectJob =
                viewModelScope.launch {
                    observeSeriesDetail(seriesId).collect { detail ->
                        uiStateFlow.update { state ->
                            state.copy(
                                isLoading = !detail.hasContent && detail.error == null,
                                isRefreshing = detail.isRefreshing && detail.hasContent,
                                series = detail.series ?: state.series,
                                episodes =
                                    detail.episodes.ifEmpty {
                                        if (detail.hasContent) emptyList() else state.episodes
                                    },
                                resumeTarget = detail.resumeTarget,
                                error = detail.error,
                            )
                        }
                    }
                }
        }
    }
