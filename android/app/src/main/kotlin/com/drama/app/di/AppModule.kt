package com.drama.app.di

import android.content.Context
import com.drama.app.BuildConfig
import com.drama.app.analytics.FirebaseAnalyticsTracker
import com.drama.app.analytics.LogcatAnalyticsTracker
import com.drama.app.locale.AndroidDeviceLocale
import com.drama.app.locale.AppCompatLocaleController
import com.drama.app.logging.AndroidLogger
import com.drama.app.network.ConnectivityNetworkStatus
import com.drama.app.push.BuildConfigAppInfo
import com.drama.app.push.FirebasePushTokenProvider
import com.drama.app.remoteconfig.FirebaseRemoteConfigRepository
import com.drama.app.remoteconfig.StaticRemoteConfigRepository
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.auth.AuthConfig
import com.drama.core.common.coroutines.DefaultDispatcherProvider
import com.drama.core.common.coroutines.DispatcherProvider
import com.drama.core.common.locale.AppLocaleController
import com.drama.core.common.locale.DeviceLocaleProvider
import com.drama.core.common.logging.Logger
import com.drama.core.common.network.NetworkStatusProvider
import com.drama.core.common.push.AppInfoProvider
import com.drama.core.common.push.PushTokenProvider
import com.drama.core.common.share.HostShareLinkProvider
import com.drama.core.common.share.ShareLinkProvider
import com.drama.core.common.time.Clock
import com.drama.core.common.time.SystemClock
import com.drama.domain.model.RemoteFlags
import com.drama.domain.repository.RemoteConfigRepository
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

    /** Language selector of the settings (M-52): per-app locales via AppCompat. */
    @Provides
    @Singleton
    fun provideAppLocaleController(impl: AppCompatLocaleController): AppLocaleController = impl

    /** Share links (M-16) on the App Links host; the `drama://` scheme stays as fallback. */
    @Provides
    @Singleton
    fun provideShareLinkProvider(): ShareLinkProvider = HostShareLinkProvider(BuildConfig.APP_LINKS_HOST)

    /** FCM token for `PUT /me/devices/push` (M-54). */
    @Provides
    @Singleton
    fun providePushTokenProvider(impl: FirebasePushTokenProvider): PushTokenProvider = impl

    @Provides
    @Singleton
    fun provideAppInfo(): AppInfoProvider = BuildConfigAppInfo()

    @Provides
    @Singleton
    fun provideAuthConfig(): AuthConfig = AuthConfig(googleWebClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID)

    /** Metered-network signal for the data saver (M-17). */
    @Provides
    @Singleton
    fun provideNetworkStatus(impl: ConnectivityNetworkStatus): NetworkStatusProvider = impl

    /**
     * Remote Config (M-34): Firebase when configured, otherwise the BuildConfig defaults
     * (`-PdramaMobileMoneyLinkEnabled`, `-PdramaRechargeUrl`) so the link can be exercised on a dev build.
     */
    @Provides
    @Singleton
    fun provideRemoteConfig(
        @ApplicationContext context: Context,
        logger: Logger,
    ): RemoteConfigRepository {
        val defaults =
            RemoteFlags(
                mobileMoneyLinkEnabled = BuildConfig.MOBILE_MONEY_LINK_ENABLED_DEFAULT,
                rechargeUrl = BuildConfig.RECHARGE_URL_DEFAULT,
            )
        val firebase =
            if (BuildConfig.FIREBASE_CONFIGURED) {
                FirebaseRemoteConfigRepository.createIfAvailable(context, defaults, BuildConfig.DEBUG, logger)
            } else {
                null
            }
        return firebase ?: StaticRemoteConfigRepository(defaults)
    }

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
