package com.drama.app.di

import com.drama.app.logging.AndroidLogger
import com.drama.core.common.coroutines.DefaultDispatcherProvider
import com.drama.core.common.coroutines.DispatcherProvider
import com.drama.core.common.logging.Logger
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/** Bindings for the pure-Kotlin :core:common abstractions (they cannot carry Hilt annotations). */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Singleton
    fun provideLogger(logger: AndroidLogger): Logger = logger

    @Provides
    @Singleton
    fun provideDispatcherProvider(): DispatcherProvider = DefaultDispatcherProvider()
}
