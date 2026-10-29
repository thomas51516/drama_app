package com.drama.feature.series

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
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
import com.drama.core.ui.theme.DramaColors
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.Series

@Composable
fun SeriesScreen(
    onBack: () -> Unit,
    onPlayEpisode: (episodeId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SeriesViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    SeriesContent(
        state = state,
        onBack = onBack,
        onPlayEpisode = onPlayEpisode,
        onToggleSynopsis = viewModel::onToggleSynopsis,
        onRetry = viewModel::retry,
        modifier = modifier,
    )
}

@Composable
fun SeriesContent(
    state: SeriesUiState,
    onBack: () -> Unit,
    onPlayEpisode: (episodeId: String) -> Unit,
    onToggleSynopsis: () -> Unit,
    onRetry: () -> Unit,
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
            state.showError -> ErrorState(message = state.error.toMessage(), onRetry = onRetry)
            state.series != null ->
                SeriesBody(
                    series = state.series,
                    state = state,
                    onPlayEpisode = onPlayEpisode,
                    onToggleSynopsis = onToggleSynopsis,
                    onRetry = onRetry,
                )
        }
        IconButton(
            onClick = onBack,
            modifier =
                Modifier
                    .statusBarsPadding()
                    .padding(DramaSpacing.xs)
                    .background(Color.Black.copy(alpha = 0.45f), CircleShape),
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour", tint = Color.White)
        }
    }
}

@Composable
private fun SeriesBody(
    series: Series,
    state: SeriesUiState,
    onPlayEpisode: (episodeId: String) -> Unit,
    onToggleSynopsis: () -> Unit,
    onRetry: () -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(EPISODE_COLUMNS),
        contentPadding = PaddingValues(bottom = DramaSpacing.xl),
        horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) { PosterHeader(series) }
        if (state.error != null) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                OfflineBanner(message = "Hors ligne : contenu en cache", onRetry = onRetry)
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(modifier = Modifier.padding(horizontal = DramaSpacing.md)) {
                MetaRow(series)
                Spacer(Modifier.height(DramaSpacing.md))
                DramaPrimaryButton(
                    text = state.primaryActionLabel,
                    onClick = { state.resumeTarget?.let { onPlayEpisode(it.episodeId) } },
                    enabled = state.resumeTarget != null,
                    modifier = Modifier.fillMaxWidth(),
                )
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
                    text = "Épisodes",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Spacer(Modifier.height(DramaSpacing.sm))
            }
        }
        items(state.episodes, key = { it.id }) { episode ->
            val isCurrent = state.resumeTarget?.episodeId == episode.id && state.resumeTarget.isResume
            EpisodeCell(
                episode = episode,
                highlighted = isCurrent,
                onClick = { onPlayEpisode(episode.id) },
                modifier = Modifier.padding(horizontal = DramaSpacing.xs),
            )
        }
        if (state.episodes.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    text = "Aucun épisode disponible pour le moment.",
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
        PosterImage(
            url = series.posterVerticalUrl ?: series.posterHorizontalUrl,
            contentDescription = series.title,
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
            )
        }
    }
}

@Composable
private fun MetaRow(series: Series) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Chip(text = series.ageRating.toAgeLabel(), outlined = true)
        Chip(text = "${series.episodeCount} épisodes")
        if (series.freeEpisodeCount > 0) Chip(text = "${series.freeEpisodeCount} gratuits", accent = true)
    }
    if (series.genres.isNotEmpty()) {
        Spacer(Modifier.height(DramaSpacing.sm))
        Text(
            text = series.genres.joinToString(" · ") { it.replaceFirstChar(Char::titlecase) },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun Chip(
    text: String,
    outlined: Boolean = false,
    accent: Boolean = false,
) {
    val shape = RoundedCornerShape(6.dp)
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = if (accent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onBackground,
        modifier =
            Modifier
                .then(
                    if (outlined) {
                        Modifier.border(1.dp, MaterialTheme.colorScheme.outline, shape)
                    } else {
                        Modifier.background(
                            if (accent) DramaColors.CrimsonSoft else MaterialTheme.colorScheme.surfaceContainerHigh,
                            shape,
                        )
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
    val body = text.ifBlank { "Synopsis à venir." }
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggle)
                .animateContentSize(),
    ) {
        Text(
            text = body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = if (expanded) Int.MAX_VALUE else SYNOPSIS_COLLAPSED_LINES,
            overflow = TextOverflow.Ellipsis,
        )
        if (body.length > SYNOPSIS_TOGGLE_THRESHOLD) {
            Text(
                text = if (expanded) "Réduire" else "Lire la suite",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = DramaSpacing.xs),
            )
        }
    }
}

/** Episode number with its access status: free, unlocked (check) or locked (lock + coin cost). */
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
            highlighted -> DramaColors.CrimsonSoft
            else -> MaterialTheme.colorScheme.surfaceContainerHigh
        }
    Column(
        modifier =
            modifier
                .aspectRatio(1f)
                .clip(shape)
                .background(container)
                .then(if (highlighted) Modifier.border(1.dp, MaterialTheme.colorScheme.primary, shape) else Modifier)
                .clickable(onClick = onClick)
                .padding(DramaSpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = episode.index.toString(),
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(DramaSpacing.xxs))
        when (episode.access) {
            EpisodeAccess.FREE ->
                StatusLabel(text = "Gratuit", color = DramaColors.Success)
            EpisodeAccess.UNLOCKED ->
                StatusLabel(
                    text = "Débloqué",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    icon = Icons.Default.Check,
                )
            EpisodeAccess.LOCKED ->
                StatusLabel(
                    text = if (episode.coinCost > 0) "${episode.coinCost}" else "Verrouillé",
                    color = MaterialTheme.colorScheme.secondary,
                    icon = Icons.Default.Lock,
                )
        }
        if (highlighted) {
            Icon(
                Icons.Default.PlayArrow,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(14.dp),
            )
        }
    }
}

@Composable
private fun StatusLabel(
    text: String,
    color: Color,
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        if (icon != null) Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(11.dp))
        Text(text = text, style = MaterialTheme.typography.labelSmall, color = color, maxLines = 1)
    }
}

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
                    .height(48.dp),
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

private fun String.toAgeLabel(): String =
    when (uppercase()) {
        "ALL" -> "Tous publics"
        "PG12" -> "12+"
        "PG16" -> "16+"
        "R18" -> "18+"
        else -> this
    }

private fun AppError?.toMessage(): String =
    when (this) {
        is AppError.Network -> "Pas de connexion. Vérifiez le réseau puis réessayez."
        is AppError.NotFound -> "Cette série n'est plus disponible."
        is AppError.Server -> "Le service est indisponible ($code). Réessayez dans un instant."
        else -> "Impossible de charger la série."
    }

private const val EPISODE_COLUMNS = 5
private const val HEADER_RATIO = 3f / 4f
private const val SYNOPSIS_COLLAPSED_LINES = 3
private const val SYNOPSIS_TOGGLE_THRESHOLD = 120
