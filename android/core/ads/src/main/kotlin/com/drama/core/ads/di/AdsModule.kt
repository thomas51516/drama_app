package com.drama.core.ads.di

import com.drama.core.ads.AdMobAdGateway
import com.drama.core.ads.BuildConfig
import com.drama.core.ads.FakeAdGateway
import com.drama.domain.repository.AdGateway
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Provider
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AdsModule {
    /** `FAKE_ADS` (debug / benchmark) = simulated network; release = Google Mobile Ads (S08-A1-01). */
    @Provides
    @Singleton
    fun provideAdGateway(
        fake: Provider<FakeAdGateway>,
        admob: Provider<AdMobAdGateway>,
    ): AdGateway = if (BuildConfig.FAKE_ADS) fake.get() else admob.get()

    @Provides
    @Singleton
    fun provideAdsConfig(): AdsConfig = AdsConfig(isFake = BuildConfig.FAKE_ADS)
}

/** Tells the UI whether the simulated ad network is active (debug label on the simulated ad). */
data class AdsConfig(
    val isFake: Boolean,
)
