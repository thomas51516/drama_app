package com.drama.feature.series.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.toRoute
import com.drama.feature.series.SeriesScreen
import kotlinx.serialization.Serializable

@Serializable
data class SeriesRoute(
    val seriesId: String,
)

fun NavController.navigateToSeries(seriesId: String) = navigate(SeriesRoute(seriesId))

fun NavGraphBuilder.seriesScreen(onPlay: (seriesId: String) -> Unit) {
    composable<SeriesRoute> { backStackEntry ->
        val route = backStackEntry.toRoute<SeriesRoute>()
        SeriesScreen(seriesId = route.seriesId, onPlay = { onPlay(route.seriesId) })
    }
}
