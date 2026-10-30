package com.drama.feature.series

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.share.ShareLinkProvider
import com.drama.domain.model.Episode
import com.drama.domain.model.LikeState
import com.drama.domain.model.ResumeTarget
import com.drama.domain.model.Series
import com.drama.domain.repository.FavoritesRepository
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
    /** "Ma liste" membership (M-16), optimistic. */
    val isFavorite: Boolean = false,
    /** "J'aime" count and state; null until the catalogue or a toggle provides it. */
    val likeState: LikeState? = null,
    /** One-shot message (toggle rolled back, ...). */
    val notice: String? = null,
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
        private val favorites: FavoritesRepository,
        private val shareLinks: ShareLinkProvider,
        private val analytics: AnalyticsTracker,
    ) : ViewModel() {
        val seriesId: String = checkNotNull(savedStateHandle[SeriesRoute.ARG_SERIES_ID])

        /**
         * In-app navigation always sets the source; a deep link (share link, App Link) parses the route from the URL
         * and gets the route default. The NavController deep-link intent cannot be used: route navigation sets it too.
         */
        private val source: String = savedStateHandle[SeriesRoute.ARG_SOURCE] ?: SeriesRoute.SOURCE_DEEP_LINK

        private val uiStateFlow = MutableStateFlow(SeriesUiState())
        val uiState: StateFlow<SeriesUiState> = uiStateFlow.asStateFlow()

        private var collectJob: Job? = null

        init {
            analytics.track(AnalyticsEvent.SeriesView(seriesId = seriesId, source = source))
            viewModelScope.launch {
                favorites.observeIsFavorite(seriesId).collect { fav ->
                    uiStateFlow.update { it.copy(isFavorite = fav) }
                }
            }
            viewModelScope.launch {
                favorites.observeLikeState(seriesId).collect { like ->
                    uiStateFlow.update { state -> state.copy(likeState = like ?: state.likeState) }
                }
            }
            load()
        }

        fun retry() = load()

        fun onToggleSynopsis() = uiStateFlow.update { it.copy(synopsisExpanded = !it.synopsisExpanded) }

        /** Heart (M-16): optimistic through the repository; a failure rolls back and shows a notice. */
        fun onToggleFavorite() {
            val series = uiStateFlow.value.series ?: return
            val adding = !uiStateFlow.value.isFavorite
            analytics.track(AnalyticsEvent.Favorite(seriesId, adding, source))
            viewModelScope.launch {
                when (favorites.setFavorite(series, adding)) {
                    is AppResult.Success ->
                        uiStateFlow.update {
                            it.copy(notice = if (adding) "Ajouté à Ma liste" else "Retiré de Ma liste")
                        }
                    is AppResult.Failure ->
                        uiStateFlow.update { it.copy(notice = "Impossible de mettre à jour Ma liste") }
                }
            }
        }

        /** "J'aime" (M-16): optimistic count, server value wins. */
        fun onToggleLike() {
            val current = uiStateFlow.value.likeState ?: LikeState(uiStateFlow.value.series?.likes ?: 0, liked = false)
            val liked = !current.liked
            uiStateFlow.update {
                it.copy(likeState = LikeState((current.likes + if (liked) 1 else -1).coerceAtLeast(0), liked))
            }
            viewModelScope.launch {
                when (val result = favorites.setLiked(seriesId, liked)) {
                    is AppResult.Success -> uiStateFlow.update { it.copy(likeState = result.value) }
                    is AppResult.Failure ->
                        uiStateFlow.update {
                            it.copy(
                                likeState = current,
                                notice = "Impossible d'enregistrer votre J'aime",
                            )
                        }
                }
            }
        }

        /** Share sheet text (M-16): HTTPS App Link, the UI opens the system chooser. */
        fun onShare(): String {
            analytics.track(AnalyticsEvent.Share(seriesId, SHARE_SOURCE))
            return shareLinks.seriesLink(seriesId).shareText(uiStateFlow.value.series?.title)
        }

        fun onNoticeShown() = uiStateFlow.update { it.copy(notice = null) }

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
                                likeState =
                                    state.likeState
                                        ?: detail.series?.let { s -> s.likes?.let { LikeState(it, s.liked ?: false) } },
                            )
                        }
                    }
                }
        }

        private companion object {
            const val SHARE_SOURCE = "series"
        }
    }
