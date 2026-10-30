package com.drama.feature.search

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.ui.component.ErrorState
import com.drama.core.ui.component.PosterCard
import com.drama.core.ui.text.asString
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.Series
import com.drama.core.ui.R as CoreR

data class SearchActions(
    val onQueryChanged: (String) -> Unit,
    val onSubmit: (String) -> Unit,
    val onClear: () -> Unit,
    val onGenreSelected: (String?) -> Unit,
    val onRemoveRecent: (String) -> Unit,
    val onClearRecent: () -> Unit,
    val onRetry: () -> Unit,
    val onOpenSeries: (String) -> Unit,
    val onBack: () -> Unit,
)

@Composable
fun SearchScreen(
    onBack: () -> Unit,
    onOpenSeries: (seriesId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SearchViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    SearchContent(
        state = state,
        actions =
            SearchActions(
                onQueryChanged = viewModel::onQueryChanged,
                onSubmit = viewModel::onSubmit,
                onClear = viewModel::onClear,
                onGenreSelected = viewModel::onGenreSelected,
                onRemoveRecent = viewModel::onRemoveRecent,
                onClearRecent = viewModel::onClearRecent,
                onRetry = viewModel::retry,
                onOpenSeries = onOpenSeries,
                onBack = onBack,
            ),
        modifier = modifier,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchContent(
    state: SearchUiState,
    actions: SearchActions,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .statusBarsPadding()
                .imePadding(),
    ) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(end = DramaSpacing.md, top = DramaSpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = actions.onBack, modifier = Modifier.size(DramaSizes.touchTarget)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(CoreR.string.action_back))
            }
            OutlinedTextField(
                value = state.query,
                onValueChange = actions.onQueryChanged,
                placeholder = {
                    Text(
                        stringResource(R.string.search_placeholder),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (state.query.isNotEmpty()) {
                        IconButton(onClick = actions.onClear, modifier = Modifier.size(DramaSizes.touchTarget)) {
                            Icon(Icons.Default.Clear, contentDescription = stringResource(CoreR.string.action_clear))
                        }
                    }
                },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { actions.onSubmit(state.query) }),
                shape = MaterialTheme.shapes.large,
                modifier =
                    Modifier
                        .weight(1f)
                        .focusRequester(focusRequester),
            )
        }
        GenreChips(chips = state.genreChips, selected = state.selectedGenre, onSelect = actions.onGenreSelected)
        if (state.isSearching) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        val errorMessage = state.errorMessage
        when {
            state.showSuggestions -> SuggestionList(state.suggestions, onPick = actions.onSubmit)
            state.isIdle && !state.searched -> RecentSearches(state.recentSearches, actions)
            errorMessage != null -> ErrorState(message = errorMessage.asString(), onRetry = actions.onRetry)
            state.showEmpty -> EmptyResults(state, onPick = actions.onSubmit)
            else -> ResultsGrid(state, onOpenSeries = actions.onOpenSeries)
        }
    }
}

/** Genre filter chips; [FilterChip] already exposes its selected state to TalkBack. */
@Composable
private fun GenreChips(
    chips: List<String>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = DramaSpacing.md, vertical = DramaSpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
    ) {
        items(chips, key = { it }) { genre ->
            FilterChip(
                selected = genre == selected,
                onClick = { onSelect(genre) },
                label = {
                    Text(
                        genre.replaceFirstChar(Char::titlecase),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
            )
        }
    }
}

@Composable
private fun SuggestionList(
    suggestions: List<String>,
    onPick: (String) -> Unit,
) {
    LazyColumn {
        items(suggestions, key = { it }) { suggestion ->
            val description = stringResource(R.string.search_suggestion_cd, suggestion)
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clickable(onClick = { onPick(suggestion) }, role = Role.Button)
                        .semantics { contentDescription = description }
                        .heightIn(min = DramaSizes.touchTarget)
                        .padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm + DramaSpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Default.Search,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.size(DramaSpacing.sm + DramaSpacing.xs))
                Text(
                    suggestion,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                )
            }
        }
    }
}

@Composable
private fun RecentSearches(
    recent: List<String>,
    actions: SearchActions,
) {
    if (recent.isEmpty()) {
        Text(
            text = stringResource(R.string.search_hint_empty),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(DramaSpacing.lg),
        )
        return
    }
    LazyColumn {
        item(key = "header") {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(start = DramaSpacing.md, end = DramaSpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.search_recent_heading),
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier =
                        Modifier
                            .weight(1f)
                            .semantics { heading() },
                )
                TextButton(onClick = actions.onClearRecent) { Text(stringResource(R.string.search_clear_all)) }
            }
        }
        items(recent, key = { it }) { query ->
            val suggestionDescription = stringResource(R.string.search_suggestion_cd, query)
            // The row is the "search again" button; the trailing remove button stays its own node.
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clickable(onClick = { actions.onSubmit(query) }, role = Role.Button)
                        .semantics { contentDescription = suggestionDescription }
                        .heightIn(min = DramaSizes.touchTarget)
                        .padding(start = DramaSpacing.md, end = DramaSpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = query,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.weight(1f),
                )
                IconButton(
                    onClick = { actions.onRemoveRecent(query) },
                    modifier = Modifier.size(DramaSizes.touchTarget),
                ) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = stringResource(R.string.search_remove_recent_cd, query),
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyResults(
    state: SearchUiState,
    onPick: (String) -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(DramaSpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val genre = state.selectedGenre
        Text(
            text =
                if (genre != null) {
                    stringResource(R.string.search_no_results_genre, state.query, genre)
                } else {
                    stringResource(R.string.search_no_results, state.query)
                },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        if (state.suggestions.isNotEmpty()) {
            Spacer(Modifier.height(DramaSpacing.md))
            Text(
                stringResource(R.string.search_try),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
            state.suggestions.forEach { suggestion ->
                TextButton(onClick = { onPick(suggestion) }) { Text(suggestion) }
            }
        }
    }
}

@Composable
private fun ResultsGrid(
    state: SearchUiState,
    onOpenSeries: (String) -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = GRID_MIN_CELL),
            contentPadding = PaddingValues(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
            horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm + DramaSpacing.xs),
            verticalArrangement = Arrangement.spacedBy(DramaSpacing.md),
            modifier = Modifier.fillMaxSize(),
        ) {
            items(state.results, key = { it.id }) { series -> ResultCard(series, onOpenSeries) }
        }
        if (state.searched && state.results.isNotEmpty()) {
            Text(
                text = pluralStringResource(R.plurals.search_result_count, state.total, state.total),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier =
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(end = DramaSpacing.md, top = DramaSpacing.xxs),
            )
        }
    }
}

@Composable
private fun ResultCard(
    series: Series,
    onOpenSeries: (String) -> Unit,
) {
    val episodeCount = series.episodeCount
    PosterCard(
        title = series.title,
        imageUrl = series.posterVerticalUrl,
        subtitle =
            listOfNotNull(
                pluralStringResource(CoreR.plurals.episode_count_short, episodeCount, episodeCount),
                series.genres.firstOrNull()?.replaceFirstChar(Char::titlecase),
            ).joinToString(" · "),
        onClick = { onOpenSeries(series.id) },
        width = GRID_MIN_CELL,
        modifier = Modifier.fillMaxWidth(),
    )
}

private val GRID_MIN_CELL = 108.dp
