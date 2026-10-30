package com.drama.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SignedUrlPolicyTest {
    @Test
    fun `needs refresh inside the margin and after expiry`() {
        val expiresAt = 100_000L
        assertFalse(SignedUrlPolicy.needsRefresh(expiresAt, nowEpochMs = 0L))
        assertFalse(SignedUrlPolicy.needsRefresh(expiresAt, nowEpochMs = 69_999L))
        assertTrue(SignedUrlPolicy.needsRefresh(expiresAt, nowEpochMs = 70_000L))
        assertTrue(SignedUrlPolicy.needsRefresh(expiresAt, nowEpochMs = 100_000L))
        assertTrue(SignedUrlPolicy.needsRefresh(expiresAt, nowEpochMs = 500_000L))
    }

    @Test
    fun `refresh delay counts down to the margin and never goes negative`() {
        assertEquals(70_000L, SignedUrlPolicy.refreshDelayMs(expiresAtEpochMs = 100_000L, nowEpochMs = 0L))
        assertEquals(0L, SignedUrlPolicy.refreshDelayMs(expiresAtEpochMs = 100_000L, nowEpochMs = 90_000L))
        assertEquals(0L, SignedUrlPolicy.refreshDelayMs(expiresAtEpochMs = 100_000L, nowEpochMs = 200_000L))
    }

    @Test
    fun `only a first 403 is retried`() {
        assertTrue(SignedUrlPolicy.shouldRetryAfterHttpError(403, retriesSoFar = 0))
        assertFalse(SignedUrlPolicy.shouldRetryAfterHttpError(403, retriesSoFar = 1))
        assertFalse(SignedUrlPolicy.shouldRetryAfterHttpError(404, retriesSoFar = 0))
        assertFalse(SignedUrlPolicy.shouldRetryAfterHttpError(null, retriesSoFar = 0))
    }
}
