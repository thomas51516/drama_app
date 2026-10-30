package com.drama.feature.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.Player
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.core.player.engine.PlaybackEngine
import com.drama.core.player.engine.PlaybackEngineFactory
import com.drama.core.player.engine.PlaybackEvent
import com.drama.core.player.engine.PlaybackPosition
import com.drama.core.ui.text.UiText
import com.drama.domain.model.FeedItem
import com.drama.domain.model.PlaybackSource
import com.drama.domain.model.SignedUrlPolicy
import com.drama.domain.model.StreamFormat
import com.drama.domain.repository.FavoritesRepository
import com.drama.domain.repository.FeedRepository
import com.drama.domain.repository.PlaybackRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.drama.core.ui.R as CoreR

/** Per-page stream resolution. */
sealed interface FeedPageState {
    data object Idle : FeedPageState

    data object Loading : FeedPageState

    data object Ready : FeedPageState

    /** Resolution or playback failed; [message] is resolved by the UI (S05-A2-03). */
    data class Failed(
        val message: UiText,
    ) : FeedPageState
}

data class FeedUiState(
    val isLoading: Boolean = true,
    val items: List<FeedItem> = emptyList(),
    val currentIndex: Int = 0,
    /** Previews start muted (M-02); a tap unmutes for the rest of the session. */
    val isMuted: Boolean = true,
    val isPlaying: Boolean = false,
    val isLoadingMore: Boolean = false,
    val isRefreshing: Boolean = false,
    val endReached: Boolean = false,
    val error: AppError? = null,
    val favoriteIds: Set<String> = emptySet(),
    val pages: Map<Int, FeedPageState> = emptyMap(),
    val position: PlaybackPosition = PlaybackPosition(),
) {
    val currentItem: FeedItem? get() = items.getOrNull(currentIndex)
    val showError: Boolean get() = error != null && items.isEmpty()

    fun pageState(index: Int): FeedPageState = pages[index] ?: FeedPageState.Idle

    fun isFavorite(item: FeedItem): Boolean = item.series.id in favoriteIds
}

/**
 * "Pour vous" (M-02, S04-A1-01): a full-screen vertical pager over `GET /feed`.
 *
 * - Cursor pagination: the next page is requested as soon as fewer than [PREFETCH_THRESHOLD] items remain after
 *   the current one.
 * - Each page autoplays its signed `previewUrl` through the shared [PlaybackEngine] (same pool, cache and
 *   preload strategy as the player). Sources are attached for the current page and its neighbours.
 * - Signed URLs (S04-A2-01): a preview is re-resolved through `POST /episodes/{id}/play` when its `expiresAt`
 *   is within [SignedUrlPolicy.REFRESH_MARGIN_MS], when the proactive refresh timer fires, and once after an
 *   HTTP 403 from the media host (then the error surfaces).
 * - Playback pauses when the tab is hidden or the app goes to the background and resumes when it comes back.
 * - Favorites are optimistic through [FavoritesRepository]; `series_view{source=feed}` fires per settled page.
 */
@HiltViewModel
class FeedViewModel
    @Inject
    constructor(
        private val feedRepository: FeedRepository,
        private val favorites: FavoritesRepository,
        private val playback: PlaybackRepository,
        private val analytics: AnalyticsTracker,
        private val clock: Clock,
        private val logger: Logger,
        engineFactory: PlaybackEngineFactory,
    ) : ViewModel() {
        private val engine: PlaybackEngine = engineFactory.create()
        val activePlayer: StateFlow<Player?> get() = engine.activePlayer

        private val uiStateFlow = MutableStateFlow(FeedUiState())
        val uiState: StateFlow<FeedUiState> = uiStateFlow.asStateFlow()

        private var nextCursor: String? = null
        private var loadJob: Job? = null
        private var refreshJob: Job? = null
        private val resolving = mutableMapOf<Int, Job>()

        /** Attached stream per index with its expiry, so the policy can decide when to ask again. */
        private val sources = mutableMapOf<Int, SignedSource>()
        private val forbiddenRetries = mutableMapOf<Int, Int>()
        private var visible = true
        private var started = false
        private var lastViewedIndex = -1

        private data class SignedSource(
            val source: PlaybackSource,
            val expiresAtEpochMs: Long,
        )

        init {
            engine.setMuted(true)
            viewModelScope.launch { engine.events.collect(::onEvent) }
            viewModelScope.launch { engine.position.collect { pos -> uiStateFlow.update { it.copy(position = pos) } } }
            viewModelScope.launch {
                favorites.observeFavoriteIds().collect { ids ->
                    uiStateFlow.update { it.copy(favoriteIds = ids) }
                }
            }
            viewModelScope.launch { favorites.refreshFavorites() }
            loadFirstPage()
        }

        fun refresh() {
            if (uiStateFlow.value.isRefreshing) return
            uiStateFlow.update { it.copy(isRefreshing = true) }
            loadFirstPage()
        }

        fun retry() = loadFirstPage()

        private fun loadFirstPage() {
            loadJob?.cancel()
            loadJob =
                viewModelScope.launch {
                    when (val result = feedRepository.load(cursor = null)) {
                        is AppResult.Success -> {
                            val page = result.value
                            nextCursor = page.nextCursor
                            resolving.values.forEach { it.cancel() }
                            resolving.clear()
                            sources.clear()
                            forbiddenRetries.clear()
                            started = false
                            lastViewedIndex = -1
                            engine.setPlaylist(page.items.size)
                            uiStateFlow.update {
                                it.copy(
                                    isLoading = false,
                                    isRefreshing = false,
                                    items = page.items,
                                    currentIndex = 0,
                                    pages = emptyMap(),
                                    endReached = page.nextCursor == null,
                                    error = null,
                                )
                            }
                            if (page.items.isNotEmpty()) startAt(0)
                        }
                        is AppResult.Failure ->
                            uiStateFlow.update {
                                it.copy(
                                    isLoading = false,
                                    isRefreshing = false,
                                    isLoadingMore = false,
                                    error = result.error,
                                )
                            }
                    }
                }
        }

        private fun loadMore() {
            val cursor = nextCursor ?: return
            val state = uiStateFlow.value
            if (state.isLoadingMore || state.isLoading) return
            uiStateFlow.update { it.copy(isLoadingMore = true) }
            viewModelScope.launch {
                when (val result = feedRepository.load(cursor = cursor)) {
                    is AppResult.Success -> {
                        val page = result.value
                        nextCursor = page.nextCursor
                        val known =
                            uiStateFlow.value.items
                                .map { it.key }
                                .toSet()
                        val fresh = page.items.filter { it.key !in known }
                        val items = uiStateFlow.value.items + fresh
                        engine.growPlaylist(items.size)
                        uiStateFlow.update {
                            it.copy(
                                items = items,
                                isLoadingMore = false,
                                endReached = page.nextCursor == null,
                                error = null,
                            )
                        }
                        logger.i(
                            TAG,
                            "feed page loaded +${fresh.size} (total ${items.size}, more=${page.nextCursor != null})",
                        )
                        prefetchAround(uiStateFlow.value.currentIndex)
                    }
                    is AppResult.Failure -> {
                        logger.w(TAG, "feed next page failed: ${result.error}")
                        uiStateFlow.update { it.copy(isLoadingMore = false, error = result.error) }
                    }
                }
            }
        }

        /** Pager settled on [index]. */
        fun onPageSettled(index: Int) {
            val state = uiStateFlow.value
            if (index !in state.items.indices) return
            if (started && index == state.currentIndex) return
            startAt(index)
        }

        private fun startAt(index: Int) {
            started = true
            uiStateFlow.update { it.copy(currentIndex = index) }
            val item = uiStateFlow.value.items.getOrNull(index) ?: return
            if (lastViewedIndex != index) {
                lastViewedIndex = index
                analytics.track(AnalyticsEvent.SeriesView(item.series.id, SOURCE_FEED))
            }
            engine.stop()
            if (visible) ensureSource(index, playWhenReady = true)
            prefetchAround(index)
            val remainingAhead = uiStateFlow.value.items.size - 1 - index
            if (nextCursor != null && remainingAhead < PREFETCH_THRESHOLD) loadMore()
        }

        private fun prefetchAround(index: Int) {
            listOf(index + 1, index - 1).forEach { neighbour ->
                if (neighbour in uiStateFlow.value.items.indices) ensureSource(neighbour, playWhenReady = false)
            }
        }

        /**
         * Attaches a playable source for [index]: the feed's signed preview while it is valid, otherwise a fresh
         * `/play` answer. Starts playback when [playWhenReady] and the page is still current.
         */
        private fun ensureSource(
            index: Int,
            playWhenReady: Boolean,
            startPositionMs: Long = 0L,
        ) {
            val item = uiStateFlow.value.items.getOrNull(index) ?: return
            val now = clock.nowEpochMs()
            val attached = sources[index]
            if (attached != null && !SignedUrlPolicy.needsRefresh(attached.expiresAtEpochMs, now)) {
                if (playWhenReady) play(index, startPositionMs)
                return
            }
            val preview = item.previewUrl
            if (attached == null &&
                preview != null &&
                !SignedUrlPolicy.needsRefresh(item.previewExpiresAtEpochMs, now)
            ) {
                attach(index, PlaybackSource(preview, StreamFormat.HLS), item.previewExpiresAtEpochMs)
                if (playWhenReady) play(index, startPositionMs)
                return
            }
            resolveThroughPlay(index, playWhenReady, startPositionMs, restart = false)
        }

        private fun resolveThroughPlay(
            index: Int,
            playWhenReady: Boolean,
            startPositionMs: Long,
            restart: Boolean,
        ) {
            val item = uiStateFlow.value.items.getOrNull(index) ?: return
            if (resolving[index]?.isActive == true) return
            if (playWhenReady) uiStateFlow.update { it.copy(pages = it.pages + (index to FeedPageState.Loading)) }
            resolving[index] =
                viewModelScope.launch {
                    when (val result = playback.startPlayback(item.episode.id)) {
                        is AppResult.Success -> {
                            val session = result.value
                            attach(index, session.source, session.expiresAtEpochMs)
                            logger.i(TAG, "preview re-resolved through /play index=$index")
                            if (uiStateFlow.value.currentIndex != index) return@launch
                            when {
                                restart -> {
                                    engine.restart(index, startPositionMs)
                                    uiStateFlow.update { it.copy(pages = it.pages + (index to FeedPageState.Ready)) }
                                    scheduleRefresh(index)
                                }
                                playWhenReady -> play(index, startPositionMs)
                                // Proactive refresh of the playing page: keep the chain going for the new expiry.
                                else -> scheduleRefresh(index)
                            }
                        }
                        is AppResult.Failure -> {
                            logger.w(TAG, "preview resolution failed index=$index: ${result.error}")
                            uiStateFlow.update {
                                it.copy(
                                    pages = it.pages + (index to FeedPageState.Failed(result.error.toUserMessage())),
                                )
                            }
                        }
                    }
                }
        }

        private fun attach(
            index: Int,
            source: PlaybackSource,
            expiresAtEpochMs: Long,
        ) {
            sources[index] = SignedSource(source, expiresAtEpochMs)
            engine.setSource(index, source)
        }

        private fun play(
            index: Int,
            startPositionMs: Long,
        ) {
            if (!visible || uiStateFlow.value.currentIndex != index) return
            uiStateFlow.update { it.copy(pages = it.pages + (index to FeedPageState.Ready)) }
            engine.play(index, startPositionMs)
            scheduleRefresh(index)
        }

        /** Proactive re-resolve [SignedUrlPolicy.REFRESH_MARGIN_MS] before the attached URL expires. */
        private fun scheduleRefresh(index: Int) {
            refreshJob?.cancel()
            val attached = sources[index] ?: return
            if (!SignedUrlPolicy.hasExpiry(attached.expiresAtEpochMs)) return
            val delayMs = SignedUrlPolicy.refreshDelayMs(attached.expiresAtEpochMs, clock.nowEpochMs())
            refreshJob =
                viewModelScope.launch {
                    delay(delayMs)
                    if (uiStateFlow.value.currentIndex != index) return@launch
                    logger.i(TAG, "signed preview about to expire index=$index: refreshing")
                    resolveThroughPlay(index, playWhenReady = false, startPositionMs = 0L, restart = false)
                }
        }

        // --- interactions ---

        /** Tap on the video: first tap unmutes (M-02), later taps toggle. */
        fun onTap() {
            val muted = !uiStateFlow.value.isMuted
            engine.setMuted(muted)
            uiStateFlow.update { it.copy(isMuted = muted) }
        }

        fun onToggleFavorite(item: FeedItem) {
            val adding = !uiStateFlow.value.isFavorite(item)
            analytics.track(AnalyticsEvent.Favorite(item.series.id, adding, SOURCE_FEED))
            viewModelScope.launch {
                val result = favorites.setFavorite(item.series, adding)
                if (result is AppResult.Failure) {
                    uiStateFlow.update { it.copy(error = result.error) }
                    logger.w(TAG, "favorite toggle rolled back for ${item.series.id}: ${result.error}")
                }
            }
        }

        fun onErrorShown() = uiStateFlow.update { it.copy(error = null) }

        /** Composition / lifecycle visibility: the tab left the screen or the app went to the background. */
        fun setVisible(visible: Boolean) {
            if (this.visible == visible) return
            this.visible = visible
            if (!visible) {
                refreshJob?.cancel()
                engine.pause()
                uiStateFlow.update { it.copy(isPlaying = false) }
            } else if (started) {
                val index = uiStateFlow.value.currentIndex
                ensureSource(index, playWhenReady = true, startPositionMs = uiStateFlow.value.position.positionMs)
            }
        }

        private fun onEvent(event: PlaybackEvent) {
            when (event) {
                is PlaybackEvent.IsPlayingChanged -> uiStateFlow.update { it.copy(isPlaying = event.isPlaying) }
                is PlaybackEvent.Ended -> {
                    // Previews loop.
                    if (event.index == uiStateFlow.value.currentIndex) {
                        engine.seekTo(0)
                        engine.resume()
                    }
                }
                is PlaybackEvent.FirstFrameRendered -> forbiddenRetries.remove(event.index)
                is PlaybackEvent.Error -> onPlaybackError(event)
                is PlaybackEvent.PreloadCompleted -> Unit
            }
        }

        private fun onPlaybackError(event: PlaybackEvent.Error) {
            val index = event.index
            val retries = forbiddenRetries[index] ?: 0
            if (SignedUrlPolicy.shouldRetryAfterHttpError(event.httpStatus, retries)) {
                forbiddenRetries[index] = retries + 1
                logger.w(TAG, "media host answered 403 index=$index: re-resolving once")
                sources.remove(index)
                val position = engine.currentPositionMs().takeIf { it > 0 } ?: 0L
                resolveThroughPlay(index, playWhenReady = true, startPositionMs = position, restart = true)
                return
            }
            uiStateFlow.update {
                val failed = FeedPageState.Failed(UiText.of(R.string.feed_playback_failed_reason, event.message))
                it.copy(pages = it.pages + (index to failed))
            }
        }

        override fun onCleared() {
            engine.release()
        }

        private fun AppError.toUserMessage(): UiText =
            when (this) {
                is AppError.Network -> UiText.Res(CoreR.string.error_network_short)
                is AppError.Locked -> UiText.Res(R.string.feed_preview_unavailable)
                is AppError.NotFound -> UiText.Res(CoreR.string.error_not_found)
                is AppError.Server -> UiText.of(CoreR.string.error_server_short, code)
                else -> UiText.Res(R.string.feed_playback_failed)
            }

        companion object {
            private const val TAG = "Feed"
            const val SOURCE_FEED = "feed"
            const val PREFETCH_THRESHOLD = 2
        }
    }
