package com.drama.domain.usecase

import com.drama.core.common.result.AppError
import com.drama.core.common.result.Resource
import com.drama.domain.model.Episode
import com.drama.domain.model.ResumeTarget
import com.drama.domain.model.Series
import com.drama.domain.repository.CatalogRepository
import com.drama.domain.repository.WatchHistoryRepository
import com.drama.domain.repository.WatchProgressRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

/** Everything the series sheet (M-10) shows, refreshed together: series, episodes and the resume target. */
data class SeriesDetail(
    val series: Series?,
    val episodes: List<Episode>,
    val resumeTarget: ResumeTarget?,
    val isRefreshing: Boolean,
    val error: AppError?,
) {
    val hasContent: Boolean get() = series != null
}

fun interface ObserveSeriesDetailUseCase {
    operator fun invoke(seriesId: String): Flow<SeriesDetail>
}

class DefaultObserveSeriesDetailUseCase(
    private val catalog: CatalogRepository,
    private val history: WatchHistoryRepository,
    private val progress: WatchProgressRepository,
) : ObserveSeriesDetailUseCase {
    override fun invoke(seriesId: String): Flow<SeriesDetail> =
        combine(
            catalog.observeSeries(seriesId),
            catalog.observeEpisodes(seriesId),
            history.observeForSeries(seriesId),
            progress.observeForSeries(seriesId),
        ) { series, episodes, lastWatched, progressList ->
            val episodeList = episodes.data.orEmpty().sortedBy { it.index }
            val lastProgress =
                lastWatched?.let { entry ->
                    progressList.firstOrNull { it.episodeId == entry.episodeId }
                }
            SeriesDetail(
                series = series.data,
                episodes = episodeList,
                resumeTarget = ResumeTarget.resolve(episodeList, lastWatched, lastProgress),
                isRefreshing = series is Resource.Loading || episodes is Resource.Loading,
                error = (series as? Resource.Error)?.error ?: (episodes as? Resource.Error)?.error,
            )
        }
}
