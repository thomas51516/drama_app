package com.drama.feature.home.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.drama.feature.home.HomeScreen
import com.drama.feature.home.RankingsScreen
import kotlinx.serialization.Serializable

@Serializable
data object HomeRoute

/** "Classements" (M-04), reached from the "Top du jour" row title. */
@Serializable
data object RankingsRoute

fun NavController.navigateToRankings() = navigate(RankingsRoute)

fun NavGraphBuilder.homeScreen(
    onOpenSeries: (seriesId: String) -> Unit,
    onResumeEpisode: (seriesId: String, episodeId: String) -> Unit,
    onOpenSearch: () -> Unit,
    onOpenRankings: () -> Unit = {},
    banner: @Composable () -> Unit = {},
) {
    composable<HomeRoute> {
        HomeScreen(
            onOpenSeries = onOpenSeries,
            onResumeEpisode = onResumeEpisode,
            onOpenSearch = onOpenSearch,
            onOpenRankings = onOpenRankings,
            banner = banner,
        )
    }
}

fun NavGraphBuilder.rankingsScreen(
    onBack: () -> Unit,
    onOpenSeries: (seriesId: String) -> Unit,
) {
    composable<RankingsRoute> {
        RankingsScreen(onBack = onBack, onOpenSeries = onOpenSeries)
    }
}
