package com.drama.app.navigation

import androidx.annotation.StringRes
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import androidx.navigation.NavGraph.Companion.findStartDestination
import com.drama.app.R
import com.drama.feature.account.navigation.AccountRoute
import com.drama.feature.feed.navigation.FeedRoute
import com.drama.feature.home.navigation.HomeRoute
import com.drama.feature.mylist.navigation.MyListRoute

/** Bottom navigation tabs: Accueil (M-01), Pour vous (M-02), Ma liste (M-16), Profil (M-50..M-52). */
enum class TopLevelTab(
    val route: Any,
    @StringRes val label: Int,
    val icon: ImageVector,
) {
    HOME(HomeRoute, R.string.tab_home, Icons.Default.Home),
    FOR_YOU(FeedRoute, R.string.tab_for_you, Icons.Default.PlayArrow),
    MY_LIST(MyListRoute, R.string.tab_my_list, Icons.Default.Favorite),
    PROFILE(AccountRoute, R.string.tab_profile, Icons.Default.Person),
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
            val label = stringResource(tab.label)
            NavigationBarItem(
                selected = tab == current,
                onClick = { onSelect(tab) },
                // The item already announces the label: no duplicate description on the icon (TalkBack).
                icon = { Icon(tab.icon, contentDescription = null) },
                label = { Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1) },
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
