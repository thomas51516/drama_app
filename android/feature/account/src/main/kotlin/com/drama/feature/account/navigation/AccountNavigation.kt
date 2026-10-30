package com.drama.feature.account.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.drama.feature.account.AccountScreen
import kotlinx.serialization.Serializable

@Serializable
data object AccountRoute

fun NavController.navigateToAccount() = navigate(AccountRoute)

/**
 * [googleWebClientId] comes from `BuildConfig.GOOGLE_WEB_CLIENT_ID`; empty disables the Google option.
 * [onOpenHelp] / [onOpenNotifications] open the help centre (M-53) and the notification history (M-54).
 */
fun NavGraphBuilder.accountScreen(
    googleWebClientId: String,
    onOpenHelp: () -> Unit,
    onOpenNotifications: () -> Unit,
) {
    composable<AccountRoute> {
        AccountScreen(
            googleWebClientId = googleWebClientId,
            onOpenHelp = onOpenHelp,
            onOpenNotifications = onOpenNotifications,
        )
    }
}
