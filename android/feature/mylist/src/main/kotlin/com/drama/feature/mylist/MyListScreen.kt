package com.drama.feature.mylist

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.common.result.AppError
import com.drama.core.ui.component.LoadingIndicator
import com.drama.core.ui.component.OfflineBanner
import com.drama.core.ui.component.PosterCard
import com.drama.core.ui.text.UiText
import com.drama.core.ui.text.asString
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.Series
import com.drama.core.ui.R as CoreR

@Composable
fun MyListScreen(
    onOpenSeries: (seriesId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: MyListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    LaunchedEffect(state.error) {
        val error = state.error ?: return@LaunchedEffect
        val message = state.errorMessage ?: return@LaunchedEffect
        if (state.items.isNotEmpty() || error !is AppError.Http) {
            snackbar.showSnackbar(message.asString(context))
            viewModel.onErrorShown()
        }
    }
    Box(modifier = modifier.fillMaxSize()) {
        MyListContent(
            state = state,
            onRefresh = viewModel::refresh,
            onOpenSeries = onOpenSeries,
            onRemove = viewModel::onRemove,
        )
        SnackbarHost(hostState = snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyListContent(
    state: MyListUiState,
    onRefresh: () -> Unit,
    onOpenSeries: (String) -> Unit,
    onRemove: (Series) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .statusBarsPadding(),
    ) {
        Text(
            text = stringResource(CoreR.string.my_list),
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
            modifier =
                Modifier
                    .padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm)
                    .semantics { heading() },
        )
        if (state.isLoading) {
            LoadingIndicator()
            return
        }
        PullToRefreshBox(isRefreshing = state.isRefreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = CELL_MIN),
                contentPadding = PaddingValues(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
                horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm + DramaSpacing.xs),
                verticalArrangement = Arrangement.spacedBy(DramaSpacing.md),
                modifier = Modifier.fillMaxSize(),
            ) {
                if (state.error != null && state.items.isNotEmpty()) {
                    item(key = "offline", span = { GridItemSpan(maxLineSpan) }) {
                        OfflineBanner(message = stringResource(R.string.mylist_offline_cached), onRetry = onRefresh)
                    }
                }
                if (state.showEmpty) {
                    item(key = "empty", span = { GridItemSpan(maxLineSpan) }) {
                        EmptyList(message = state.errorMessage)
                    }
                }
                items(state.items, key = { it.id }) { series ->
                    MyListCell(series = series, onOpenSeries = onOpenSeries, onRemove = onRemove)
                }
            }
        }
    }
}

/** Poster card with a remove button: 48 dp touch target drawn as a 32 dp translucent square. */
@Composable
private fun MyListCell(
    series: Series,
    onOpenSeries: (String) -> Unit,
    onRemove: (Series) -> Unit,
) {
    val episodeCount = series.episodeCount
    Box {
        PosterCard(
            title = series.title,
            imageUrl = series.posterVerticalUrl,
            subtitle = pluralStringResource(CoreR.plurals.episode_count_short, episodeCount, episodeCount),
            onClick = { onOpenSeries(series.id) },
            width = CELL_MIN,
            modifier = Modifier.fillMaxWidth(),
        )
        IconButton(
            onClick = { onRemove(series) },
            modifier =
                Modifier
                    .align(Alignment.TopEnd)
                    .size(DramaSizes.touchTarget),
        ) {
            Box(
                modifier =
                    Modifier
                        .size(REMOVE_VISUAL_SIZE)
                        .background(Color.Black.copy(alpha = 0.55f), MaterialTheme.shapes.extraSmall),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Default.Close,
                    contentDescription = stringResource(R.string.mylist_remove_cd, series.title),
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

@Composable
private fun EmptyList(message: UiText?) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(top = DramaSpacing.xl, start = DramaSpacing.lg, end = DramaSpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Default.FavoriteBorder,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(DramaSizes.touchTarget),
        )
        Spacer(Modifier.height(DramaSpacing.md))
        Text(
            text = stringResource(R.string.mylist_empty_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(DramaSpacing.xs))
        Text(
            text = message?.asString() ?: stringResource(R.string.mylist_empty_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(DramaSpacing.lg))
    }
}

private val CELL_MIN = 108.dp
private val REMOVE_VISUAL_SIZE = 32.dp
