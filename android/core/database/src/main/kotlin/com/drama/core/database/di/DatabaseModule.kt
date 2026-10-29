package com.drama.core.database.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import androidx.room.Room
import com.drama.core.database.DramaDatabase
import com.drama.core.database.dao.CatalogDao
import com.drama.core.database.dao.WatchHistoryDao
import com.drama.core.database.dao.WatchProgressDao
import com.drama.core.database.security.AndroidKeystoreTokenCipher
import com.drama.core.database.security.TokenCipher
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Qualifier
import javax.inject.Singleton

/** DataStore holding the session tokens and installation id (separate file from user preferences). */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class SessionPreferences

private val Context.userPreferencesStore: DataStore<Preferences> by preferencesDataStore(name = "user_preferences")
private val Context.sessionStore: DataStore<Preferences> by preferencesDataStore(name = "session")

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides
    @Singleton
    fun provideDatabase(
        @ApplicationContext context: Context,
    ): DramaDatabase =
        Room
            .databaseBuilder(context, DramaDatabase::class.java, DramaDatabase.NAME)
            // Everything stored locally is a cache or re-syncable progress: losing it beats crashing on a
            // schema we failed to migrate. Real migrations are still declared (see DramaDatabase).
            .fallbackToDestructiveMigration(dropAllTables = true)
            .build()

    @Provides
    fun provideWatchProgressDao(database: DramaDatabase): WatchProgressDao = database.watchProgressDao()

    @Provides
    fun provideWatchHistoryDao(database: DramaDatabase): WatchHistoryDao = database.watchHistoryDao()

    @Provides
    fun provideCatalogDao(database: DramaDatabase): CatalogDao = database.catalogDao()

    @Provides
    @Singleton
    fun providePreferencesDataStore(
        @ApplicationContext context: Context,
    ): DataStore<Preferences> = context.userPreferencesStore

    @Provides
    @Singleton
    @SessionPreferences
    fun provideSessionDataStore(
        @ApplicationContext context: Context,
    ): DataStore<Preferences> = context.sessionStore

    @Provides
    @Singleton
    fun provideTokenCipher(): TokenCipher = AndroidKeystoreTokenCipher()
}
