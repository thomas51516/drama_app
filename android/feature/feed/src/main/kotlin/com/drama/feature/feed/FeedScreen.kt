package com.drama.feature.feed

import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.compose.ContentFrame
import com.drama.core.common.result.AppError
import com.drama.core.ui.component.DramaPrimaryButton
import com.drama.core.ui.component.ErrorState
import com.drama.core.ui.component.PosterImage
import com.drama.core.ui.text.UiText
import com.drama.core.ui.text.asString
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.core.ui.window.SecureWindow
import com.drama.domain.model.FeedItem
import com.drama.domain.model.SecureScreenRules
import kotlinx.coroutines.flow.distinctUntilChanged
import com.drama.core.ui.R as CoreR

data class FeedActions(
    val onPageSettled: (Int) -> Unit,
    val onTap: () -> Unit,
    val onToggleFavorite: (FeedItem) -> Unit,
    val onOpenSeries: (seriesId: String) -> Unit,
    val onWatch: (seriesId: String, episodeId: String) -> Unit,
    val onRetry: () -> Unit,
)

/** "Pour vous" tab (M-02): full-screen vertical pager of autoplaying previews. */
@Composable
fun FeedScreen(
    onOpenSeries: (seriesId: String) -> Unit,
    onWatch: (seriesId: String, episodeId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: FeedViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val player by viewModel.activePlayer.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current

    // M-18: previews are free episodes; should the feed ever show a paid one, captures are blocked as well.
    SecureWindow(secure = SecureScreenRules.shouldSecure(state.currentItem?.episode?.access))
    // Pause when the tab leaves the screen (composition) or the app goes to the background (lifecycle).
    DisposableEffect(Unit) {
        viewModel.setVisible(true)
        onDispose { viewModel.setVisible(false) }
    }
    LifecycleStartEffect(Unit) {
        viewModel.setVisible(true)
        onStopOrDispose { viewModel.setVisible(false) }
    }
    LaunchedEffect(state.error, state.items.isEmpty()) {
        val error = state.error
        if (error != null && state.items.isNotEmpty()) {
            snackbar.showSnackbar(error.toMessage().asString(context))
            viewModel.onErrorShown()
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        FeedContent(
            state = state,
            player = player,
            actions =
                FeedActions(
                    onPageSettled = viewModel::onPageSettled,
                    onTap = viewModel::onTap,
                    onToggleFavorite = viewModel::onToggleFavorite,
                    onOpenSeries = onOpenSeries,
                    onWatch = onWatch,
                    onRetry = viewModel::retry,
                ),
        )
        SnackbarHost(hostState = snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }
}

@Composable
fun FeedContent(
    state: FeedUiState,
    player: Player?,
    actions: FeedActions,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .fillMaxSize()
                .background(Color.Black),
    ) {
        when {
            state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            state.showError -> ErrorState(message = state.error.toMessage().asString(), onRetry = actions.onRetry)
            state.items.isEmpty() ->
                Text(
                    text = stringResource(R.string.feed_empty),
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier =
                        Modifier
                            .align(Alignment.Center)
                            .padding(DramaSpacing.lg),
                )
            else -> {
                val pagerState = rememberPagerState(initialPage = state.currentIndex) { state.items.size }
                LaunchedEffect(pagerState) {
                    snapshotFlow { pagerState.settledPage }
                        .distinctUntilChanged()
                        .collect(actions.onPageSettled)
                }
                VerticalPager(
                    state = pagerState,
                    beyondViewportPageCount = 1,
                    key = { state.items[it].key },
                    modifier = Modifier.fillMaxSize(),
                ) { page ->
                    val item = state.items[page]
                    val isCurrent = page == state.currentIndex
                    FeedPage(
                        item = item,
                        pageState = state.pageState(page),
                        player = player.takeIf { isCurrent },
                        isCurrent = isCurrent,
                        isMuted = state.isMuted,
                        isFavorite = state.isFavorite(item),
                        progress = if (isCurrent) state.position.fraction else 0f,
                        actions = actions,
                    )
                }
            }
        }
        Text(
            text = stringResource(R.string.feed_title),
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            color = Color.White,
            modifier =
                Modifier
                    .align(Alignment.TopCenter)
                    .statusBarsPadding()
                    .padding(top = DramaSpacing.sm)
                    .semantics { heading() },
        )
        if (state.isLoadingMore) {
            LinearProgressIndicator(
                modifier =
                    Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth(),
            )
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun FeedPage(
    item: FeedItem,
    pageState: FeedPageState,
    player: Player?,
    isCurrent: Boolean,
    isMuted: Boolean,
    isFavorite: Boolean,
    progress: Float,
    actions: FeedActions,
) {
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .background(Color.Black)
                .pointerInput(actions) { detectTapGestures(onTap = { actions.onTap() }) },
    ) {
        // Poster backdrop until the first frame; the video replaces it on the current page.
        PosterImage(
            url = item.series.posterVerticalUrl ?: item.series.posterHorizontalUrl,
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            fallbackText = null,
        )
        if (player != null) {
            ContentFrame(player = player, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
        }
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            0f to Color.Black.copy(alpha = 0.35f),
                            0.5f to Color.Transparent,
                            1f to Color.Black.copy(alpha = 0.85f),
                        ),
                    ),
        )
        when (pageState) {
            FeedPageState.Loading ->
                if (isCurrent) {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                        color = Color.White,
                    )
                }
            is FeedPageState.Failed ->
                Text(
                    text = pageState.message.asString(),
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier =
                        Modifier
                            .align(Alignment.Center)
                            .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(8.dp))
                            .padding(DramaSpacing.md),
                )
            FeedPageState.Idle, FeedPageState.Ready -> Unit
        }
        if (isCurrent && isMuted) {
            // Also a real button: TalkBack users cannot rely on the tap gesture of the page.
            Text(
                text = stringResource(R.string.feed_tap_to_unmute),
                style = MaterialTheme.typography.labelMedium,
                color = Color.White,
                modifier =
                    Modifier
                        .align(Alignment.TopEnd)
                        .statusBarsPadding()
                        .padding(top = DramaSpacing.xl + DramaSpacing.md, end = DramaSpacing.md)
                        .minimumInteractiveComponentSize()
                        .clip(RoundedCornerShape(50))
                        .clickable(onClick = actions.onTap, role = Role.Button)
                        .background(Color.Black.copy(alpha = 0.5f))
                        .padding(horizontal = DramaSpacing.sm + DramaSpacing.xs, vertical = DramaSpacing.xs),
            )
        }

        // Right rail: heart + like count.
        Column(
            modifier =
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = DramaSpacing.sm, bottom = RAIL_BOTTOM_PADDING),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            FavoriteToggle(isFavorite = isFavorite, onToggle = { actions.onToggleFavorite(item) })
            item.likes?.let { likes ->
                val compact = formatCount(likes)
                val likesDescription = stringResource(R.string.feed_likes_cd, compact)
                Spacer(Modifier.height(DramaSpacing.sm))
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = likesDescription },
                ) {
                    Text(
                        text = stringResource(R.string.feed_likes_short, compact),
                        style = MaterialTheme.typography.labelMedium,
                        color = Color.White,
                    )
                    Text(
                        text = stringResource(CoreR.string.like),
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White.copy(alpha = 0.8f),
                    )
                }
            }
        }

        // Bottom-left: poster, title, genres, CTA.
        Column(
            modifier =
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth(OVERLAY_WIDTH_FRACTION)
                    .padding(start = DramaSpacing.md, bottom = DramaSpacing.lg),
        ) {
            // One button for the poster and the title: TalkBack reads "title, meta, button".
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier =
                    Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .clickable(onClick = { actions.onOpenSeries(item.series.id) }, role = Role.Button)
                        .heightIn(min = DramaSizes.touchTarget),
            ) {
                PosterImage(
                    url = item.series.posterVerticalUrl,
                    contentDescription = null,
                    fallbackText = null,
                    modifier =
                        Modifier
                            .width(44.dp)
                            .height(66.dp)
                            .clip(RoundedCornerShape(6.dp)),
                )
                Spacer(Modifier.width(DramaSpacing.sm + DramaSpacing.xs))
                Column {
                    Text(
                        text = item.series.title,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = Color.White,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val episodeCount = item.series.episodeCount
                    val meta =
                        listOfNotNull(
                            item.series.genres
                                .take(2)
                                .joinToString(" · ") { it.replaceFirstChar(Char::titlecase) }
                                .takeIf { it.isNotBlank() },
                            pluralStringResource(CoreR.plurals.episode_count_short, episodeCount, episodeCount),
                        ).joinToString(" · ")
                    Text(
                        text = meta,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.85f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.height(DramaSpacing.sm + DramaSpacing.xs))
            Text(
                text = stringResource(R.string.feed_episode_title, item.episode.index, item.episode.title),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.85f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(DramaSpacing.sm))
            DramaPrimaryButton(
                text = stringResource(R.string.feed_watch_series),
                onClick = { actions.onWatch(item.series.id, item.episode.id) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        // Preview progress is decorative: the preview loops and cannot be seeked.
        LinearProgressIndicator(
            progress = { progress },
            color = MaterialTheme.colorScheme.primary,
            trackColor = Color.White.copy(alpha = 0.25f),
            drawStopIndicator = {},
            gapSize = 0.dp,
            modifier =
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(2.dp)
                    .clearAndSetSemantics {},
        )
        if (isCurrent && player == null && pageState == FeedPageState.Ready) {
            Icon(
                Icons.Default.PlayArrow,
                contentDescription = stringResource(R.string.feed_paused),
                tint = Color.White.copy(alpha = 0.8f),
                modifier =
                    Modifier
                        .align(Alignment.Center)
                        .size(56.dp),
            )
        }
    }
}

/** Heart + label as one checkbox node ("Ajouter" / "Ma liste"), 48 dp touch target. */
@Composable
private fun FavoriteToggle(
    isFavorite: Boolean,
    onToggle: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier =
            Modifier
                .widthIn(min = DramaSizes.touchTarget)
                .toggleable(value = isFavorite, onValueChange = { onToggle() }, role = Role.Checkbox),
    ) {
        Box(
            modifier =
                Modifier
                    .size(DramaSizes.touchTarget)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.45f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                contentDescription = null,
                tint = if (isFavorite) MaterialTheme.colorScheme.primary else Color.White,
                modifier = Modifier.size(28.dp),
            )
        }
        Text(
            text = stringResource(if (isFavorite) CoreR.string.my_list else R.string.feed_add_to_list),
            style = MaterialTheme.typography.labelSmall,
            color = Color.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Compact like count: 999, "1,2 k", "3,4 M" with the decimal separator of the current (observable) locale. */
@Composable
private fun formatCount(count: Int): String {
    val locale = LocalConfiguration.current.locales[0]
    return when {
        count >= MILLION ->
            stringResource(R.string.feed_count_millions, String.format(locale, "%.1f", count / MILLION_F))
        count >= THOUSAND ->
            stringResource(R.string.feed_count_thousands, String.format(locale, "%.1f", count / THOUSAND_F))
        else -> String.format(locale, "%d", count)
    }
}

private fun AppError?.toMessage(): UiText =
    when (this) {
        is AppError.Network -> UiText.Res(CoreR.string.error_network)
        is AppError.Server -> UiText.of(CoreR.string.error_server, code)
        is AppError.Unauthenticated -> UiText.Res(CoreR.string.error_session_expired)
        else -> UiText.Res(R.string.feed_error_load)
    }

private const val OVERLAY_WIDTH_FRACTION = 0.78f
private const val THOUSAND = 1_000
private const val MILLION = 1_000_000
private const val THOUSAND_F = 1_000f
private const val MILLION_F = 1_000_000f
private val RAIL_BOTTOM_PADDING = 120.dp
