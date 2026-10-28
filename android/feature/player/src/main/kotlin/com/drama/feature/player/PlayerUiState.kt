package com.drama.feature.player

import com.drama.domain.model.Episode

data class StartupMetric(
    val index: Int,
    val startupMs: Long,
    val readyMs: Long?,
    val wasPreloaded: Boolean,
)

data class PlayerUiState(
    val isLoading: Boolean = true,
    val episodes: List<Episode> = emptyList(),
    val currentIndex: Int = 0,
    val isPlaying: Boolean = false,
    val preloadedIndices: Set<Int> = emptySet(),
    val startupMetrics: List<StartupMetric> = emptyList(),
    val errorMessage: String? = null,
) {
    val currentEpisode: Episode? get() = episodes.getOrNull(currentIndex)
    val lastStartup: StartupMetric? get() = startupMetrics.lastOrNull { it.index == currentIndex }
}
