package com.drama.domain.model

/** Answer of `POST /episodes/{id}/play`: the server has checked the entitlement and returns the stream. */
data class PlaySession(
    val episodeId: String,
    val seriesId: String,
    val episodeNumber: Int,
    val source: PlaybackSource,
    /** The manifest URL stops working after this instant (signed URLs from S04-BE-02); ask /play again. */
    val expiresAtEpochMs: Long,
    /** Server-side resume position (M-15); 0 when never watched or completed. */
    val resumePositionMs: Long,
    val durationMs: Long,
    val nextEpisodeId: String?,
    val subtitles: List<Subtitle>,
) {
    fun isExpired(nowEpochMs: Long): Boolean = nowEpochMs >= expiresAtEpochMs
}

data class Subtitle(
    val language: String,
    val url: String,
)
