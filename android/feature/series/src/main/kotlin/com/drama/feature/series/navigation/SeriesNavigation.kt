package com.drama.feature.series.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navDeepLink
import androidx.navigation.toRoute
import com.drama.feature.series.SeriesScreen
import kotlinx.serialization.Serializable

/**
 * Series sheet route. Deep link `drama://series/{seriesId}` (M-16 share links; the HTTPS App Links domain is
 * added once the production host is known). [source] feeds the `series_view` analytics event.
 */
@Serializable
data class SeriesRoute(
    val seriesId: String,
    val source: String = SOURCE_HOME,
) {
    companion object {
        const val ARG_SERIES_ID = "seriesId"
        const val ARG_SOURCE = "source"
        const val SOURCE_HOME = "home"
        const val SOURCE_DEEP_LINK = "deeplink"
        const val DEEP_LINK_BASE = "drama://series"
    }
}

fun NavController.navigateToSeries(
    seriesId: String,
    source: String = SeriesRoute.SOURCE_HOME,
) = navigate(SeriesRoute(seriesId, source))

fun NavGraphBuilder.seriesScreen(
    onBack: () -> Unit,
    onPlayEpisode: (seriesId: String, episodeId: String) -> Unit,
) {
    composable<SeriesRoute>(
        deepLinks = listOf(navDeepLink<SeriesRoute>(basePath = SeriesRoute.DEEP_LINK_BASE)),
    ) { backStackEntry ->
        val route = backStackEntry.toRoute<SeriesRoute>()
        SeriesScreen(
            onBack = onBack,
            onPlayEpisode = { episodeId -> onPlayEpisode(route.seriesId, episodeId) },
        )
    }
}
