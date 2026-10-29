package com.drama.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.result.AppError
import com.drama.core.common.result.Resource
import com.drama.domain.model.HomeContent
import com.drama.domain.usecase.ObserveHomeUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val content: HomeContent? = null,
    val error: AppError? = null,
) {
    val showError: Boolean get() = error != null && content == null
}

@HiltViewModel
class HomeViewModel
    @Inject
    constructor(
        private val observeHome: ObserveHomeUseCase,
        private val analytics: AnalyticsTracker,
    ) : ViewModel() {
        private val uiStateFlow = MutableStateFlow(HomeUiState())
        val uiState: StateFlow<HomeUiState> = uiStateFlow.asStateFlow()

        private var collectJob: Job? = null

        init {
            load()
        }

        /** (Re)starts the stale-while-revalidate collection; used by the retry button and pull-to-refresh. */
        fun retry() = load()

        fun onSeriesClicked(seriesId: String) {
            analytics.track(AnalyticsEvent.SeriesView(seriesId = seriesId, source = "home"))
        }

        private fun load() {
            collectJob?.cancel()
            collectJob =
                viewModelScope.launch {
                    observeHome().collect { resource ->
                        uiStateFlow.update { state ->
                            when (resource) {
                                is Resource.Loading ->
                                    state.copy(
                                        isLoading = resource.data == null,
                                        isRefreshing = resource.data != null,
                                        content = resource.data ?: state.content,
                                        error = null,
                                    )
                                is Resource.Success ->
                                    state.copy(
                                        isLoading = false,
                                        isRefreshing = false,
                                        content = resource.data,
                                        error = null,
                                    )
                                is Resource.Error ->
                                    state.copy(
                                        isLoading = false,
                                        isRefreshing = false,
                                        content = resource.data ?: state.content,
                                        error = resource.error,
                                    )
                            }
                        }
                    }
                }
        }
    }
