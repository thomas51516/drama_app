package com.drama.feature.player.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.drama.feature.player.ui.PlayerScreen
import kotlinx.serialization.Serializable

@Serializable
data class PlayerRoute(
    val seriesId: String,
) {
    companion object {
        /** Key under which Navigation stores [seriesId] in the SavedStateHandle. */
        const val ARG_SERIES_ID = "seriesId"
    }
}

fun NavController.navigateToPlayer(seriesId: String) = navigate(PlayerRoute(seriesId))

fun NavGraphBuilder.playerScreen(onBack: () -> Unit) {
    composable<PlayerRoute> {
        PlayerScreen(onBack = onBack)
    }
}
