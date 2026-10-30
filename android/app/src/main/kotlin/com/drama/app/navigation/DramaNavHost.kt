package com.drama.app.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import com.drama.app.BuildConfig
import com.drama.feature.account.navigation.accountScreen
import com.drama.feature.feed.navigation.feedScreen
import com.drama.feature.home.navigation.HomeRoute
import com.drama.feature.home.navigation.homeScreen
import com.drama.feature.mylist.navigation.myListScreen
import com.drama.feature.player.navigation.navigateToPlayer
import com.drama.feature.player.navigation.playerScreen
import com.drama.feature.search.navigation.navigateToSearch
import com.drama.feature.search.navigation.searchScreen
import com.drama.feature.series.navigation.SeriesRoute
import com.drama.feature.series.navigation.navigateToSeries
import com.drama.feature.series.navigation.seriesScreen

/**
 * Single NavHost. The four top-level tabs share a bottom bar; series sheet, player and search are full-screen
 * destinations pushed on top (no bar). Deep links `drama://series/{id}` and `https://<host>/s/{id}` land on
 * the series sheet.
 */
@Composable
fun DramaNavHost(navController: NavHostController) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val destination = backStackEntry?.destination
    val currentTab = TopLevelTab.entries.firstOrNull { tab -> destination?.hasRoute(tab.route::class) == true }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets =
            androidx.compose.foundation.layout
                .WindowInsets(0, 0, 0, 0),
        bottomBar = {
            if (currentTab != null) {
                DramaBottomBar(current = currentTab, onSelect = { navController.navigateToTab(it) })
            }
        },
    ) { padding ->
        // Only the tabbed destinations sit above the bar; the player and the series sheet are edge-to-edge.
        val contentModifier =
            if (currentTab !=
                null
            ) {
                Modifier.padding(bottom = padding.calculateBottomPadding())
            } else {
                Modifier
            }
        NavHost(navController = navController, startDestination = HomeRoute, modifier = contentModifier) {
            homeScreen(
                onOpenSeries = { seriesId -> navController.navigateToSeries(seriesId) },
                onResumeEpisode = { seriesId, episodeId -> navController.navigateToPlayer(seriesId, episodeId) },
                onOpenSearch = navController::navigateToSearch,
            )
            feedScreen(
                onOpenSeries = { seriesId -> navController.navigateToSeries(seriesId, source = SOURCE_FEED) },
                onWatch = { seriesId, episodeId -> navController.navigateToPlayer(seriesId, episodeId) },
            )
            myListScreen(onOpenSeries = { seriesId ->
                navController.navigateToSeries(seriesId, source = SOURCE_MY_LIST)
            })
            accountScreen(googleWebClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID)
            searchScreen(
                onBack = navController::popBackStack,
                onOpenSeries = { seriesId -> navController.navigateToSeries(seriesId, source = SOURCE_SEARCH) },
            )
            seriesScreen(
                appLinksHost = BuildConfig.APP_LINKS_HOST,
                onBack = navController::popBackStack,
                onPlayEpisode = { seriesId, episodeId -> navController.navigateToPlayer(seriesId, episodeId) },
            )
            playerScreen(onBack = navController::popBackStack)
        }
    }
}

/** `series_view.source` values for the entry points added in sprint 4 (home and deeplink live in [SeriesRoute]). */
private const val SOURCE_FEED = "feed"
private const val SOURCE_MY_LIST = "my_list"
private const val SOURCE_SEARCH = "search"
