package com.drama.domain.usecase

import com.drama.domain.model.WatchProgress
import com.drama.domain.repository.WatchProgressRepository

fun interface SaveWatchProgressUseCase {
    suspend operator fun invoke(progress: WatchProgress)
}

class DefaultSaveWatchProgressUseCase(
    private val repository: WatchProgressRepository,
) : SaveWatchProgressUseCase {
    override suspend fun invoke(progress: WatchProgress) {
        if (progress.positionMs < 0) return
        repository.save(progress)
    }
}
