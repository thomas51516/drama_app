package com.drama.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.result.AppError
import com.drama.core.common.result.Resource
import com.drama.core.ui.text.UiText
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
import com.drama.core.ui.R as CoreR

/**
 * One card of a home row, flattened for the UI. [resumeEpisodeId] is set on the continue-watching row only.
 * [subtitle] and [badge] are [UiText] so the view model never formats a localised string (S05-A2-03).
 */
data class HomeCard(
    val seriesId: String,
    val title: String,
    val posterUrl: String?,
    val subtitle: UiText?,
    val badge: UiText? = null,
    val progress: Float? = null,
    val resumeEpisodeId: String? = null,
)

/** A home row: server titles are [UiText.Raw], the local continue-watching title is a resource. */
data class HomeRowUi(
    val key: String,
    val title: UiText,
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

        private var languageTag: String? = null

        /**
         * Home rows are localised server-side (`Accept-Language`). The view model survives the activity
         * recreation that follows a language change (S05-A1-03), so the screen reports the locale it renders
         * with and a change triggers a fresh fetch; the first report only records the tag.
         */
        fun onLanguageChanged(tag: String) {
            val previous = languageTag
            languageTag = tag
            if (previous != null && previous != tag) load()
        }

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
            val CONTINUE_WATCHING_TITLE: UiText = UiText.Res(R.string.home_continue_watching)

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
                            title = serverContinue?.title?.let(UiText::Raw) ?: CONTINUE_WATCHING_TITLE,
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
                        HomeRowUi(
                            key = row.key,
                            title = UiText.Raw(row.title),
                            type = row.type,
                            cards = row.items.map { it.toCard(continueWatching = false) },
                        )
                }
                if (continueRow != null && !continueInserted) result.add(0, continueRow)
                return result
            }

            private fun ContinueWatchingItem.toCard() =
                HomeCard(
                    seriesId = series.id,
                    title = series.title,
                    posterUrl = series.posterVerticalUrl,
                    subtitle = UiText.of(CoreR.string.episode_number, episodeIndex),
                    badge = UiText.of(CoreR.string.episode_short, episodeIndex),
                    progress = progressFraction ?: 0f,
                    resumeEpisodeId = episodeId,
                )

            private fun HomeItem.toCard(continueWatching: Boolean): HomeCard {
                val resume = episode?.takeIf { continueWatching }
                val genre = series.genres.firstOrNull()?.replaceFirstChar(Char::titlecase)
                val count = series.episodeCount
                return HomeCard(
                    seriesId = series.id,
                    title = series.title,
                    posterUrl = series.posterVerticalUrl,
                    subtitle =
                        when {
                            resume != null -> UiText.of(CoreR.string.episode_number, resume.index)
                            genre != null -> UiText.Plural(R.plurals.home_card_meta, count, listOf(count, genre))
                            else -> UiText.Plural(CoreR.plurals.episode_count_short, count)
                        },
                    badge = resume?.let { UiText.of(CoreR.string.episode_short, it.index) },
                    progress = if (continueWatching) progressFraction ?: 0f else null,
                    resumeEpisodeId = resume?.id,
                )
            }
        }
    }
