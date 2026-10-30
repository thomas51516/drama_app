package com.drama.feature.player.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navDeepLink
import com.drama.feature.player.ui.PlayerScreen
import kotlinx.serialization.Serializable

/** Player route. Deep link `drama://player/{seriesId}/{episodeId}` (new-episode push, M-54). */
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
        const val DEEP_LINK_BASE = "drama://player"
    }
}

fun NavController.navigateToPlayer(
    seriesId: String,
    episodeId: String? = null,
) = navigate(PlayerRoute(seriesId, episodeId))

/** [onOpenShop] receives the shop tab (`coins` | `vip`) and the coins missing for the unlock (0 when none). */
fun NavGraphBuilder.playerScreen(
    onBack: () -> Unit,
    onOpenShop: (tab: String, missingCoins: Int) -> Unit,
) {
    composable<PlayerRoute>(
        deepLinks = listOf(navDeepLink<PlayerRoute>(basePath = PlayerRoute.DEEP_LINK_BASE)),
    ) {
        PlayerScreen(onBack = onBack, onOpenShop = onOpenShop)
    }
}
