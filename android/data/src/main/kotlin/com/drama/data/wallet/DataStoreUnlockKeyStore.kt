package com.drama.data.wallet

import com.drama.core.database.preferences.UserPreferencesDataSource
import com.drama.domain.repository.UnlockKeyStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/** Unlock idempotency keys in the `user_preferences` DataStore, one per `userId/episodeId` until success. */
@Singleton
class DataStoreUnlockKeyStore
    @Inject
    constructor(
        private val preferences: UserPreferencesDataSource,
    ) : UnlockKeyStore {
        private val mutex = Mutex()

        override suspend fun getOrCreate(
            userId: String,
            episodeId: String,
            generate: () -> String,
        ): String =
            mutex.withLock {
                val entry = entry(userId, episodeId)
                preferences.preferences.first().unlockKeys[entry]
                    ?: generate().also { preferences.setUnlockKey(entry, it) }
            }

        override suspend fun clear(
            userId: String,
            episodeId: String,
        ) {
            mutex.withLock { preferences.setUnlockKey(entry(userId, episodeId), null) }
        }

        private fun entry(
            userId: String,
            episodeId: String,
        ) = "$userId/$episodeId"
    }
