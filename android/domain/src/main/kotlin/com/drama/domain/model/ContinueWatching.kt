package com.drama.domain.model

/** Local "continue watching" entry: the last episode watched in a series and how far (M-01, M-15). */
data class ContinueWatchingItem(
    val series: Series,
    val episodeId: String,
    val episodeIndex: Int,
    val positionMs: Long,
    val durationMs: Long,
    val completed: Boolean,
    val lastWatchedAtEpochMs: Long,
) {
    val progressFraction: Float? get() =
        if (durationMs >
            0
        ) {
            (positionMs.toFloat() / durationMs).coerceIn(0f, 1f)
        } else {
            null
        }
}

/** What the primary button of the series sheet does (M-10). */
data class ResumeTarget(
    val episodeId: String,
    val episodeIndex: Int,
    /** True when the viewer already started the series: the label reads "Reprendre l'épisode N". */
    val isResume: Boolean,
) {
    companion object {
        /**
         * Picks the episode to open: the last watched one when it is not finished, the next one when it is,
         * the first episode when the series was never opened. Returns null for a series without episodes.
         */
        fun resolve(
            episodes: List<Episode>,
            history: WatchHistoryEntry?,
            lastProgress: WatchProgress?,
        ): ResumeTarget? {
            if (episodes.isEmpty()) return null
            val sorted = episodes.sortedBy { it.index }
            if (history == null) return ResumeTarget(sorted.first().id, sorted.first().index, isResume = false)
            val watched =
                sorted.firstOrNull { it.id == history.episodeId }
                    ?: return ResumeTarget(sorted.first().id, sorted.first().index, isResume = false)
            val finished = lastProgress?.episodeId == watched.id && lastProgress.completed
            if (!finished) return ResumeTarget(watched.id, watched.index, isResume = true)
            val next = sorted.firstOrNull { it.index > watched.index } ?: watched
            return ResumeTarget(next.id, next.index, isResume = true)
        }
    }
}
