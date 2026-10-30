package com.drama.feature.mylist

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.common.result.AppError
import com.drama.core.ui.component.LoadingIndicator
import com.drama.core.ui.component.OfflineBanner
import com.drama.core.ui.component.PosterCard
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.Series

@Composable
fun MyListScreen(
    onOpenSeries: (seriesId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: MyListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.error) {
        val error = state.error ?: return@LaunchedEffect
        if (state.items.isNotEmpty() || error !is AppError.Http) {
            snackbar.showSnackbar(error.toMessage())
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
            text = "Ma liste",
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
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
                    item(key = "offline", span = {
                        androidx.compose.foundation.lazy.grid
                            .GridItemSpan(maxLineSpan)
                    }) {
                        OfflineBanner(message = "Hors ligne : liste en cache", onRetry = onRefresh)
                    }
                }
                if (state.showEmpty) {
                    item(key = "empty", span = {
                        androidx.compose.foundation.lazy.grid
                            .GridItemSpan(maxLineSpan)
                    }) {
                        EmptyList(error = state.error)
                    }
                }
                items(state.items, key = { it.id }) { series ->
                    Box {
                        PosterCard(
                            title = series.title,
                            imageUrl = series.posterVerticalUrl,
                            subtitle = "${series.episodeCount} ép.",
                            onClick = { onOpenSeries(series.id) },
                            width = CELL_MIN,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        IconButton(
                            onClick = { onRemove(series) },
                            modifier =
                                Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(DramaSpacing.xs)
                                    .size(32.dp)
                                    .background(Color.Black.copy(alpha = 0.55f), MaterialTheme.shapes.extraSmall),
                        ) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "Retirer de Ma liste",
                                tint = Color.White,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyList(error: AppError?) {
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
            modifier = Modifier.size(48.dp),
        )
        Spacer(Modifier.height(DramaSpacing.md))
        Text(
            text = "Votre liste est vide",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(DramaSpacing.xs))
        Text(
            text =
                if (error != null) {
                    error.toMessage()
                } else {
                    "Appuyez sur le cœur d'une série pour la retrouver ici."
                },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Row { Spacer(Modifier.height(DramaSpacing.lg)) }
    }
}

private fun AppError.toMessage(): String =
    when (this) {
        is AppError.Network -> "Pas de connexion. Votre liste sera synchronisée au retour du réseau."
        is AppError.Server -> "Le service est indisponible ($code)."
        is AppError.Http ->
            if (code ==
                HTTP_NOT_IMPLEMENTED
            ) {
                "La synchronisation arrive bientôt."
            } else {
                "Synchronisation impossible."
            }
        else -> "Synchronisation impossible."
    }

private const val HTTP_NOT_IMPLEMENTED = 501
private val CELL_MIN = 108.dp
