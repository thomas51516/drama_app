package com.drama.feature.notifications.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navDeepLink
import com.drama.domain.model.NotificationTarget
import com.drama.feature.notifications.NotificationsScreen
import kotlinx.serialization.Serializable

/** In-app notification history (M-54). Deep link `drama://notifications` (offer / reminder pushes). */
@Serializable
data object NotificationsRoute {
    const val DEEP_LINK = "drama://notifications"
}

fun NavController.navigateToNotifications() = navigate(NotificationsRoute)

/** [onOpenTarget] receives the routing target of a tapped notification (series, episode, help, ...). */
fun NavGraphBuilder.notificationsScreen(
    onBack: () -> Unit,
    onOpenTarget: (NotificationTarget) -> Unit,
) {
    composable<NotificationsRoute>(deepLinks = listOf(navDeepLink { uriPattern = NotificationsRoute.DEEP_LINK })) {
        NotificationsScreen(onBack = onBack, onOpenTarget = onOpenTarget)
    }
}
