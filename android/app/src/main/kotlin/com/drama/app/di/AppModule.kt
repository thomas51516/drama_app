package com.drama.app.di

import android.content.Context
import com.drama.app.BuildConfig
import com.drama.app.analytics.FirebaseAnalyticsTracker
import com.drama.app.analytics.LogcatAnalyticsTracker
import com.drama.app.locale.AndroidDeviceLocale
import com.drama.app.logging.AndroidLogger
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.auth.AuthConfig
import com.drama.core.common.coroutines.DefaultDispatcherProvider
import com.drama.core.common.coroutines.DispatcherProvider
import com.drama.core.common.locale.DeviceLocaleProvider
import com.drama.core.common.logging.Logger
import com.drama.core.common.share.HostShareLinkProvider
import com.drama.core.common.share.ShareLinkProvider
import com.drama.core.common.time.Clock
import com.drama.core.common.time.SystemClock
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
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

    @Provides
    @Singleton
    fun provideClock(): Clock = SystemClock

    @Provides
    @Singleton
    fun provideDeviceLocale(impl: AndroidDeviceLocale): DeviceLocaleProvider = impl

    /** Share links (M-16) on the App Links host; the `drama://` scheme stays as fallback. */
    @Provides
    @Singleton
    fun provideShareLinkProvider(): ShareLinkProvider = HostShareLinkProvider(BuildConfig.APP_LINKS_HOST)

    @Provides
    @Singleton
    fun provideAuthConfig(): AuthConfig = AuthConfig(googleWebClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID)

    /** Firebase when google-services.json was present at build time and the SDK initialised; Logcat otherwise. */
    @Provides
    @Singleton
    fun provideAnalyticsTracker(
        @ApplicationContext context: Context,
        logger: Logger,
    ): AnalyticsTracker {
        val firebase =
            if (BuildConfig.FIREBASE_CONFIGURED) {
                FirebaseAnalyticsTracker.createIfAvailable(
                    context,
                    logger,
                )
            } else {
                null
            }
        return firebase ?: LogcatAnalyticsTracker(logger)
    }
}
