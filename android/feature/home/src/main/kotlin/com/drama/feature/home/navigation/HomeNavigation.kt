package com.drama.feature.home.navigation

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.drama.feature.home.HomeScreen
import kotlinx.serialization.Serializable

@Serializable
data object HomeRoute

fun NavGraphBuilder.homeScreen(
    onOpenSeries: (seriesId: String) -> Unit,
    onResumeEpisode: (seriesId: String, episodeId: String) -> Unit,
    onOpenSearch: () -> Unit,
) {
    composable<HomeRoute> {
        HomeScreen(onOpenSeries = onOpenSeries, onResumeEpisode = onResumeEpisode, onOpenSearch = onOpenSearch)
    }
}
