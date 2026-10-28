package com.drama.feature.account.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.drama.feature.account.AccountScreen
import kotlinx.serialization.Serializable

@Serializable
data object AccountRoute

fun NavController.navigateToAccount() = navigate(AccountRoute)

fun NavGraphBuilder.accountScreen() {
    composable<AccountRoute> {
        AccountScreen()
    }
}
