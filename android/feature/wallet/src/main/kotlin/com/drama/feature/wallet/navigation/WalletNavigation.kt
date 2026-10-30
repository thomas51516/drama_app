package com.drama.feature.wallet.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.drama.feature.wallet.ShopScreen
import com.drama.feature.wallet.ShopTab
import com.drama.feature.wallet.WalletScreen
import kotlinx.serialization.Serializable

/** "Mon portefeuille" (M-32). */
@Serializable
data object WalletRoute

/** "Boutique" (M-30/M-31). [tab] = `coins` | `vip`; [missingCoins] > 0 shows "Il vous manque N pièces". */
@Serializable
data class ShopRoute(
    val tab: String = ShopTab.COINS.key,
    val missingCoins: Int = 0,
) {
    companion object {
        const val ARG_TAB = "tab"
        const val ARG_MISSING_COINS = "missingCoins"
    }
}

fun NavController.navigateToWallet() = navigate(WalletRoute)

fun NavController.navigateToShop(
    tab: ShopTab = ShopTab.COINS,
    missingCoins: Int = 0,
) = navigate(ShopRoute(tab.key, missingCoins))

fun NavGraphBuilder.walletScreen(
    onBack: () -> Unit,
    onOpenShop: () -> Unit,
) {
    composable<WalletRoute> {
        WalletScreen(onBack = onBack, onOpenShop = onOpenShop)
    }
}

fun NavGraphBuilder.shopScreen(
    onBack: () -> Unit,
    onOpenWallet: () -> Unit,
) {
    composable<ShopRoute> {
        ShopScreen(onBack = onBack, onOpenWallet = onOpenWallet)
    }
}
