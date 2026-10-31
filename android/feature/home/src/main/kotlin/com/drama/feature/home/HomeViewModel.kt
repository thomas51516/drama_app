package com.drama.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.Resource
import com.drama.core.ui.text.UiText
import com.drama.domain.model.ContinueWatchingItem
import com.drama.domain.model.GenreLabels
import com.drama.domain.model.HomeBanner
import com.drama.domain.model.HomeContent
import com.drama.domain.model.HomeItem
import com.drama.domain.model.HomeRowType
import com.drama.domain.model.RankingPeriod
import com.drama.domain.model.Rankings
import com.drama.domain.repository.GenresRepository
import com.drama.domain.repository.RankingsRepository
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
    /** True for the "Top du jour" row (M-04): the title opens the rankings screen. */
    val opensRankings: Boolean = false,
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
        private val rankings: RankingsRepository,
        private val genres: GenresRepository,
    ) : ViewModel() {
        private val uiStateFlow = MutableStateFlow(HomeUiState())
        val uiState: StateFlow<HomeUiState> = uiStateFlow.asStateFlow()

        private var collectJob: Job? = null
        private var serverContent: HomeContent? = null
        private var localContinue: List<ContinueWatchingItem> = emptyList()
        private var topOfDay: Rankings? = null
        private var genreLabels: GenreLabels = GenreLabels.EMPTY

        init {
            viewModelScope.launch {
                observeContinueWatching(CONTINUE_WATCHING_LIMIT).collect { items ->
                    localContinue = items
                    publish()
                }
            }
            viewModelScope.launch {
                genres.labels.collect { labels ->
                    genreLabels = labels
                    publish()
                }
            }
            viewModelScope.launch { genres.refresh() }
            load()
        }

        /** (Re)starts the stale-while-revalidate collection; used by the retry button and pull-to-refresh. */
        fun refresh() {
            load()
            viewModelScope.launch { genres.refresh(force = true) }
        }

        /** "Top du jour" (M-04): `GET /rankings?period=day`; absent (404/501, offline) the row is simply not shown. */
        private fun loadTopOfDay() {
            viewModelScope.launch {
                when (val result = rankings.rankings(RankingPeriod.DAY)) {
                    is AppResult.Success -> {
                        topOfDay = result.value
                        publish()
                    }
                    is AppResult.Failure -> Unit
                }
            }
        }

        private var languageTag: String? = null

        /**
         * Home rows are localised server-side (`Accept-Language`). The view model survives the activity
         * recreation that follows a language change (S05-A1-03), so the screen reports the locale it renders
         * with and a change triggers a fresh fetch; the first report only records the tag.
         */
        fun onLanguageChanged(tag: String) {
            val previous = languageTag
            languageTag = tag
            if (previous != null && previous != tag) {
                load()
                // DEF-013 : sans cela, les libellés de genre restaient dans l'ancienne langue tant
                // qu'un autre écran ne rafraîchissait pas le cache partagé de GenresRepository.
                viewModelScope.launch { genres.refresh() }
            }
        }

        private fun load() {
            loadTopOfDay()
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
            val rows = buildRows(content, localContinue, topOfDay, genreLabels)
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
            const val TOP_OF_DAY_KEY = "top_of_day"
            const val TOP_OF_DAY_LIMIT = 10
            val CONTINUE_WATCHING_TITLE: UiText = UiText.Res(R.string.home_continue_watching)
            val TOP_OF_DAY_TITLE: UiText = UiText.Res(R.string.home_top_of_day)

            /**
             * Rows shown on screen: empty rows are dropped; the continue-watching row merges the local history
             * (fresher, newest first) with the server row (synced across devices), de-duplicated by series, and is
             * placed first when the server did not position one. Completed local entries are kept out. The
             * "Top du jour" row (M-04) follows the continue-watching row, before the configured rows.
             */
            fun buildRows(
                content: HomeContent?,
                local: List<ContinueWatchingItem>,
                topOfDay: Rankings? = null,
                genreLabels: GenreLabels = GenreLabels.EMPTY,
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
                        .map { it.toCard(continueWatching = true, genreLabels = genreLabels) }
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
                val topRow =
                    topOfDay?.items?.take(TOP_OF_DAY_LIMIT)?.takeIf { it.isNotEmpty() }?.let { items ->
                        HomeRowUi(
                            key = TOP_OF_DAY_KEY,
                            title = TOP_OF_DAY_TITLE,
                            type = HomeRowType.TRENDING,
                            cards =
                                items.map { item ->
                                    HomeCard(
                                        seriesId = item.series.id,
                                        title = item.series.title,
                                        posterUrl = item.series.posterVerticalUrl,
                                        subtitle =
                                            item.series.genres.firstOrNull()?.let { genre ->
                                                UiText.Plural(
                                                    R.plurals.home_card_meta,
                                                    item.series.episodeCount,
                                                    listOf(item.series.episodeCount, genreLabels.label(genre)),
                                                )
                                            }
                                                ?: UiText.Plural(
                                                    CoreR.plurals.episode_count_short,
                                                    item.series.episodeCount,
                                                ),
                                        badge = UiText.of(R.string.home_rank_badge, item.rank),
                                    )
                                },
                            opensRankings = true,
                        )
                    }
                val result = mutableListOf<HomeRowUi>()
                var continueInserted = false
                if (topRow != null && continueRow == null) result += topRow
                serverRows.forEach { row ->
                    if (row.type == HomeRowType.CONTINUE_WATCHING) {
                        if (continueRow != null && !continueInserted) {
                            result += continueRow
                            continueInserted = true
                            topRow?.let { result += it }
                        }
                        return@forEach
                    }
                    if (row.items.isEmpty()) return@forEach
                    result +=
                        HomeRowUi(
                            key = row.key,
                            title = UiText.Raw(row.title),
                            type = row.type,
                            cards = row.items.map { it.toCard(continueWatching = false, genreLabels = genreLabels) },
                        )
                }
                if (continueRow != null && !continueInserted) {
                    result.add(0, continueRow)
                    topRow?.let { result.add(1, it) }
                }
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

            private fun HomeItem.toCard(
                continueWatching: Boolean,
                genreLabels: GenreLabels,
            ): HomeCard {
                val resume = episode?.takeIf { continueWatching }
                val genre = series.genres.firstOrNull()?.let(genreLabels::label)
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
