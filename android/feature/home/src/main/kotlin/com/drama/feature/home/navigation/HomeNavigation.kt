package com.drama.feature.home.navigation

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.drama.feature.home.HomeScreen
import kotlinx.serialization.Serializable

@Serializable
data object HomeRoute

fun NavGraphBuilder.homeScreen(
    onPlaySeries: (seriesId: String) -> Unit,
    onOpenSeries: (seriesId: String) -> Unit,
    onOpenAccount: () -> Unit,
) {
    composable<HomeRoute> {
        HomeScreen(
            onPlaySeries = onPlaySeries,
            onOpenSeries = onOpenSeries,
            onOpenAccount = onOpenAccount,
        )
    }
}
