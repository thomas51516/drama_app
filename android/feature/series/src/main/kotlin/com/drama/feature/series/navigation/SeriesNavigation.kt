package com.drama.feature.series.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navDeepLink
import androidx.navigation.toRoute
import com.drama.feature.series.SeriesScreen
import kotlinx.serialization.Serializable

/**
 * Series sheet route. Deep links (M-16 share links): `drama://series/{seriesId}` and the HTTPS App Link
 * `https://<appLinksHost>/s/{seriesId}` (host from `BuildConfig.APP_LINKS_HOST`). [source] feeds `series_view`:
 * in-app navigation always passes it ([navigateToSeries]), so the default only applies to deep links.
 */
@Serializable
data class SeriesRoute(
    val seriesId: String,
    val source: String = SOURCE_DEEP_LINK,
) {
    companion object {
        const val ARG_SERIES_ID = "seriesId"
        const val ARG_SOURCE = "source"
        const val SOURCE_HOME = "home"
        const val SOURCE_DEEP_LINK = "deeplink"
        const val DEEP_LINK_BASE = "drama://series"

        /** Path segment of the HTTPS share link (`https://host/s/{seriesId}`). */
        const val APP_LINK_PATH = "s"

        fun appLinkBase(host: String) = "https://$host/$APP_LINK_PATH"
    }
}

fun NavController.navigateToSeries(
    seriesId: String,
    source: String = SeriesRoute.SOURCE_HOME,
) = navigate(SeriesRoute(seriesId, source))

fun NavGraphBuilder.seriesScreen(
    appLinksHost: String,
    onBack: () -> Unit,
    onPlayEpisode: (seriesId: String, episodeId: String) -> Unit,
    onOpenWallet: () -> Unit,
) {
    composable<SeriesRoute>(
        deepLinks =
            listOf(
                navDeepLink<SeriesRoute>(basePath = SeriesRoute.DEEP_LINK_BASE),
                navDeepLink<SeriesRoute>(basePath = SeriesRoute.appLinkBase(appLinksHost)),
            ),
    ) { backStackEntry ->
        val route = backStackEntry.toRoute<SeriesRoute>()
        SeriesScreen(
            onBack = onBack,
            onPlayEpisode = { episodeId -> onPlayEpisode(route.seriesId, episodeId) },
            onOpenWallet = onOpenWallet,
        )
    }
}
