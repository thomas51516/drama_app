package com.drama.data.di

import com.drama.domain.repository.BillingGateway
import com.drama.domain.repository.CatalogRepository
import com.drama.domain.repository.PlaybackRepository
import com.drama.domain.repository.ShopRepository
import com.drama.domain.repository.UnlockRepository
import com.drama.domain.repository.WatchHistoryRepository
import com.drama.domain.repository.WatchProgressRepository
import com.drama.domain.usecase.DefaultGetSeriesEpisodesUseCase
import com.drama.domain.usecase.DefaultGetSeriesUseCase
import com.drama.domain.usecase.DefaultObserveContinueWatchingUseCase
import com.drama.domain.usecase.DefaultObserveHomeUseCase
import com.drama.domain.usecase.DefaultObserveSeriesDetailUseCase
import com.drama.domain.usecase.DefaultPurchaseProductUseCase
import com.drama.domain.usecase.DefaultReportProgressUseCase
import com.drama.domain.usecase.DefaultRestorePurchasesUseCase
import com.drama.domain.usecase.DefaultStartPlaybackUseCase
import com.drama.domain.usecase.DefaultUnlockEpisodeUseCase
import com.drama.domain.usecase.GetSeriesEpisodesUseCase
import com.drama.domain.usecase.GetSeriesUseCase
import com.drama.domain.usecase.ObserveContinueWatchingUseCase
import com.drama.domain.usecase.ObserveHomeUseCase
import com.drama.domain.usecase.ObserveSeriesDetailUseCase
import com.drama.domain.usecase.PurchaseProductUseCase
import com.drama.domain.usecase.ReportProgressUseCase
import com.drama.domain.usecase.RestorePurchasesUseCase
import com.drama.domain.usecase.StartPlaybackUseCase
import com.drama.domain.usecase.UnlockEpisodeUseCase
import com.drama.domain.usecase.VerifyPurchase
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

    @Provides
    fun provideUnlockEpisode(unlocks: UnlockRepository): UnlockEpisodeUseCase = DefaultUnlockEpisodeUseCase(unlocks)

    @Provides
    fun provideVerifyPurchase(
        billing: BillingGateway,
        shop: ShopRepository,
    ): VerifyPurchase = VerifyPurchase(billing, shop)

    @Provides
    fun providePurchaseProduct(
        billing: BillingGateway,
        verify: VerifyPurchase,
    ): PurchaseProductUseCase = DefaultPurchaseProductUseCase(billing, verify)

    @Provides
    fun provideRestorePurchases(
        billing: BillingGateway,
        verify: VerifyPurchase,
    ): RestorePurchasesUseCase = DefaultRestorePurchasesUseCase(billing, verify)
}
