package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.PlaySession
import com.drama.domain.model.WatchProgress

interface PlaybackRepository {
    /** `POST /episodes/{id}/play`. Fails with `AppError.Locked` when the viewer has no entitlement. */
    suspend fun startPlayback(episodeId: String): AppResult<PlaySession>

    /**
     * Persists the position locally (progress + history) and pushes it to the server (`PUT /progress`).
     * The local write always happens; the result reflects the server call.
     */
    suspend fun reportProgress(progress: WatchProgress): AppResult<Unit>
}
