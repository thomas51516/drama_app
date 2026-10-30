package com.drama.feature.search.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.drama.feature.search.SearchScreen
import kotlinx.serialization.Serializable

/** Search (M-03), opened from the home top bar. */
@Serializable
data object SearchRoute

fun NavController.navigateToSearch() = navigate(SearchRoute)

fun NavGraphBuilder.searchScreen(
    onBack: () -> Unit,
    onOpenSeries: (seriesId: String) -> Unit,
) {
    composable<SearchRoute> {
        SearchScreen(onBack = onBack, onOpenSeries = onOpenSeries)
    }
}
