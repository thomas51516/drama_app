package com.drama.app.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import com.drama.feature.account.navigation.accountScreen
import com.drama.feature.account.navigation.navigateToAccount
import com.drama.feature.home.navigation.HomeRoute
import com.drama.feature.home.navigation.homeScreen
import com.drama.feature.player.navigation.navigateToPlayer
import com.drama.feature.player.navigation.playerScreen
import com.drama.feature.series.navigation.navigateToSeries
import com.drama.feature.series.navigation.seriesScreen

@Composable
fun DramaNavHost(navController: NavHostController) {
    NavHost(navController = navController, startDestination = HomeRoute) {
        homeScreen(
            onPlaySeries = { seriesId -> navController.navigateToPlayer(seriesId) },
            onOpenSeries = navController::navigateToSeries,
            onOpenAccount = navController::navigateToAccount,
        )
        seriesScreen(onPlay = { seriesId -> navController.navigateToPlayer(seriesId) })
        playerScreen(onBack = navController::popBackStack)
        accountScreen()
    }
}
