package com.drama.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.result.AppError
import com.drama.core.common.result.Resource
import com.drama.domain.model.ContinueWatchingItem
import com.drama.domain.model.HomeBanner
import com.drama.domain.model.HomeContent
import com.drama.domain.model.HomeItem
import com.drama.domain.model.HomeRowType
import com.drama.domain.usecase.ObserveContinueWatchingUseCase
import com.drama.domain.usecase.ObserveHomeUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** One card of a home row, flattened for the UI. [resumeEpisodeId] is set on the continue-watching row only. */
data class HomeCard(
    val seriesId: String,
    val title: String,
    val posterUrl: String?,
    val subtitle: String?,
    val badge: String? = null,
    val progress: Float? = null,
    val resumeEpisodeId: String? = null,
)

data class HomeRowUi(
    val key: String,
    val title: String,
    val type: HomeRowType,
    val cards: List<HomeCard>,
)

data class HomeUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val banners: List<HomeBanner> = emptyList(),
    val rows: List<HomeRowUi> = emptyList(),
    val error: AppError? = null,
    /** True once a (possibly stale) home has been loaded at least once. */
    val hasContent: Boolean = false,
) {
    val showError: Boolean get() = error != null && !hasContent
    val isEmpty: Boolean get() = hasContent && banners.isEmpty() && rows.isEmpty()
}

@HiltViewModel
class HomeViewModel
    @Inject
    constructor(
        private val observeHome: ObserveHomeUseCase,
        private val observeContinueWatching: ObserveContinueWatchingUseCase,
    ) : ViewModel() {
        private val uiStateFlow = MutableStateFlow(HomeUiState())
        val uiState: StateFlow<HomeUiState> = uiStateFlow.asStateFlow()

        private var collectJob: Job? = null
        private var serverContent: HomeContent? = null
        private var localContinue: List<ContinueWatchingItem> = emptyList()

        init {
            viewModelScope.launch {
                observeContinueWatching(CONTINUE_WATCHING_LIMIT).collect { items ->
                    localContinue = items
                    publish()
                }
            }
            load()
        }

        /** (Re)starts the stale-while-revalidate collection; used by the retry button and pull-to-refresh. */
        fun refresh() = load()

        private fun load() {
            collectJob?.cancel()
            collectJob =
                viewModelScope.launch {
                    observeHome().collect { resource ->
                        resource.data?.let { serverContent = it }
                        uiStateFlow.update { state ->
                            when (resource) {
                                is Resource.Loading ->
                                    state.copy(
                                        isLoading = resource.data == null && !state.hasContent,
                                        isRefreshing = resource.data != null || state.hasContent,
                                        error = null,
                                    )
                                is Resource.Success -> state.copy(isLoading = false, isRefreshing = false, error = null)
                                is Resource.Error ->
                                    state.copy(isLoading = false, isRefreshing = false, error = resource.error)
                            }
                        }
                        publish()
                    }
                }
        }

        private fun publish() {
            val content = serverContent
            if (content == null && localContinue.isEmpty()) return
            val rows = buildRows(content, localContinue)
            uiStateFlow.update {
                it.copy(
                    banners = content?.banners.orEmpty(),
                    rows = rows,
                    hasContent = content != null,
                    isLoading = content == null && it.isLoading,
                )
            }
        }

        companion object {
            const val CONTINUE_WATCHING_LIMIT = 10
            const val CONTINUE_WATCHING_KEY = "continue_watching"
            const val CONTINUE_WATCHING_TITLE = "Continuer à regarder"

            /**
             * Rows shown on screen: empty rows are dropped; the continue-watching row merges the local history
             * (fresher, newest first) with the server row (synced across devices), de-duplicated by series, and is
             * placed first when the server did not position one. Completed local entries are kept out.
             */
            fun buildRows(
                content: HomeContent?,
                local: List<ContinueWatchingItem>,
            ): List<HomeRowUi> {
                val serverRows = content?.rows.orEmpty()
                val serverContinue = serverRows.firstOrNull { it.type == HomeRowType.CONTINUE_WATCHING }
                val localCards =
                    local
                        .filter { !it.completed }
                        .sortedByDescending { it.lastWatchedAtEpochMs }
                        .map { it.toCard() }
                val serverCards =
                    serverContinue
                        ?.items
                        .orEmpty()
                        .filter { item -> localCards.none { it.seriesId == item.series.id } }
                        .map { it.toCard(continueWatching = true) }
                val continueCards = localCards + serverCards
                val continueRow =
                    continueCards.takeIf { it.isNotEmpty() }?.let {
                        HomeRowUi(
                            key = serverContinue?.key ?: CONTINUE_WATCHING_KEY,
                            title = serverContinue?.title ?: CONTINUE_WATCHING_TITLE,
                            type = HomeRowType.CONTINUE_WATCHING,
                            cards = it,
                        )
                    }
                val result = mutableListOf<HomeRowUi>()
                var continueInserted = false
                serverRows.forEach { row ->
                    if (row.type == HomeRowType.CONTINUE_WATCHING) {
                        if (continueRow != null && !continueInserted) {
                            result += continueRow
                            continueInserted = true
                        }
                        return@forEach
                    }
                    if (row.items.isEmpty()) return@forEach
                    result +=
                        HomeRowUi(row.key, row.title, row.type, row.items.map { it.toCard(continueWatching = false) })
                }
                if (continueRow != null && !continueInserted) result.add(0, continueRow)
                return result
            }

            private fun ContinueWatchingItem.toCard() =
                HomeCard(
                    seriesId = series.id,
                    title = series.title,
                    posterUrl = series.posterVerticalUrl,
                    subtitle = "Épisode $episodeIndex",
                    badge = "Ép. $episodeIndex",
                    progress = progressFraction ?: 0f,
                    resumeEpisodeId = episodeId,
                )

            private fun HomeItem.toCard(continueWatching: Boolean): HomeCard {
                val resume = episode?.takeIf { continueWatching }
                val genre = series.genres.firstOrNull()?.replaceFirstChar(Char::titlecase)
                return HomeCard(
                    seriesId = series.id,
                    title = series.title,
                    posterUrl = series.posterVerticalUrl,
                    subtitle =
                        if (resume != null) {
                            "Épisode ${resume.index}"
                        } else {
                            listOfNotNull("${series.episodeCount} ép.", genre).joinToString(" · ")
                        },
                    badge = resume?.let { "Ép. ${it.index}" },
                    progress = if (continueWatching) progressFraction ?: 0f else null,
                    resumeEpisodeId = resume?.id,
                )
            }
        }
    }
