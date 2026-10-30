package com.drama.core.network.di

import com.drama.core.common.logging.Logger
import com.drama.core.network.BuildConfig
import com.drama.core.network.api.AccountAuthApi
import com.drama.core.network.api.AuthApi
import com.drama.core.network.api.CatalogApi
import com.drama.core.network.api.EventsApi
import com.drama.core.network.api.HelpApi
import com.drama.core.network.api.NotificationsApi
import com.drama.core.network.api.PlaybackApi
import com.drama.core.network.api.UserApi
import com.drama.core.network.auth.AuthInterceptor
import com.drama.core.network.auth.TokenAuthenticator
import com.drama.core.network.locale.LocaleHeadersInterceptor
import com.drama.core.network.retry.RetryInterceptor
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Qualifier
import javax.inject.Singleton

/** Client without bearer/authenticator: used for the `/auth` endpoints so a refresh can never trigger another refresh. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class BareClient

/**
 * Client with the bearer but without the authenticator: sign-in / linking endpoints (M-50). The guest token
 * identifies the account to convert; a 401 (`INVALID_CREDENTIALS`) must surface, not rotate the guest tokens.
 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class LinkClient

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    private const val CONNECT_TIMEOUT_S = 10L
    private const val READ_TIMEOUT_S = 20L
    private const val WRITE_TIMEOUT_S = 20L
    private const val CALL_TIMEOUT_S = 45L
    private const val HTTP_LOG_TAG = "Http"

    @Provides
    @Singleton
    fun provideJson(): Json =
        Json {
            ignoreUnknownKeys = true
            explicitNulls = false
            // Defaults such as `platform = "android"` or an all-true preference set must reach the server.
            encodeDefaults = true
            coerceInputValues = true
            isLenient = true
        }

    /** Debug builds log request lines and status codes under the `Http` tag (`adb logcat -s Http`). */
    @Provides
    @Singleton
    @BareClient
    fun provideBareOkHttpClient(
        logger: Logger,
        localeHeaders: LocaleHeadersInterceptor,
    ): OkHttpClient {
        val logging =
            HttpLoggingInterceptor { message -> logger.i(HTTP_LOG_TAG, message) }.apply {
                level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
                redactHeader("Authorization")
            }
        return OkHttpClient
            .Builder()
            .connectTimeout(CONNECT_TIMEOUT_S, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT_S, TimeUnit.SECONDS)
            .writeTimeout(WRITE_TIMEOUT_S, TimeUnit.SECONDS)
            .callTimeout(CALL_TIMEOUT_S, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .addInterceptor(localeHeaders)
            .addInterceptor(logging)
            .build()
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(
        @BareClient bare: OkHttpClient,
        authInterceptor: AuthInterceptor,
        tokenAuthenticator: TokenAuthenticator,
        logger: Logger,
    ): OkHttpClient =
        bare
            .newBuilder()
            // Interceptors run in order: retry wraps auth so a retried GET gets a fresh bearer.
            .addInterceptor(RetryInterceptor(logger))
            .addInterceptor(authInterceptor)
            .authenticator(tokenAuthenticator)
            .build()

    @Provides
    @Singleton
    @LinkClient
    fun provideLinkOkHttpClient(
        @BareClient bare: OkHttpClient,
        authInterceptor: AuthInterceptor,
    ): OkHttpClient =
        bare
            .newBuilder()
            .addInterceptor(authInterceptor)
            .build()

    @Provides
    @Singleton
    @LinkClient
    fun provideLinkRetrofit(
        @LinkClient client: OkHttpClient,
        json: Json,
    ): Retrofit = retrofit(client, json)

    @Provides
    @Singleton
    fun provideAccountAuthApi(
        @LinkClient retrofit: Retrofit,
    ): AccountAuthApi = retrofit.create(AccountAuthApi::class.java)

    @Provides
    @Singleton
    fun provideUserApi(retrofit: Retrofit): UserApi = retrofit.create(UserApi::class.java)

    @Provides
    @Singleton
    @BareClient
    fun provideBareRetrofit(
        @BareClient client: OkHttpClient,
        json: Json,
    ): Retrofit = retrofit(client, json)

    @Provides
    @Singleton
    fun provideRetrofit(
        client: OkHttpClient,
        json: Json,
    ): Retrofit = retrofit(client, json)

    @Provides
    @Singleton
    fun provideAuthApi(
        @BareClient retrofit: Retrofit,
    ): AuthApi = retrofit.create(AuthApi::class.java)

    @Provides
    @Singleton
    fun provideCatalogApi(retrofit: Retrofit): CatalogApi = retrofit.create(CatalogApi::class.java)

    @Provides
    @Singleton
    fun providePlaybackApi(retrofit: Retrofit): PlaybackApi = retrofit.create(PlaybackApi::class.java)

    @Provides
    @Singleton
    fun provideHelpApi(retrofit: Retrofit): HelpApi = retrofit.create(HelpApi::class.java)

    @Provides
    @Singleton
    fun provideNotificationsApi(retrofit: Retrofit): NotificationsApi = retrofit.create(NotificationsApi::class.java)

    @Provides
    @Singleton
    fun provideEventsApi(retrofit: Retrofit): EventsApi = retrofit.create(EventsApi::class.java)

    private fun retrofit(
        client: OkHttpClient,
        json: Json,
    ): Retrofit =
        Retrofit
            .Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
}
