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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
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
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.FeedItem
import kotlinx.coroutines.flow.distinctUntilChanged

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
            snackbar.showSnackbar(error.toMessage())
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
            state.showError -> ErrorState(message = state.error.toMessage(), onRetry = actions.onRetry)
            state.items.isEmpty() ->
                Text(
                    text = "Aucun extrait pour le moment.",
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
            text = "Pour vous",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            color = Color.White,
            modifier =
                Modifier
                    .align(Alignment.TopCenter)
                    .statusBarsPadding()
                    .padding(top = DramaSpacing.sm),
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
                    text = pageState.message,
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
            Text(
                text = "Appuyez pour activer le son",
                style = MaterialTheme.typography.labelMedium,
                color = Color.White,
                modifier =
                    Modifier
                        .align(Alignment.TopEnd)
                        .statusBarsPadding()
                        .padding(top = DramaSpacing.xl + DramaSpacing.md, end = DramaSpacing.md)
                        .background(Color.Black.copy(alpha = 0.5f), RoundedCornerShape(50))
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
            Box(
                modifier =
                    Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.45f))
                        .clickable { actions.onToggleFavorite(item) },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                    contentDescription = if (isFavorite) "Retirer de Ma liste" else "Ajouter à Ma liste",
                    tint = if (isFavorite) MaterialTheme.colorScheme.primary else Color.White,
                    modifier = Modifier.size(28.dp),
                )
            }
            Text(
                text = if (isFavorite) "Ma liste" else "Ajouter",
                style = MaterialTheme.typography.labelSmall,
                color = Color.White,
            )
            item.likes?.let { likes ->
                Spacer(Modifier.height(DramaSpacing.sm))
                Text(
                    text = "♥ ${formatCount(likes)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White,
                )
                Text(
                    text = "J'aime",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White.copy(alpha = 0.8f),
                )
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
            Row(verticalAlignment = Alignment.CenterVertically) {
                PosterImage(
                    url = item.series.posterVerticalUrl,
                    contentDescription = item.series.title,
                    fallbackText = null,
                    modifier =
                        Modifier
                            .width(44.dp)
                            .height(66.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .clickable { actions.onOpenSeries(item.series.id) },
                )
                Spacer(Modifier.width(DramaSpacing.sm + DramaSpacing.xs))
                Column(modifier = Modifier.clickable { actions.onOpenSeries(item.series.id) }) {
                    Text(
                        text = item.series.title,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = Color.White,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val meta =
                        listOfNotNull(
                            item.series.genres
                                .take(2)
                                .joinToString(" · ") { it.replaceFirstChar(Char::titlecase) }
                                .takeIf { it.isNotBlank() },
                            "${item.series.episodeCount} ép.",
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
                text = "Épisode ${item.episode.index} · ${item.episode.title}",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.85f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(DramaSpacing.sm))
            DramaPrimaryButton(
                text = "Regarder la série",
                onClick = { actions.onWatch(item.series.id, item.episode.id) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
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
                    .height(2.dp),
        )
        if (isCurrent && player == null && pageState == FeedPageState.Ready) {
            Icon(
                Icons.Default.PlayArrow,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.8f),
                modifier =
                    Modifier
                        .align(Alignment.Center)
                        .size(56.dp),
            )
        }
    }
}

private fun formatCount(count: Int): String =
    when {
        count >= 1_000_000 -> "%.1f M".format(count / 1_000_000f)
        count >= 1_000 -> "%.1f k".format(count / 1_000f)
        else -> count.toString()
    }

private fun AppError?.toMessage(): String =
    when (this) {
        is AppError.Network -> "Pas de connexion. Vérifiez le réseau puis réessayez."
        is AppError.Server -> "Le service est indisponible ($code). Réessayez dans un instant."
        is AppError.Unauthenticated -> "Session expirée, réessayez."
        else -> "Impossible de charger le flux."
    }

private const val OVERLAY_WIDTH_FRACTION = 0.78f
private val RAIL_BOTTOM_PADDING = 120.dp
