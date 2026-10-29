package com.drama.domain.usecase

import com.drama.core.common.result.AppResult
import com.drama.domain.model.WatchProgress
import com.drama.domain.repository.PlaybackRepository

/** Local + server progress write. Negative positions (unknown) are ignored. */
fun interface ReportProgressUseCase {
    suspend operator fun invoke(progress: WatchProgress): AppResult<Unit>
}

class DefaultReportProgressUseCase(
    private val playbackRepository: PlaybackRepository,
) : ReportProgressUseCase {
    override suspend fun invoke(progress: WatchProgress): AppResult<Unit> {
        if (progress.positionMs < 0) return AppResult.Success(Unit)
        return playbackRepository.reportProgress(progress)
    }
}
