package com.drama.domain.usecase

import com.drama.core.common.result.AppResult
import com.drama.domain.model.Episode
import com.drama.domain.model.UnlockResult
import com.drama.domain.repository.UnlockRepository

/** Unlocks [episode] with coins (M-21); the repository guarantees idempotency and refreshes the local statuses. */
fun interface UnlockEpisodeUseCase {
    suspend operator fun invoke(episode: Episode): AppResult<UnlockResult>
}

class DefaultUnlockEpisodeUseCase(
    private val unlocks: UnlockRepository,
) : UnlockEpisodeUseCase {
    override suspend fun invoke(episode: Episode): AppResult<UnlockResult> =
        unlocks.unlock(episode.seriesId, episode.id)
}

/** Pure decisions of the paywall (M-20), shared by the view model and its tests. */
object PaywallRules {
    fun canUnlock(
        balance: Int?,
        cost: Int,
    ): Boolean = balance != null && balance >= cost && cost >= 0

    /** Coins short of [cost] for a shop message ("Il vous manque N pièces"); 0 when the balance suffices. */
    fun missingCoins(
        balance: Int?,
        cost: Int,
    ): Int = (cost - (balance ?: 0)).coerceAtLeast(0)
}
