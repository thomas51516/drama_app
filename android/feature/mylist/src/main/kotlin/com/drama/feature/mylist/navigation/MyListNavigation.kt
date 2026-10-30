package com.drama.feature.mylist.navigation

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.drama.feature.mylist.MyListScreen
import kotlinx.serialization.Serializable

/** "Ma liste" tab (M-16). */
@Serializable
data object MyListRoute

fun NavGraphBuilder.myListScreen(onOpenSeries: (seriesId: String) -> Unit) {
    composable<MyListRoute> {
        MyListScreen(onOpenSeries = onOpenSeries)
    }
}
