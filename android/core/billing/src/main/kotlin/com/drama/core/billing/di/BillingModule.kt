package com.drama.core.billing.di

import com.drama.core.billing.BuildConfig
import com.drama.core.billing.FakeBillingGateway
import com.drama.core.billing.PlayBillingGateway
import com.drama.domain.repository.BillingGateway
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Provider
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object BillingModule {
    /** `FAKE_BILLING` (debug / benchmark) = simulated store; release = Google Play (S07-A2-01). */
    @Provides
    @Singleton
    fun provideBillingGateway(
        fake: Provider<FakeBillingGateway>,
        play: Provider<PlayBillingGateway>,
    ): BillingGateway = if (BuildConfig.FAKE_BILLING) fake.get() else play.get()

    @Provides
    @Singleton
    fun provideBillingConfig(): BillingConfig = BillingConfig(isFake = BuildConfig.FAKE_BILLING)
}

/** Tells the UI whether the simulated store is active (debug banner on the shop screen). */
data class BillingConfig(
    val isFake: Boolean,
)
