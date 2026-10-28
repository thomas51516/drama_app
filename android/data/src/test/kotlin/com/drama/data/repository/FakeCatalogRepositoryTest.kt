package com.drama.data.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.StreamFormat
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FakeCatalogRepositoryTest {
    private val repository = FakeCatalogRepository()

    @Test
    fun `test series exposes three HLS episodes`() =
        runTest {
            val result = repository.getEpisodes(FakeCatalogRepository.TEST_SERIES_ID)
            val episodes = (result as AppResult.Success).value
            assertEquals(3, episodes.size)
            assertEquals(listOf(1, 2, 3), episodes.map { it.index })
            assertTrue(episodes.all { it.playback.format == StreamFormat.HLS })
            assertTrue(episodes.all { it.playback.url.endsWith(".m3u8") })
        }

    @Test
    fun `unknown series is a NotFound failure`() =
        runTest {
            assertTrue(repository.getEpisodes("nope") is AppResult.Failure)
        }
}
