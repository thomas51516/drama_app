package com.drama.feature.series

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.share.ShareLinkProvider
import com.drama.core.ui.text.UiText
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.LikeState
import com.drama.domain.model.ResumeTarget
import com.drama.domain.model.Series
import com.drama.domain.repository.FavoritesRepository
import com.drama.domain.repository.PushRepository
import com.drama.domain.repository.UnlockRepository
import com.drama.domain.repository.WalletRepository
import com.drama.domain.usecase.ObserveSeriesDetailUseCase
import com.drama.feature.series.navigation.SeriesRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.drama.core.ui.R as CoreR

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
    /** One-shot message (toggle rolled back, ...), resolved by the UI (S05-A2-03). */
    val notice: UiText? = null,
    /** One-shot (M-54): ask for POST_NOTIFICATIONS right after the first favourite, never at launch. */
    val requestNotificationPermission: Boolean = false,
    /** Coin balance for the header chip (M-32); null until `GET /wallet` answered. */
    val coinBalance: Int? = null,
) {
    val showError: Boolean get() = error != null && series == null

    /** Label of the primary button: "Regarder" for a fresh series, "Reprendre l'épisode N" afterwards. */
    val primaryActionLabel: UiText
        get() =
            when {
                resumeTarget == null -> UiText.Res(CoreR.string.action_watch)
                // The next episode is locked: say so instead of promising a resume (owner feedback, sprint 5).
                episodes.firstOrNull { it.id == resumeTarget.episodeId }?.access == EpisodeAccess.LOCKED ->
                    UiText.of(R.string.series_unlock_episode, resumeTarget.episodeIndex)
                resumeTarget.isResume -> UiText.of(R.string.series_resume_episode, resumeTarget.episodeIndex)
                else -> UiText.Res(CoreR.string.action_watch)
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
        private val push: PushRepository,
        private val wallet: WalletRepository,
        private val unlocks: UnlockRepository,
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
            viewModelScope.launch {
                wallet.wallet.collect { w -> uiStateFlow.update { it.copy(coinBalance = w?.total ?: it.coinBalance) } }
            }
            // Balance chip and unlock statuses come from the server (M-21/M-32); failures leave the cache as is.
            viewModelScope.launch { wallet.refresh() }
            viewModelScope.launch { unlocks.refreshUnlocks(seriesId) }
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
                    is AppResult.Success -> {
                        val promptNow = adding && !push.permissionPromptShown.first()
                        uiStateFlow.update {
                            it.copy(
                                notice =
                                    UiText.Res(
                                        if (adding) R.string.series_notice_added else R.string.series_notice_removed,
                                    ),
                                requestNotificationPermission = it.requestNotificationPermission || promptNow,
                            )
                        }
                    }
                    is AppResult.Failure ->
                        uiStateFlow.update { it.copy(notice = UiText.Res(R.string.series_notice_favorite_failed)) }
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
                                notice = UiText.Res(R.string.series_notice_like_failed),
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

        /** The UI launched (or skipped, below API 33) the permission request: never ask again from a favourite. */
        fun onNotificationPermissionPrompted() {
            uiStateFlow.update { it.copy(requestNotificationPermission = false) }
            viewModelScope.launch { push.markPermissionPromptShown() }
        }

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
