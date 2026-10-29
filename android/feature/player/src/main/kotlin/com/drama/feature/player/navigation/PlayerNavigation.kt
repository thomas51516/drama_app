package com.drama.feature.player.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.drama.feature.player.ui.PlayerScreen
import kotlinx.serialization.Serializable

@Serializable
data class PlayerRoute(
    val seriesId: String,
    /** Episode to open first; the first episode when null. */
    val episodeId: String? = null,
) {
    companion object {
        /** Keys under which Navigation stores the arguments in the SavedStateHandle. */
        const val ARG_SERIES_ID = "seriesId"
        const val ARG_EPISODE_ID = "episodeId"
    }
}

fun NavController.navigateToPlayer(
    seriesId: String,
    episodeId: String? = null,
) = navigate(PlayerRoute(seriesId, episodeId))

fun NavGraphBuilder.playerScreen(onBack: () -> Unit) {
    composable<PlayerRoute> {
        PlayerScreen(onBack = onBack)
    }
}
