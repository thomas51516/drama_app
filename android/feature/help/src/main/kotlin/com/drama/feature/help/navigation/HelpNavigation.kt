package com.drama.feature.help.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navDeepLink
import com.drama.feature.help.HelpScreen
import kotlinx.serialization.Serializable

/** Help centre (M-53): FAQ, contact form, own tickets. Deep link `drama://help` (support reply push). */
@Serializable
data object HelpRoute {
    const val DEEP_LINK = "drama://help"
}

fun NavController.navigateToHelp() = navigate(HelpRoute)

fun NavGraphBuilder.helpScreen(onBack: () -> Unit) {
    composable<HelpRoute>(deepLinks = listOf(navDeepLink { uriPattern = HelpRoute.DEEP_LINK })) {
        HelpScreen(onBack = onBack)
    }
}
