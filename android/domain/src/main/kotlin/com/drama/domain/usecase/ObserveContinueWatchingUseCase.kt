package com.drama.domain.usecase

import com.drama.core.common.result.getOrNull
import com.drama.domain.model.ContinueWatchingItem
import com.drama.domain.repository.CatalogRepository
import com.drama.domain.repository.WatchHistoryRepository
import com.drama.domain.repository.WatchProgressRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Local "continue watching" row (M-01), newest first: the watch history joined with the per-episode
 * progress and the cached series. Series missing from the cache are skipped rather than fetched one by
 * one; the server row (CONTINUE_WATCHING) completes it when the account is synced.
 */
fun interface ObserveContinueWatchingUseCase {
    operator fun invoke(limit: Int): Flow<List<ContinueWatchingItem>>
}

class DefaultObserveContinueWatchingUseCase(
    private val history: WatchHistoryRepository,
    private val progress: WatchProgressRepository,
    private val catalog: CatalogRepository,
) : ObserveContinueWatchingUseCase {
    override fun invoke(limit: Int): Flow<List<ContinueWatchingItem>> =
        history.observeRecent(limit).map { entries ->
            entries.mapNotNull { entry ->
                val series = catalog.getSeries(entry.seriesId).getOrNull() ?: return@mapNotNull null
                val saved = progress.get(entry.episodeId)
                ContinueWatchingItem(
                    series = series,
                    episodeId = entry.episodeId,
                    episodeIndex = entry.episodeIndex,
                    positionMs = saved?.positionMs ?: entry.positionMs,
                    durationMs = saved?.durationMs ?: 0L,
                    completed = saved?.completed ?: false,
                    lastWatchedAtEpochMs = entry.lastWatchedAtEpochMs,
                )
            }
        }
}
