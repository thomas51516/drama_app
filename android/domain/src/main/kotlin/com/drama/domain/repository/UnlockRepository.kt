package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.UnlockAllQuote
import com.drama.domain.model.UnlockAllResult
import com.drama.domain.model.UnlockResult

/**
 * Episode unlocks (M-21). The unlock call is idempotent: one client UUID per (user, episode) is kept until the
 * server answers successfully, so a retry after a timeout can never debit twice.
 */
interface UnlockRepository {
    /** `POST /episodes/{id}/unlock`. Fails with `AppError.InsufficientCoins` (402) when the balance is too low. */
    suspend fun unlock(
        seriesId: String,
        episodeId: String,
    ): AppResult<UnlockResult>

    /** `GET /series/{id}/unlocks`: reconciles the cached episode statuses with the server. */
    suspend fun refreshUnlocks(seriesId: String): AppResult<Set<String>>

    /** `GET /series/{id}/unlock-all/quote` (M-23): discounted price of the still-locked episodes. */
    suspend fun quoteUnlockAll(seriesId: String): AppResult<UnlockAllQuote>

    /**
     * `POST /series/{id}/unlock-all` (M-23), idempotent like [unlock] (one key per (user, series) until the server
     * answered). Fails with `AppError.InsufficientCoins` (402); success flips every returned episode to unlocked.
     */
    suspend fun unlockAll(seriesId: String): AppResult<UnlockAllResult>
}

/** Persistence of the idempotency keys, implemented over DataStore in :data. */
interface UnlockKeyStore {
    suspend fun getOrCreate(
        userId: String,
        episodeId: String,
        generate: () -> String,
    ): String

    suspend fun clear(
        userId: String,
        episodeId: String,
    )
}
