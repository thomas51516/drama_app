package com.drama.feature.feed.navigation

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.drama.feature.feed.FeedScreen
import kotlinx.serialization.Serializable

/** "Pour vous" tab (M-02). */
@Serializable
data object FeedRoute

fun NavGraphBuilder.feedScreen(
    onOpenSeries: (seriesId: String) -> Unit,
    onWatch: (seriesId: String, episodeId: String) -> Unit,
) {
    composable<FeedRoute> {
        FeedScreen(onOpenSeries = onOpenSeries, onWatch = onWatch)
    }
}
