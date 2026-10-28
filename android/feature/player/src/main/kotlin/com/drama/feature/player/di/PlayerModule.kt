package com.drama.feature.player.di

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import com.drama.core.common.logging.Logger
import com.drama.feature.player.engine.ExoPlaybackEngine
import com.drama.feature.player.engine.PlaybackEngineFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.File
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
@OptIn(UnstableApi::class)
object PlayerModule {
    private const val CACHE_DIR = "media"
    private const val CACHE_SIZE_BYTES = 256L * 1024 * 1024

    /** One SimpleCache per directory per process: must be a singleton or Media3 throws. */
    @Provides
    @Singleton
    fun provideMediaCache(
        @ApplicationContext context: Context,
    ): Cache =
        SimpleCache(
            File(context.cacheDir, CACHE_DIR),
            LeastRecentlyUsedCacheEvictor(CACHE_SIZE_BYTES),
            StandaloneDatabaseProvider(context),
        )

    @Provides
    fun providePlaybackEngineFactory(
        @ApplicationContext context: Context,
        cache: Cache,
        logger: Logger,
    ): PlaybackEngineFactory = PlaybackEngineFactory { ExoPlaybackEngine(context, cache, logger) }
}
