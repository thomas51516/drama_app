package com.drama.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EpisodeNavigationTest {
    @Test
    fun `next index stops at the last episode`() {
        assertEquals(1, EpisodeNavigation.nextIndex(current = 0, count = 3))
        assertNull(EpisodeNavigation.nextIndex(current = 2, count = 3))
    }

    @Test
    fun `previous index stops at the first episode`() {
        assertEquals(0, EpisodeNavigation.previousIndex(current = 1))
        assertNull(EpisodeNavigation.previousIndex(current = 0))
    }

    @Test
    fun `preload candidates favour the next episode`() {
        assertEquals(listOf(2, 0), EpisodeNavigation.preloadCandidates(current = 1, count = 3))
        assertEquals(listOf(1), EpisodeNavigation.preloadCandidates(current = 0, count = 3))
        assertEquals(listOf(1), EpisodeNavigation.preloadCandidates(current = 2, count = 3))
    }
}
