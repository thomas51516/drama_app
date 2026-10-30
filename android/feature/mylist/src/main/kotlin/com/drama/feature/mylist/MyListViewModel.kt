package com.drama.feature.mylist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.domain.model.Series
import com.drama.domain.repository.FavoritesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MyListUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val items: List<Series> = emptyList(),
    val error: AppError? = null,
    /** Set once a refresh answered (success or failure): the empty state is then meaningful. */
    val synced: Boolean = false,
) {
    val showEmpty: Boolean get() = !isLoading && items.isEmpty()
}

/** "Ma liste" tab (M-16, S05-A1-02): Room-cached favorites, pull-to-refresh, optimistic removal. */
@HiltViewModel
class MyListViewModel
    @Inject
    constructor(
        private val favorites: FavoritesRepository,
        private val analytics: AnalyticsTracker,
    ) : ViewModel() {
        private val uiStateFlow = MutableStateFlow(MyListUiState())
        val uiState: StateFlow<MyListUiState> = uiStateFlow.asStateFlow()

        init {
            viewModelScope.launch {
                favorites.observeFavorites().collect { items ->
                    uiStateFlow.update {
                        it.copy(
                            items = items,
                            isLoading =
                                it.isLoading && !it.synced && items.isEmpty(),
                        )
                    }
                }
            }
            refresh()
        }

        fun refresh() {
            if (uiStateFlow.value.isRefreshing) return
            uiStateFlow.update { it.copy(isRefreshing = true, error = null) }
            viewModelScope.launch {
                val result = favorites.refreshFavorites()
                uiStateFlow.update {
                    it.copy(
                        isRefreshing = false,
                        isLoading = false,
                        synced = true,
                        error = (result as? AppResult.Failure)?.error,
                    )
                }
            }
        }

        fun onRemove(series: Series) {
            analytics.track(AnalyticsEvent.Favorite(series.id, added = false, source = SOURCE))
            viewModelScope.launch {
                val result = favorites.setFavorite(series, favorite = false)
                if (result is AppResult.Failure) uiStateFlow.update { it.copy(error = result.error) }
            }
        }

        fun onErrorShown() = uiStateFlow.update { it.copy(error = null) }

        private companion object {
            const val SOURCE = "my_list"
        }
    }
