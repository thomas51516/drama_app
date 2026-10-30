package com.drama.app.navigation

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import com.drama.app.BuildConfig
import com.drama.app.R
import com.drama.app.push.ForegroundPushBus
import com.drama.domain.model.NotificationTarget
import com.drama.feature.account.navigation.accountScreen
import com.drama.feature.feed.navigation.feedScreen
import com.drama.feature.help.navigation.helpScreen
import com.drama.feature.help.navigation.navigateToHelp
import com.drama.feature.home.navigation.HomeRoute
import com.drama.feature.home.navigation.homeScreen
import com.drama.feature.mylist.navigation.myListScreen
import com.drama.feature.notifications.navigation.navigateToNotifications
import com.drama.feature.notifications.navigation.notificationsScreen
import com.drama.feature.player.navigation.navigateToPlayer
import com.drama.feature.player.navigation.playerScreen
import com.drama.feature.search.navigation.navigateToSearch
import com.drama.feature.search.navigation.searchScreen
import com.drama.feature.series.navigation.SeriesRoute
import com.drama.feature.series.navigation.navigateToSeries
import com.drama.feature.series.navigation.seriesScreen

/**
 * Single NavHost. The four top-level tabs share a bottom bar; series sheet, player, search, help and
 * notifications are full-screen destinations pushed on top (no bar). Deep links `drama://series/{id}`,
 * `https://<host>/s/{id}`, `drama://player/{seriesId}/{episodeId}`, `drama://notifications` and `drama://help`
 * land on their screens (share links M-16, push routing M-54).
 */
@Composable
fun DramaNavHost(
    navController: NavHostController,
    foregroundPush: ForegroundPushBus? = null,
) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val destination = backStackEntry?.destination
    val currentTab = TopLevelTab.entries.firstOrNull { tab -> destination?.hasRoute(tab.route::class) == true }
    val snackbar = remember { SnackbarHostState() }

    // M-54: a push received while the app is visible is a snackbar with a "Voir" action, not a status-bar banner.
    if (foregroundPush != null) {
        val openLabel = stringResource(R.string.push_snackbar_open)
        LaunchedEffect(foregroundPush, openLabel) {
            foregroundPush.messages.collect { message ->
                val text = listOf(message.title, message.body).filter { it.isNotBlank() }.joinToString(" — ")
                val result = snackbar.showSnackbar(text, actionLabel = openLabel, duration = SnackbarDuration.Long)
                if (result == SnackbarResult.ActionPerformed) navController.navigateToTarget(message.target)
            }
        }
    }

    Scaffold(
        containerColor = Color.Transparent,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(hostState = snackbar) },
        bottomBar = {
            if (currentTab != null) {
                DramaBottomBar(current = currentTab, onSelect = { navController.navigateToTab(it) })
            }
        },
    ) { padding ->
        // Only the tabbed destinations sit above the bar; the player and the series sheet are edge-to-edge.
        val contentModifier =
            if (currentTab != null) {
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
            accountScreen(
                googleWebClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID,
                onOpenHelp = navController::navigateToHelp,
                onOpenNotifications = navController::navigateToNotifications,
            )
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
            helpScreen(onBack = navController::popBackStack)
            notificationsScreen(
                onBack = navController::popBackStack,
                onOpenTarget = navController::navigateToTarget,
            )
        }
    }
}

/** Routing of a notification tap or snackbar action (M-54). */
fun NavHostController.navigateToTarget(target: NotificationTarget) {
    when (target) {
        is NotificationTarget.Series -> navigateToSeries(target.seriesId, source = SOURCE_PUSH)
        is NotificationTarget.Episode -> navigateToPlayer(target.seriesId, target.episodeId)
        NotificationTarget.Notifications -> navigateToNotifications()
        NotificationTarget.Help -> navigateToHelp()
        NotificationTarget.Home -> navigateToTab(TopLevelTab.HOME)
    }
}

/** `series_view.source` values for the entry points added in sprint 4 (home and deeplink live in [SeriesRoute]). */
private const val SOURCE_FEED = "feed"
private const val SOURCE_MY_LIST = "my_list"
private const val SOURCE_SEARCH = "search"
private const val SOURCE_PUSH = "push"
