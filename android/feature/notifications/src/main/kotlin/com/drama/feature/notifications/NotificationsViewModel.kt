package com.drama.feature.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.AppNotification
import com.drama.domain.model.NotificationTarget
import com.drama.domain.repository.NotificationsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.drama.core.ui.R as CoreR

data class NotificationsUiState(
    val items: List<AppNotification> = emptyList(),
    /** First page in flight with nothing to show yet. */
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val hasMore: Boolean = false,
    /** Blocking error (nothing to show); null when the list is usable. */
    val error: UiText? = null,
    /** True when [error] comes from a connectivity failure. */
    val isOffline: Boolean = false,
    /** The server does not expose the history yet (404 / 501): empty list with a hint, not an error. */
    val isComingSoon: Boolean = false,
) {
    val showEmpty: Boolean get() = !isLoading && error == null && items.isEmpty()
    val unreadCount: Int get() = items.count { !it.isRead }
}

/**
 * In-app notification history (M-54, S06-A1-02): paginated `GET /me/notifications`, pull-to-refresh, reload on
 * push arrival, optimistic mark-as-read on tap and a one-shot routing target for the navigation graph.
 */
@HiltViewModel
class NotificationsViewModel
    @Inject
    constructor(
        private val repository: NotificationsRepository,
        private val logger: Logger,
    ) : ViewModel() {
        private val uiStateFlow = MutableStateFlow(NotificationsUiState())
        val uiState: StateFlow<NotificationsUiState> = uiStateFlow.asStateFlow()

        private val pendingTargetFlow = MutableStateFlow<NotificationTarget?>(null)

        /** Routing target of the last tapped notification; consumed by the screen with [onTargetConsumed]. */
        val pendingTarget: StateFlow<NotificationTarget?> = pendingTargetFlow.asStateFlow()

        private var nextPage = FIRST_PAGE
        private var pageJob: Job? = null

        init {
            loadFirstPage(refreshing = false)
            viewModelScope.launch {
                // The first emission is the current value (state flow / replay); only later bumps mean a new push.
                repository.invalidations
                    .drop(
                        1,
                    ).collect { loadFirstPage(refreshing = uiStateFlow.value.items.isNotEmpty()) }
            }
        }

        fun refresh() = loadFirstPage(refreshing = true)

        /** Also used by the retry button: reloads from scratch, showing the full-screen loader again. */
        fun retry() = loadFirstPage(refreshing = false)

        fun loadMore() {
            val state = uiStateFlow.value
            if (!state.hasMore || state.isLoading || state.isRefreshing || state.isLoadingMore) return
            uiStateFlow.update { it.copy(isLoadingMore = true) }
            pageJob =
                viewModelScope.launch {
                    when (val result = repository.getPage(nextPage)) {
                        is AppResult.Success -> {
                            val page = result.value
                            uiStateFlow.update { current ->
                                val known = current.items.mapTo(HashSet()) { it.id }
                                current.copy(
                                    items = current.items + page.items.filter { known.add(it.id) },
                                    hasMore = page.hasMore,
                                    isLoadingMore = false,
                                )
                            }
                            nextPage = page.page + 1
                        }
                        is AppResult.Failure -> {
                            logger.w(TAG, "loadMore page=$nextPage failed: ${result.error}")
                            uiStateFlow.update { it.copy(isLoadingMore = false) }
                        }
                    }
                }
        }

        fun onNotificationClicked(item: AppNotification) {
            if (!item.isRead) {
                val now = System.currentTimeMillis()
                uiStateFlow.update { state ->
                    state.copy(items = state.items.map { if (it.id == item.id) it.copy(readAtEpochMs = now) else it })
                }
                viewModelScope.launch {
                    val result = repository.markRead(item.id)
                    if (result is AppResult.Failure) logger.w(TAG, "markRead ${item.id} failed: ${result.error}")
                }
            }
            pendingTargetFlow.value = item.target
        }

        fun onTargetConsumed() {
            pendingTargetFlow.value = null
        }

        private fun loadFirstPage(refreshing: Boolean) {
            pageJob?.cancel()
            uiStateFlow.update {
                it.copy(
                    isLoading = !refreshing,
                    isRefreshing = refreshing,
                    isLoadingMore = false,
                    error = null,
                    isOffline = false,
                )
            }
            pageJob =
                viewModelScope.launch {
                    when (val result = repository.getPage(FIRST_PAGE)) {
                        is AppResult.Success -> {
                            val page = result.value
                            nextPage = page.page + 1
                            uiStateFlow.update {
                                it.copy(
                                    items = page.items.distinctBy { item -> item.id },
                                    hasMore = page.hasMore,
                                    isLoading = false,
                                    isRefreshing = false,
                                    isComingSoon = false,
                                )
                            }
                        }
                        is AppResult.Failure -> onFirstPageFailed(result.error)
                    }
                }
        }

        private fun onFirstPageFailed(error: AppError) {
            logger.w(TAG, "getPage failed: $error")
            if (error.isNotAvailableYet()) {
                nextPage = FIRST_PAGE
                uiStateFlow.update {
                    it.copy(
                        items = emptyList(),
                        hasMore = false,
                        isLoading = false,
                        isRefreshing = false,
                        isComingSoon = true,
                    )
                }
                return
            }
            uiStateFlow.update {
                it.copy(
                    isLoading = false,
                    isRefreshing = false,
                    // Keep whatever was already shown; only block the screen when there is nothing to show.
                    error = if (it.items.isEmpty()) error.toUiText() else null,
                    isOffline = it.items.isEmpty() && error is AppError.Network,
                )
            }
        }

        private fun AppError.isNotAvailableYet(): Boolean =
            this is AppError.NotFound ||
                (this is AppError.Http && code == HTTP_NOT_FOUND) ||
                (this is AppError.Server && code == HTTP_NOT_IMPLEMENTED) ||
                (this is AppError.Http && code == HTTP_NOT_IMPLEMENTED)

        private fun AppError.toUiText(): UiText =
            when (this) {
                is AppError.Network -> UiText.Res(CoreR.string.error_network)
                is AppError.Server -> UiText.of(CoreR.string.error_server, code)
                else -> UiText.Res(CoreR.string.error_generic)
            }

        private companion object {
            const val TAG = "Notifications"
            const val FIRST_PAGE = 1
            const val HTTP_NOT_FOUND = 404
            const val HTTP_NOT_IMPLEMENTED = 501
        }
    }
