package com.drama.feature.series

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.common.result.AppError
import com.drama.core.ui.component.DramaPrimaryButton
import com.drama.core.ui.component.ErrorState
import com.drama.core.ui.component.OfflineBanner
import com.drama.core.ui.component.PosterImage
import com.drama.core.ui.component.SkeletonBox
import com.drama.core.ui.share.shareText
import com.drama.core.ui.text.UiText
import com.drama.core.ui.text.asString
import com.drama.core.ui.theme.DramaColors
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.GenreLabels
import com.drama.domain.model.LikeState
import com.drama.domain.model.Series
import com.drama.domain.model.UnlockAllQuote
import com.drama.core.ui.R as CoreR

@Composable
fun SeriesScreen(
    onBack: () -> Unit,
    onPlayEpisode: (episodeId: String) -> Unit,
    onOpenWallet: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenShop: (missingCoins: Int) -> Unit = {},
    viewModel: SeriesViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.openShopMissing) {
        val missing = state.openShopMissing ?: return@LaunchedEffect
        viewModel.onShopOpened()
        onOpenShop(missing)
    }
    LaunchedEffect(state.notice) {
        val notice = state.notice ?: return@LaunchedEffect
        snackbar.showSnackbar(notice.asString(context))
        viewModel.onNoticeShown()
    }
    // M-54: the first "add to My list" is the sensible moment to ask for notifications (new episodes).
    val permissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(state.requestNotificationPermission) {
        if (!state.requestNotificationPermission) return@LaunchedEffect
        viewModel.onNotificationPermissionPrompted()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    Box(modifier = modifier.fillMaxSize()) {
        SeriesContent(
            state = state,
            actions =
                SeriesActions(
                    onBack = onBack,
                    onPlayEpisode = onPlayEpisode,
                    onToggleSynopsis = viewModel::onToggleSynopsis,
                    onRetry = viewModel::retry,
                    onToggleFavorite = viewModel::onToggleFavorite,
                    onToggleLike = viewModel::onToggleLike,
                    onShare = { context.shareText(viewModel.onShare()) },
                    onOpenWallet = onOpenWallet,
                    onUnlockAll = viewModel::onUnlockAllRequested,
                    onUnlockAllConfirmed = viewModel::onUnlockAllConfirmed,
                    onUnlockAllDismissed = viewModel::onUnlockAllDismissed,
                ),
        )
        SnackbarHost(hostState = snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }
}

data class SeriesActions(
    val onBack: () -> Unit,
    val onPlayEpisode: (episodeId: String) -> Unit,
    val onToggleSynopsis: () -> Unit,
    val onRetry: () -> Unit,
    val onToggleFavorite: () -> Unit,
    val onToggleLike: () -> Unit,
    val onShare: () -> Unit,
    val onOpenWallet: () -> Unit = {},
    val onUnlockAll: () -> Unit = {},
    val onUnlockAllConfirmed: () -> Unit = {},
    val onUnlockAllDismissed: () -> Unit = {},
)

@Composable
fun SeriesContent(
    state: SeriesUiState,
    actions: SeriesActions,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
    ) {
        when {
            state.isLoading -> SeriesSkeleton()
            state.showError -> ErrorState(message = state.error.toMessage().asString(), onRetry = actions.onRetry)
            state.series != null ->
                // Owner feedback (31/10): without this, a newly published episode never appeared on an
                // already-open screen — the stale-while-revalidate cache only re-checks its TTL when the
                // view model is recreated, so an explicit pull is the only way to force it sooner.
                PullToRefreshBox(
                    isRefreshing = state.isRefreshing,
                    onRefresh = actions.onRetry,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    SeriesBody(series = state.series, state = state, actions = actions)
                }
        }
        if (state.confirmUnlockAll) {
            state.unlockAllQuote?.let { quote ->
                UnlockAllConfirmDialog(
                    quote = quote,
                    onConfirm = actions.onUnlockAllConfirmed,
                    onDismiss = actions.onUnlockAllDismissed,
                )
            }
        }
        // Drawn over the body but read first by TalkBack: back, share, favourite, then the title and the rest.
        Row(
            modifier =
                Modifier
                    .statusBarsPadding()
                    .padding(DramaSpacing.xs)
                    .fillMaxWidth()
                    .semantics {
                        isTraversalGroup = true
                        traversalIndex = TOP_BAR_TRAVERSAL_INDEX
                    },
        ) {
            RoundIconButton(onClick = actions.onBack) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(CoreR.string.action_back),
                    tint = Color.White,
                )
            }
            Spacer(Modifier.weight(1f))
            if (state.series != null) {
                BalanceChip(balance = state.coinBalance, onClick = actions.onOpenWallet)
                RoundIconButton(onClick = actions.onShare) {
                    Icon(
                        Icons.Default.Share,
                        contentDescription = stringResource(CoreR.string.action_share),
                        tint = Color.White,
                    )
                }
                RoundIconToggleButton(checked = state.isFavorite, onCheckedChange = { actions.onToggleFavorite() }) {
                    Icon(
                        imageVector = if (state.isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                        contentDescription = stringResource(CoreR.string.my_list),
                        tint = if (state.isFavorite) MaterialTheme.colorScheme.primary else Color.White,
                    )
                }
            }
        }
    }
}

private val roundButtonBackground = Color.Black.copy(alpha = 0.45f)

/** Coin balance pill of the header (M-32): "N pièces", opens the wallet; "—" until the server answered. */
@Composable
private fun BalanceChip(
    balance: Int?,
    onClick: () -> Unit,
) {
    val text = balance?.let { pluralStringResource(CoreR.plurals.coin_count, it, it) } ?: "—"
    val description = stringResource(R.string.series_balance_cd, text)
    Box(
        modifier =
            Modifier
                .padding(horizontal = DramaSpacing.xxs)
                .heightIn(min = DramaSizes.touchTarget)
                .clip(CircleShape)
                .clickable(onClick = onClick, role = Role.Button)
                .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            color = Color.White,
            maxLines = 1,
            modifier =
                Modifier
                    .background(roundButtonBackground, CircleShape)
                    .padding(horizontal = DramaSpacing.sm + DramaSpacing.xs, vertical = DramaSpacing.sm),
        )
    }
}

@Composable
private fun RoundIconButton(
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    IconButton(
        onClick = onClick,
        modifier =
            Modifier
                .padding(horizontal = DramaSpacing.xxs)
                .size(DramaSizes.touchTarget)
                .background(roundButtonBackground, CircleShape),
    ) {
        content()
    }
}

/** Same look as [RoundIconButton] with checkbox semantics, so TalkBack announces the favourite state. */
@Composable
private fun RoundIconToggleButton(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    content: @Composable () -> Unit,
) {
    IconToggleButton(
        checked = checked,
        onCheckedChange = onCheckedChange,
        modifier =
            Modifier
                .padding(horizontal = DramaSpacing.xxs)
                .size(DramaSizes.touchTarget)
                .background(roundButtonBackground, CircleShape),
    ) {
        content()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SeriesBody(
    series: Series,
    state: SeriesUiState,
    actions: SeriesActions,
) {
    val onPlayEpisode = actions.onPlayEpisode
    val onToggleSynopsis = actions.onToggleSynopsis
    val onRetry = actions.onRetry
    // Keep the last row of episodes above the system navigation bar (owner feedback, sprint 5).
    val bottomInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    LazyVerticalGrid(
        columns = GridCells.Fixed(EPISODE_COLUMNS),
        contentPadding = PaddingValues(bottom = bottomInset + DramaSpacing.xl),
        horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) { PosterHeader(series) }
        if (state.error != null) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                OfflineBanner(message = stringResource(CoreR.string.state_offline_cached), onRetry = onRetry)
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(modifier = Modifier.padding(horizontal = DramaSpacing.md)) {
                MetaRow(series, state.genreLabels)
                Spacer(Modifier.height(DramaSpacing.md))
                // Wraps the like button under the primary button when the font scale makes the label long.
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
                    verticalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    DramaPrimaryButton(
                        text = state.primaryActionLabel.asString(),
                        onClick = { state.resumeTarget?.let { onPlayEpisode(it.episodeId) } },
                        enabled = state.resumeTarget != null,
                        modifier = Modifier.weight(1f),
                    )
                    LikeButton(
                        state = state.likeState,
                        onClick = actions.onToggleLike,
                        modifier = Modifier.align(Alignment.CenterVertically),
                    )
                }
                state.unlockAllQuote?.let { quote ->
                    Spacer(Modifier.height(DramaSpacing.sm))
                    UnlockAllButton(quote = quote, busy = state.isUnlockingAll, onClick = actions.onUnlockAll)
                }
                if (state.isRefreshing) {
                    LinearProgressIndicator(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .padding(top = DramaSpacing.sm),
                    )
                }
                Spacer(Modifier.height(DramaSpacing.md))
                Synopsis(text = series.synopsis, expanded = state.synopsisExpanded, onToggle = onToggleSynopsis)
                Spacer(Modifier.height(DramaSpacing.lg))
                Text(
                    text = stringResource(R.string.series_episodes_heading),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.semantics { heading() },
                )
                Spacer(Modifier.height(DramaSpacing.sm))
            }
        }
        itemsIndexed(state.episodes, key = { _, episode -> episode.id }) { index, episode ->
            val isCurrent = state.resumeTarget?.episodeId == episode.id && state.resumeTarget.isResume
            val column = index % EPISODE_COLUMNS
            EpisodeCell(
                episode = episode,
                highlighted = isCurrent,
                onClick = { onPlayEpisode(episode.id) },
                modifier =
                    Modifier.padding(
                        start = if (column == 0) DramaSpacing.md else DramaSpacing.xs,
                        end = if (column == EPISODE_COLUMNS - 1) DramaSpacing.md else DramaSpacing.xs,
                    ),
            )
        }
        if (state.episodes.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    text = stringResource(R.string.series_no_episodes),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(DramaSpacing.md),
                )
            }
        }
    }
}

@Composable
private fun PosterHeader(series: Series) {
    val background = MaterialTheme.colorScheme.background
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .aspectRatio(HEADER_RATIO),
    ) {
        // The title below is the accessible name of the header; the poster only illustrates it.
        PosterImage(
            url = series.posterVerticalUrl ?: series.posterHorizontalUrl,
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            fallbackText = null,
        )
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            0f to background.copy(alpha = 0.35f),
                            0.4f to Color.Transparent,
                            1f to background,
                        ),
                    ),
        )
        Column(
            modifier =
                Modifier
                    .align(Alignment.BottomStart)
                    .padding(horizontal = DramaSpacing.md),
        ) {
            Text(
                text = series.title,
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.semantics { heading() },
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MetaRow(
    series: Series,
    genreLabels: GenreLabels,
) {
    val ageLabel = ageRatingLabel(series.ageRating)
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Chip(
            text = ageLabel,
            outlined = true,
            contentDescription = stringResource(R.string.series_age_rating_cd, ageLabel),
        )
        Chip(text = pluralStringResource(CoreR.plurals.episode_count, series.episodeCount, series.episodeCount))
        if (series.freeEpisodeCount > 0) {
            Chip(
                text =
                    pluralStringResource(
                        R.plurals.series_free_count,
                        series.freeEpisodeCount,
                        series.freeEpisodeCount,
                    ),
                accent = true,
            )
        }
    }
    if (series.genres.isNotEmpty()) {
        Spacer(Modifier.height(DramaSpacing.sm))
        Text(
            text = genreLabels.labels(series.genres).joinToString(" · "),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** "Débloquer toute la série" (M-23): quoted price with the discount; the confirmation dialog does the rest. */
@Composable
private fun UnlockAllButton(
    quote: UnlockAllQuote,
    busy: Boolean,
    onClick: () -> Unit,
) {
    val priceText = pluralStringResource(CoreR.plurals.coin_count, quote.price, quote.price)
    OutlinedButton(
        onClick = onClick,
        enabled = !busy,
        modifier = Modifier.fillMaxWidth().heightIn(min = DramaSizes.touchTarget),
    ) {
        Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(DramaSpacing.xs))
        Text(
            text =
                when {
                    busy -> stringResource(R.string.series_unlock_all_busy)
                    quote.hasDiscount ->
                        stringResource(
                            R.string.series_unlock_all_discount,
                            quote.lockedCount,
                            priceText,
                            quote.discountPercent,
                        )
                    else -> stringResource(R.string.series_unlock_all, quote.lockedCount, priceText)
                },
            maxLines = 2,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun UnlockAllConfirmDialog(
    quote: UnlockAllQuote,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val priceText = pluralStringResource(CoreR.plurals.coin_count, quote.price, quote.price)
    val fullText = pluralStringResource(CoreR.plurals.coin_count, quote.fullPrice, quote.fullPrice)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.series_unlock_all_title)) },
        text = {
            Text(
                if (quote.hasDiscount) {
                    stringResource(
                        R.string.series_unlock_all_body_discount,
                        quote.lockedCount,
                        priceText,
                        fullText,
                        quote.discountPercent,
                    )
                } else {
                    stringResource(R.string.series_unlock_all_body, quote.lockedCount, priceText)
                },
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(stringResource(R.string.series_unlock_all_confirm, priceText)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(CoreR.string.action_cancel)) } },
    )
}

/** "J'aime" toggle with its count (M-16): a checkbox node for TalkBack, 48 dp tall at the default font scale. */
@Composable
private fun LikeButton(
    state: LikeState?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val liked = state?.liked == true
    val likes = state?.likes
    val likeLabel = stringResource(CoreR.string.like)
    val description = likes?.let { stringResource(R.string.series_like_count_cd, it) } ?: likeLabel
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier =
            modifier
                .clip(shape)
                .background(if (liked) DramaColors.EmeraldSoft else MaterialTheme.colorScheme.surfaceContainerHigh)
                .then(if (liked) Modifier.border(1.dp, MaterialTheme.colorScheme.primary, shape) else Modifier)
                .toggleable(value = liked, onValueChange = { onClick() }, role = Role.Checkbox)
                .semantics { contentDescription = description }
                .heightIn(min = DramaSizes.touchTarget)
                .padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm + DramaSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(DramaSpacing.xs),
    ) {
        Icon(
            Icons.Default.ThumbUp,
            contentDescription = null,
            tint = if (liked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = likes?.toString() ?: likeLabel,
            style = MaterialTheme.typography.labelLarge,
            color = if (liked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun Chip(
    text: String,
    outlined: Boolean = false,
    accent: Boolean = false,
    contentDescription: String? = null,
) {
    val shape = RoundedCornerShape(6.dp)
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = if (accent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onBackground,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier =
            Modifier
                .then(
                    if (outlined) {
                        Modifier.border(1.dp, MaterialTheme.colorScheme.outline, shape)
                    } else {
                        Modifier.background(
                            if (accent) DramaColors.EmeraldSoft else MaterialTheme.colorScheme.surfaceContainerHigh,
                            shape,
                        )
                    },
                ).then(
                    if (contentDescription != null) {
                        Modifier.semantics { this.contentDescription = contentDescription }
                    } else {
                        Modifier
                    },
                ).padding(horizontal = DramaSpacing.sm, vertical = DramaSpacing.xs),
    )
}

@Composable
private fun Synopsis(
    text: String,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    val body = text.ifBlank { stringResource(R.string.series_synopsis_placeholder) }
    val canToggle = body.length > SYNOPSIS_TOGGLE_THRESHOLD
    val expandedState =
        stringResource(if (expanded) R.string.series_synopsis_expanded else R.string.series_synopsis_collapsed)
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .then(
                    if (canToggle) {
                        Modifier
                            .clickable(onClick = onToggle, role = Role.Button)
                            .semantics { stateDescription = expandedState }
                    } else {
                        Modifier
                    },
                ).animateContentSize(),
    ) {
        Text(
            text = body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = if (expanded) Int.MAX_VALUE else SYNOPSIS_COLLAPSED_LINES,
            overflow = TextOverflow.Ellipsis,
        )
        if (canToggle) {
            Text(
                text = stringResource(if (expanded) R.string.series_read_less else R.string.series_read_more),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = DramaSpacing.xs),
            )
        }
    }
}

/**
 * Episode number with its access status: free, unlocked (check) or locked (lock + coin cost). TalkBack reads
 * "Épisode N, gratuit / débloqué / verrouillé, 12 pièces[, épisode en cours]".
 */
@Composable
private fun EpisodeCell(
    episode: Episode,
    highlighted: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(10.dp)
    val container =
        when {
            highlighted -> DramaColors.EmeraldSoft
            else -> MaterialTheme.colorScheme.surfaceContainerHigh
        }
    val statusLabel =
        stringResource(
            when (episode.access) {
                EpisodeAccess.FREE -> R.string.series_episode_free
                EpisodeAccess.UNLOCKED -> R.string.series_episode_unlocked
                EpisodeAccess.LOCKED -> R.string.series_episode_locked
            },
        )
    val coinLabel =
        if (episode.access == EpisodeAccess.LOCKED && episode.coinCost > 0) {
            pluralStringResource(CoreR.plurals.coin_count, episode.coinCost, episode.coinCost)
        } else {
            null
        }
    val description =
        listOfNotNull(
            stringResource(CoreR.string.episode_number, episode.index),
            statusLabel,
            coinLabel,
            if (highlighted) stringResource(R.string.series_episode_current) else null,
        ).joinToString(", ")
    // Compact tile (owner feedback, 31/10): only the number, plus a lock glyph when locked.
    // Free/unlocked/coin-cost/current-episode detail stays in the TalkBack description below.
    Row(
        modifier =
            modifier
                .aspectRatio(EPISODE_CELL_RATIO)
                .clip(shape)
                .background(container)
                .then(if (highlighted) Modifier.border(1.dp, MaterialTheme.colorScheme.primary, shape) else Modifier)
                .clickable(onClick = onClick, role = Role.Button)
                .semantics { contentDescription = description }
                .padding(horizontal = DramaSpacing.xxs),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = episode.index.toString(),
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
        )
        if (episode.access == EpisodeAccess.LOCKED) {
            Spacer(Modifier.width(2.dp))
            Icon(
                Icons.Default.Lock,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.size(11.dp),
            )
        } else if (highlighted) {
            Spacer(Modifier.width(2.dp))
            Icon(
                Icons.Default.PlayArrow,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(12.dp),
            )
        }
    }
}

/** Width:height of the compact episode tile — flatter than square now it holds one line only. */
private const val EPISODE_CELL_RATIO = 1.8f

@Composable
private fun SeriesSkeleton() {
    Column(modifier = Modifier.fillMaxSize()) {
        SkeletonBox(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(HEADER_RATIO),
            cornerRadius = 0.dp,
        )
        Spacer(Modifier.height(DramaSpacing.md))
        SkeletonBox(
            modifier =
                Modifier
                    .padding(horizontal = DramaSpacing.md)
                    .width(220.dp)
                    .height(22.dp),
        )
        Spacer(Modifier.height(DramaSpacing.md))
        SkeletonBox(
            modifier =
                Modifier
                    .padding(horizontal = DramaSpacing.md)
                    .fillMaxWidth()
                    .height(DramaSizes.touchTarget),
        )
        Spacer(Modifier.height(DramaSpacing.md))
        Row(
            modifier = Modifier.padding(horizontal = DramaSpacing.md),
            horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
        ) {
            repeat(EPISODE_COLUMNS) {
                SkeletonBox(
                    modifier =
                        Modifier
                            .weight(1f)
                            .aspectRatio(1f),
                )
            }
        }
    }
}

/** Age rating code from the catalogue ("ALL", "PG12", ...) to its label; unknown codes are shown as-is. */
@Composable
private fun ageRatingLabel(rating: String): String =
    when (rating.uppercase()) {
        "ALL" -> stringResource(R.string.series_age_all)
        "PG12" -> stringResource(R.string.series_age_12)
        "PG16" -> stringResource(R.string.series_age_16)
        "R18" -> stringResource(R.string.series_age_18)
        else -> rating
    }

private fun AppError?.toMessage(): UiText =
    when (this) {
        is AppError.Network -> UiText.Res(CoreR.string.error_network)
        is AppError.NotFound -> UiText.Res(R.string.series_error_not_found)
        is AppError.Server -> UiText.of(CoreR.string.error_server, code)
        else -> UiText.Res(R.string.series_error_load)
    }

private const val EPISODE_COLUMNS = 4
private const val HEADER_RATIO = 3f / 4f
private const val TOP_BAR_TRAVERSAL_INDEX = -1f
private const val SYNOPSIS_COLLAPSED_LINES = 3
private const val SYNOPSIS_TOGGLE_THRESHOLD = 120
