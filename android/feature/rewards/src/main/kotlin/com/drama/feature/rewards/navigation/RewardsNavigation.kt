package com.drama.feature.rewards.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navDeepLink
import com.drama.feature.rewards.RewardsScreen
import kotlinx.serialization.Serializable

/** "Récompenses" (M-40 / M-41). Deep link `drama://rewards` (check-in reminder push). */
@Serializable
data object RewardsRoute {
    const val DEEP_LINK = "drama://rewards"
}

fun NavController.navigateToRewards() = navigate(RewardsRoute)

fun NavGraphBuilder.rewardsScreen(onBack: () -> Unit) {
    composable<RewardsRoute>(deepLinks = listOf(navDeepLink { uriPattern = RewardsRoute.DEEP_LINK })) {
        RewardsScreen(onBack = onBack)
    }
}
