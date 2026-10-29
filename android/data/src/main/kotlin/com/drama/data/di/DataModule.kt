package com.drama.data.di

import com.drama.core.network.BuildConfig
import com.drama.core.network.auth.DeviceIdProvider
import com.drama.core.network.auth.SessionStore
import com.drama.data.fake.FakeCatalogRepository
import com.drama.data.fake.FakePlaybackRepository
import com.drama.data.local.CatalogLocalDataSource
import com.drama.data.local.RoomCatalogLocalDataSource
import com.drama.data.repository.DefaultSessionRepository
import com.drama.data.repository.RemoteCatalogRepository
import com.drama.data.repository.RemotePlaybackRepository
import com.drama.data.repository.RoomWatchHistoryRepository
import com.drama.data.repository.RoomWatchProgressRepository
import com.drama.data.session.DataStoreSessionStore
import com.drama.data.session.InstallationDeviceIdProvider
import com.drama.domain.repository.CatalogRepository
import com.drama.domain.repository.PlaybackRepository
import com.drama.domain.repository.SessionRepository
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
    abstract fun bindDeviceIdProvider(impl: InstallationDeviceIdProvider): DeviceIdProvider

    @Binds
    @Singleton
    abstract fun bindCatalogLocalDataSource(impl: RoomCatalogLocalDataSource): CatalogLocalDataSource

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
