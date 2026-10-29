package com.drama.data.di

import com.drama.domain.repository.CatalogRepository
import com.drama.domain.repository.PlaybackRepository
import com.drama.domain.repository.WatchHistoryRepository
import com.drama.domain.repository.WatchProgressRepository
import com.drama.domain.usecase.DefaultGetSeriesEpisodesUseCase
import com.drama.domain.usecase.DefaultGetSeriesUseCase
import com.drama.domain.usecase.DefaultObserveContinueWatchingUseCase
import com.drama.domain.usecase.DefaultObserveHomeUseCase
import com.drama.domain.usecase.DefaultObserveSeriesDetailUseCase
import com.drama.domain.usecase.DefaultReportProgressUseCase
import com.drama.domain.usecase.DefaultStartPlaybackUseCase
import com.drama.domain.usecase.GetSeriesEpisodesUseCase
import com.drama.domain.usecase.GetSeriesUseCase
import com.drama.domain.usecase.ObserveContinueWatchingUseCase
import com.drama.domain.usecase.ObserveHomeUseCase
import com.drama.domain.usecase.ObserveSeriesDetailUseCase
import com.drama.domain.usecase.ReportProgressUseCase
import com.drama.domain.usecase.StartPlaybackUseCase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/** :domain is a pure Kotlin module with no DI annotations, so its use cases are wired here. */
@Module
@InstallIn(SingletonComponent::class)
object UseCaseModule {
    @Provides
    fun provideGetSeriesEpisodes(repository: CatalogRepository): GetSeriesEpisodesUseCase =
        DefaultGetSeriesEpisodesUseCase(repository)

    @Provides
    fun provideGetSeries(repository: CatalogRepository): GetSeriesUseCase = DefaultGetSeriesUseCase(repository)

    @Provides
    fun provideObserveHome(repository: CatalogRepository): ObserveHomeUseCase = DefaultObserveHomeUseCase(repository)

    @Provides
    fun provideObserveContinueWatching(
        history: WatchHistoryRepository,
        progress: WatchProgressRepository,
        catalog: CatalogRepository,
    ): ObserveContinueWatchingUseCase = DefaultObserveContinueWatchingUseCase(history, progress, catalog)

    @Provides
    fun provideObserveSeriesDetail(
        catalog: CatalogRepository,
        history: WatchHistoryRepository,
        progress: WatchProgressRepository,
    ): ObserveSeriesDetailUseCase = DefaultObserveSeriesDetailUseCase(catalog, history, progress)

    @Provides
    fun provideStartPlayback(
        playback: PlaybackRepository,
        progress: WatchProgressRepository,
    ): StartPlaybackUseCase = DefaultStartPlaybackUseCase(playback, progress)

    @Provides
    fun provideReportProgress(playback: PlaybackRepository): ReportProgressUseCase =
        DefaultReportProgressUseCase(playback)
}
