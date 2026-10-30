package com.drama.data.di

import com.drama.core.network.BuildConfig
import com.drama.core.network.auth.DeviceIdProvider
import com.drama.core.network.auth.SessionStore
import com.drama.data.fake.FakeCatalogRepository
import com.drama.data.fake.FakePlaybackRepository
import com.drama.data.local.CatalogLocalDataSource
import com.drama.data.local.RoomCatalogLocalDataSource
import com.drama.data.repository.DataStorePlayerSettingsRepository
import com.drama.data.repository.DefaultAccountRepository
import com.drama.data.repository.DefaultHelpRepository
import com.drama.data.repository.DefaultNotificationsRepository
import com.drama.data.repository.DefaultPushRepository
import com.drama.data.repository.DefaultSessionRepository
import com.drama.data.repository.DefaultShopRepository
import com.drama.data.repository.RemoteCatalogRepository
import com.drama.data.repository.RemoteEventsRepository
import com.drama.data.repository.RemoteFeedRepository
import com.drama.data.repository.RemotePlaybackRepository
import com.drama.data.repository.RemoteSearchRepository
import com.drama.data.repository.RemoteUnlockRepository
import com.drama.data.repository.RemoteWalletRepository
import com.drama.data.repository.RoomFavoritesRepository
import com.drama.data.repository.RoomWatchHistoryRepository
import com.drama.data.repository.RoomWatchProgressRepository
import com.drama.data.session.DataStoreSessionStore
import com.drama.data.session.InstallationDeviceIdProvider
import com.drama.data.wallet.DataStoreUnlockKeyStore
import com.drama.domain.repository.AccountRepository
import com.drama.domain.repository.CatalogRepository
import com.drama.domain.repository.EventsRepository
import com.drama.domain.repository.FavoritesRepository
import com.drama.domain.repository.FeedRepository
import com.drama.domain.repository.HelpRepository
import com.drama.domain.repository.NotificationsRepository
import com.drama.domain.repository.PlaybackRepository
import com.drama.domain.repository.PlayerSettingsRepository
import com.drama.domain.repository.PushRepository
import com.drama.domain.repository.SearchRepository
import com.drama.domain.repository.SessionRepository
import com.drama.domain.repository.ShopRepository
import com.drama.domain.repository.UnlockKeyStore
import com.drama.domain.repository.UnlockRepository
import com.drama.domain.repository.WalletRepository
import com.drama.domain.repository.WatchHistoryRepository
import com.drama.domain.repository.WatchProgressRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Provider
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class DataModule {
    @Binds
    @Singleton
    abstract fun bindWatchProgressRepository(impl: RoomWatchProgressRepository): WatchProgressRepository

    @Binds
    @Singleton
    abstract fun bindWatchHistoryRepository(impl: RoomWatchHistoryRepository): WatchHistoryRepository

    @Binds
    @Singleton
    abstract fun bindSessionRepository(impl: DefaultSessionRepository): SessionRepository

    @Binds
    @Singleton
    abstract fun bindSessionStore(impl: DataStoreSessionStore): SessionStore

    @Binds
    @Singleton
    abstract fun bindPlayerSettingsRepository(impl: DataStorePlayerSettingsRepository): PlayerSettingsRepository

    @Binds
    @Singleton
    abstract fun bindDeviceIdProvider(impl: InstallationDeviceIdProvider): DeviceIdProvider

    @Binds
    @Singleton
    abstract fun bindCatalogLocalDataSource(impl: RoomCatalogLocalDataSource): CatalogLocalDataSource

    @Binds
    @Singleton
    abstract fun bindFeedRepository(impl: RemoteFeedRepository): FeedRepository

    @Binds
    @Singleton
    abstract fun bindSearchRepository(impl: RemoteSearchRepository): SearchRepository

    @Binds
    @Singleton
    abstract fun bindFavoritesRepository(impl: RoomFavoritesRepository): FavoritesRepository

    @Binds
    @Singleton
    abstract fun bindAccountRepository(impl: DefaultAccountRepository): AccountRepository

    @Binds
    @Singleton
    abstract fun bindHelpRepository(impl: DefaultHelpRepository): HelpRepository

    @Binds
    @Singleton
    abstract fun bindNotificationsRepository(impl: DefaultNotificationsRepository): NotificationsRepository

    @Binds
    @Singleton
    abstract fun bindPushRepository(impl: DefaultPushRepository): PushRepository

    @Binds
    @Singleton
    abstract fun bindEventsRepository(impl: RemoteEventsRepository): EventsRepository

    @Binds
    @Singleton
    abstract fun bindWalletRepository(impl: RemoteWalletRepository): WalletRepository

    @Binds
    @Singleton
    abstract fun bindUnlockRepository(impl: RemoteUnlockRepository): UnlockRepository

    @Binds
    @Singleton
    abstract fun bindUnlockKeyStore(impl: DataStoreUnlockKeyStore): UnlockKeyStore

    @Binds
    @Singleton
    abstract fun bindShopRepository(impl: DefaultShopRepository): ShopRepository

    companion object {
        /** `-PdramaUseFakeCatalog=true` (debug) swaps in the Sprint 1 fake catalogue; the API otherwise. */
        @Provides
        @Singleton
        fun provideCatalogRepository(
            remote: Provider<RemoteCatalogRepository>,
            fake: Provider<FakeCatalogRepository>,
        ): CatalogRepository = if (BuildConfig.USE_FAKE_CATALOG) fake.get() else remote.get()

        @Provides
        @Singleton
        fun providePlaybackRepository(
            remote: Provider<RemotePlaybackRepository>,
            fake: Provider<FakePlaybackRepository>,
        ): PlaybackRepository = if (BuildConfig.USE_FAKE_CATALOG) fake.get() else remote.get()
    }
}
