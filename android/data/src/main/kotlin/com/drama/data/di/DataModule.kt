package com.drama.data.di

import com.drama.data.repository.FakeCatalogRepository
import com.drama.data.repository.RoomWatchProgressRepository
import com.drama.domain.repository.CatalogRepository
import com.drama.domain.repository.WatchProgressRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class DataModule {
    @Binds
    @Singleton
    abstract fun bindCatalogRepository(impl: FakeCatalogRepository): CatalogRepository

    @Binds
    @Singleton
    abstract fun bindWatchProgressRepository(impl: RoomWatchProgressRepository): WatchProgressRepository
}
