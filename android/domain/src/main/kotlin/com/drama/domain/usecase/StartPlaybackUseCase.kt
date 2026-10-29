package com.drama.domain.usecase

import com.drama.core.common.result.AppResult
import com.drama.domain.model.PlaySession
import com.drama.domain.model.WatchProgress
import com.drama.domain.repository.PlaybackRepository
import com.drama.domain.repository.WatchProgressRepository

/** Resolves the stream for an episode and the position to resume from (server wins over local, M-15). */
fun interface StartPlaybackUseCase {
    suspend operator fun invoke(episodeId: String): AppResult<PlaybackStart>
}

data class PlaybackStart(
    val session: PlaySession,
    /** Position to seek to before playing; 0 for a fresh start. */
    val startPositionMs: Long,
) {
    val isResume: Boolean get() = startPositionMs > 0
}

class DefaultStartPlaybackUseCase(
    private val playbackRepository: PlaybackRepository,
    private val watchProgressRepository: WatchProgressRepository,
) : StartPlaybackUseCase {
    override suspend fun invoke(episodeId: String): AppResult<PlaybackStart> =
        when (val result = playbackRepository.startPlayback(episodeId)) {
            is AppResult.Failure -> result
            is AppResult.Success -> {
                val session = result.value
                val local = watchProgressRepository.get(episodeId)
                AppResult.Success(PlaybackStart(session, resolveStartPosition(session, local)))
            }
        }

    companion object {
        /** Positions within the last seconds of the episode restart from zero instead of replaying the credits. */
        private const val END_THRESHOLD_MS = 2_000L

        fun resolveStartPosition(
            session: PlaySession,
            local: WatchProgress?,
        ): Long {
            val candidate =
                when {
                    session.resumePositionMs > 0 -> session.resumePositionMs
                    local != null && !local.completed -> local.positionMs
                    else -> 0L
                }
            val duration = session.durationMs
            return if (duration > 0 && candidate >= duration - END_THRESHOLD_MS) 0L else candidate.coerceAtLeast(0L)
        }
    }
}
