package com.drama.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.ui.component.ErrorState
import com.drama.core.ui.component.PosterImage
import com.drama.core.ui.text.asString
import com.drama.core.ui.theme.DramaColors
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.RankingItem
import com.drama.domain.model.RankingPeriod
import com.drama.core.ui.R as CoreR

data class RankingsActions(
    val onBack: () -> Unit,
    val onPeriodSelected: (RankingPeriod) -> Unit,
    val onGenreSelected: (String?) -> Unit,
    val onOpenSeries: (String) -> Unit,
    val onRetry: () -> Unit,
)

/** "Classements" (M-04): top of the day / week / all time, filtered by genre. */
@Composable
fun RankingsScreen(
    onBack: () -> Unit,
    onOpenSeries: (seriesId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: RankingsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    RankingsContent(
        state = state,
        actions =
            RankingsActions(
                onBack = onBack,
                onPeriodSelected = viewModel::onPeriodSelected,
                onGenreSelected = viewModel::onGenreSelected,
                onOpenSeries = onOpenSeries,
                onRetry = viewModel::retry,
            ),
        modifier = modifier,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RankingsContent(
    state: RankingsUiState,
    actions: RankingsActions,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.rankings_title), modifier = Modifier.semantics { heading() }) },
                navigationIcon = {
                    IconButton(onClick = actions.onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(CoreR.string.action_back),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            PrimaryTabRow(selectedTabIndex = state.period.ordinal) {
                RankingPeriod.entries.forEach { period ->
                    Tab(
                        selected = period == state.period,
                        onClick = { actions.onPeriodSelected(period) },
                        text = { Text(stringResource(period.labelRes())) },
                        modifier = Modifier.heightIn(min = DramaSizes.touchTarget),
                    )
                }
            }
            if (state.genreChips.isNotEmpty()) {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = DramaSpacing.md, vertical = DramaSpacing.xs),
                    horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
                ) {
                    items(state.genreChips, key = { it }) { genre ->
                        FilterChip(
                            selected = genre == state.genre,
                            onClick = { actions.onGenreSelected(genre) },
                            label = { Text(state.genreLabel(genre), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        )
                    }
                }
            }
            if (state.isLoading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            when {
                state.showError -> ErrorState(message = state.error?.asString().orEmpty(), onRetry = actions.onRetry)
                state.isEmpty ->
                    Text(
                        text = stringResource(R.string.rankings_empty),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(DramaSpacing.lg),
                    )
                else -> RankingList(state.items, state, actions.onOpenSeries)
            }
        }
    }
}

@Composable
private fun RankingList(
    items: List<RankingItem>,
    state: RankingsUiState,
    onOpenSeries: (String) -> Unit,
) {
    val bottomInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    LazyColumn(
        contentPadding = PaddingValues(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
        modifier = Modifier.fillMaxSize().padding(bottom = bottomInset),
    ) {
        items(items, key = { it.series.id }) { item -> RankingRow(item, state, onOpenSeries) }
    }
}

/** Rank, poster, title, genre + episode count, viewers; one button node per row. */
@Composable
private fun RankingRow(
    item: RankingItem,
    state: RankingsUiState,
    onOpenSeries: (String) -> Unit,
) {
    val series = item.series
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                .clickable(onClick = { onOpenSeries(series.id) }, role = Role.Button)
                .semantics(mergeDescendants = true) {}
                .padding(DramaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = item.rank.toString(),
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Black),
            color = if (item.rank <= PODIUM) DramaColors.Gold else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(36.dp),
        )
        Box(modifier = Modifier.size(width = 52.dp, height = 78.dp).clip(RoundedCornerShape(8.dp))) {
            PosterImage(
                url = series.posterVerticalUrl,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                fallbackText = series.title,
            )
        }
        Spacer(Modifier.width(DramaSpacing.sm + DramaSpacing.xs))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = series.title,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            val count = series.episodeCount
            Text(
                text =
                    listOfNotNull(
                        series.genres.firstOrNull()?.let(state::genreLabel),
                        pluralStringResource(CoreR.plurals.episode_count_short, count, count),
                    ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            item.viewers?.let { viewers ->
                Spacer(Modifier.height(DramaSpacing.xxs))
                Text(
                    text = pluralStringResource(R.plurals.rankings_viewers, viewers, viewers),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

private fun RankingPeriod.labelRes(): Int =
    when (this) {
        RankingPeriod.DAY -> R.string.rankings_period_day
        RankingPeriod.WEEK -> R.string.rankings_period_week
        RankingPeriod.ALL -> R.string.rankings_period_all
    }

private const val PODIUM = 3
