package com.drama.domain.model

/**
 * When to re-request a signed media URL (S04-A2-01). The server tells when the URL stops working
 * (`expiresAt`); the client asks again [REFRESH_MARGIN_MS] before that instant so a start never races the
 * expiry, and on an HTTP 403 from the media host (one transparent re-resolve, then the error surfaces).
 */
object SignedUrlPolicy {
    const val REFRESH_MARGIN_MS = 30_000L

    /** `expiresAt` value of a URL that never expires (fake catalogue): no proactive refresh is scheduled. */
    const val NEVER_EXPIRES = Long.MAX_VALUE

    /** True when the server gave an expiry worth a proactive refresh. */
    fun hasExpiry(expiresAtEpochMs: Long): Boolean = expiresAtEpochMs != NEVER_EXPIRES

    /** True when [expiresAtEpochMs] is within the margin or already past. */
    fun needsRefresh(
        expiresAtEpochMs: Long,
        nowEpochMs: Long,
        marginMs: Long = REFRESH_MARGIN_MS,
    ): Boolean = expiresAtEpochMs - marginMs <= nowEpochMs

    /** Delay before the proactive refresh of a URL that is still valid; 0 when it must happen now. */
    fun refreshDelayMs(
        expiresAtEpochMs: Long,
        nowEpochMs: Long,
        marginMs: Long = REFRESH_MARGIN_MS,
    ): Long = (expiresAtEpochMs - marginMs - nowEpochMs).coerceAtLeast(0L)

    /** A 403 answered by the media host means the signature expired or was rejected: resolve again once. */
    fun shouldRetryAfterHttpError(
        httpStatus: Int?,
        retriesSoFar: Int,
    ): Boolean = httpStatus == HTTP_FORBIDDEN && retriesSoFar < MAX_FORBIDDEN_RETRIES

    const val HTTP_FORBIDDEN = 403
    const val MAX_FORBIDDEN_RETRIES = 1
}
