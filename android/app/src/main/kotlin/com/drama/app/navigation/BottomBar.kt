package com.drama.app.navigation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.navigation.NavController
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.drama.core.ui.theme.DramaSpacing
import com.drama.feature.account.navigation.AccountRoute
import com.drama.feature.home.navigation.HomeRoute
import kotlinx.serialization.Serializable

@Serializable
data object ForYouRoute

@Serializable
data object MyListRoute

/** Bottom navigation tabs. "Pour vous" (M-02) and "Ma liste" (M-16) are placeholders until sprint 4. */
enum class TopLevelTab(
    val route: Any,
    val label: String,
    val icon: ImageVector,
) {
    HOME(HomeRoute, "Accueil", Icons.Default.Home),
    FOR_YOU(ForYouRoute, "Pour vous", Icons.Default.PlayArrow),
    MY_LIST(MyListRoute, "Ma liste", Icons.Default.Favorite),
    PROFILE(AccountRoute, "Profil", Icons.Default.Person),
}

@Composable
fun DramaBottomBar(
    current: TopLevelTab,
    onSelect: (TopLevelTab) -> Unit,
) {
    NavigationBar(
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
        tonalElevation = 0.dp,
    ) {
        TopLevelTab.entries.forEach { tab ->
            NavigationBarItem(
                selected = tab == current,
                onClick = { onSelect(tab) },
                icon = { Icon(tab.icon, contentDescription = tab.label) },
                label = { Text(tab.label, style = MaterialTheme.typography.labelSmall) },
                colors =
                    NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.primary,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
            )
        }
    }
}

/** Standard tab switch: single top, state saved/restored per tab, back pops to Home. */
fun NavController.navigateToTab(tab: TopLevelTab) {
    navigate(tab.route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

fun NavGraphBuilder.forYouPlaceholderScreen() {
    composable<ForYouRoute> {
        PlaceholderScreen(title = "Pour vous", body = "Le flux vertical de découverte arrive au sprint 4 (M-02).")
    }
}

fun NavGraphBuilder.myListPlaceholderScreen() {
    composable<MyListRoute> {
        PlaceholderScreen(title = "Ma liste", body = "Vos séries favorites apparaîtront ici (M-16, sprint 4).")
    }
}

@Composable
private fun PlaceholderScreen(
    title: String,
    body: String,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .padding(DramaSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(DramaSpacing.md, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onBackground)
        Text(
            text = body,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

private val Int.dp get() =
    androidx.compose.ui.unit
        .Dp(this.toFloat())
