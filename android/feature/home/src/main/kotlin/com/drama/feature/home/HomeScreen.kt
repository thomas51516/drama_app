package com.drama.feature.home

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
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.common.result.AppError
import com.drama.core.ui.component.DramaPrimaryButton
import com.drama.core.ui.component.LoadingIndicator
import com.drama.core.ui.component.PosterImage
import com.drama.core.ui.theme.DramaSpacing
import com.drama.core.ui.theme.DramaTheme
import com.drama.domain.model.HomeContent
import com.drama.domain.model.HomeRow
import com.drama.domain.model.Series

/** Home fed by `GET /home` (S02): plain cards per row, no design polish yet (M-01..M-09 arrive in Sprint 3). */
@Composable
fun HomeScreen(
    onPlaySeries: (seriesId: String) -> Unit,
    onOpenSeries: (seriesId: String) -> Unit,
    onOpenAccount: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    HomeContent(
        state = state,
        onSeriesClick = { seriesId ->
            viewModel.onSeriesClicked(seriesId)
            onPlaySeries(seriesId)
        },
        onOpenSeries = onOpenSeries,
        onOpenAccount = onOpenAccount,
        onRetry = viewModel::retry,
        modifier = modifier,
    )
}

@Composable
fun HomeContent(
    state: HomeUiState,
    onSeriesClick: (seriesId: String) -> Unit,
    onOpenSeries: (seriesId: String) -> Unit,
    onOpenAccount: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .safeDrawingPadding(),
    ) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = "DRAMA", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
            TextButton(onClick = onOpenAccount) { Text("Mon compte") }
        }
        if (state.isRefreshing) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
        when {
            state.isLoading -> LoadingIndicator()
            state.showError -> HomeError(error = state.error, onRetry = onRetry)
            state.content == null || state.content.isEmpty ->
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Aucune série publiée") }
            else ->
                HomeRows(
                    content = state.content,
                    staleError = state.error,
                    onSeriesClick = onSeriesClick,
                    onOpenSeries = onOpenSeries,
                    onRetry = onRetry,
                )
        }
    }
}

@Composable
private fun HomeRows(
    content: HomeContent,
    staleError: AppError?,
    onSeriesClick: (String) -> Unit,
    onOpenSeries: (String) -> Unit,
    onRetry: () -> Unit,
) {
    LazyColumn(
        contentPadding = PaddingValues(bottom = DramaSpacing.xl),
        verticalArrangement = Arrangement.spacedBy(DramaSpacing.md),
    ) {
        if (staleError != null) {
            item {
                Row(
                    modifier = Modifier.padding(horizontal = DramaSpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Hors ligne : contenu en cache",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = onRetry) { Text("Réessayer") }
                }
            }
        }
        if (content.banners.isNotEmpty()) {
            item {
                val banner = content.banners.first()
                Column(modifier = Modifier.padding(horizontal = DramaSpacing.md)) {
                    PosterImage(
                        url = banner.posterHorizontalUrl ?: banner.posterVerticalUrl,
                        contentDescription = banner.title,
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .aspectRatio(16f / 9f)
                                .clip(RoundedCornerShape(12.dp))
                                .clickable { onSeriesClick(banner.id) },
                    )
                    Spacer(Modifier.height(DramaSpacing.xs))
                    Text(banner.title, style = MaterialTheme.typography.titleMedium)
                }
            }
        }
        items(content.rows.filter { it.items.isNotEmpty() }, key = { it.key }) { row ->
            HomeRowSection(row = row, onSeriesClick = onSeriesClick, onOpenSeries = onOpenSeries)
        }
    }
}

@Composable
private fun HomeRowSection(
    row: HomeRow,
    onSeriesClick: (String) -> Unit,
    onOpenSeries: (String) -> Unit,
) {
    Column {
        Text(
            text = row.title,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.xs),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = DramaSpacing.md),
            horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
        ) {
            items(row.items, key = { it.series.id + (it.episode?.id ?: "") }) { item ->
                SeriesCard(
                    series = item.series,
                    subtitle =
                        item.episode?.let { "Reprendre l'épisode ${it.index}" }
                            ?: "${item.series.episodeCount} épisodes · ${item.series.freeEpisodeCount} gratuits",
                    onClick = { onSeriesClick(item.series.id) },
                    onLongClick = { onOpenSeries(item.series.id) },
                )
            }
        }
    }
}

@Composable
private fun SeriesCard(
    series: Series,
    subtitle: String,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .width(CARD_WIDTH)
                .clickable(onClick = onClick),
    ) {
        PosterImage(
            url = series.posterVerticalUrl,
            contentDescription = series.title,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(9f / 16f)
                    .clip(RoundedCornerShape(10.dp)),
        )
        Spacer(Modifier.height(DramaSpacing.xs))
        Text(series.title, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        TextButton(onClick = onLongClick, contentPadding = PaddingValues(0.dp)) {
            Text("Fiche", style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun HomeError(
    error: AppError?,
    onRetry: () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(DramaSpacing.lg),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text =
                when (error) {
                    is AppError.Network -> "Pas de connexion. Vérifiez le réseau puis réessayez."
                    is AppError.Server -> "Le service est indisponible (${error.code}). Réessayez dans un instant."
                    else -> "Impossible de charger l'accueil."
                },
            color = MaterialTheme.colorScheme.error,
        )
        Spacer(Modifier.height(DramaSpacing.md))
        DramaPrimaryButton(text = "Réessayer", onClick = onRetry)
    }
}

private val CARD_WIDTH = 132.dp

@Preview(showBackground = true)
@Composable
private fun HomeContentPreview() {
    val series =
        Series(
            id = "s1",
            slug = "le-secret-du-lagon",
            title = "Le Secret du Lagon",
            synopsis = "",
            posterVerticalUrl = null,
            posterHorizontalUrl = null,
            genres = listOf("romance"),
            episodeCount = 3,
            freeEpisodeCount = 2,
            coinCostPerEpisode = 10,
            ageRating = "PG12",
        )
    DramaTheme {
        HomeContent(
            state =
                HomeUiState(
                    isLoading = false,
                    content =
                        HomeContent(
                            banners = listOf(series),
                            rows =
                                listOf(
                                    HomeRow(
                                        "trending",
                                        "Tendances",
                                        listOf(
                                            com.drama.domain.model
                                                .HomeItem(series),
                                        ),
                                    ),
                                ),
                        ),
                ),
            onSeriesClick = {},
            onOpenSeries = {},
            onOpenAccount = {},
            onRetry = {},
        )
    }
}
