package com.drama.domain.usecase

import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.PlaybackSource
import com.drama.domain.model.Series
import com.drama.domain.model.StreamFormat
import com.drama.domain.repository.CatalogRepository
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class GetSeriesEpisodesUseCaseTest {
    private fun episode(index: Int) =
        Episode(
            id = "e$index",
            seriesId = "s",
            index = index,
            title = "Episode $index",
            durationMs = null,
            access = EpisodeAccess.FREE,
            playback = PlaybackSource("https://example.com/$index.m3u8", StreamFormat.HLS),
        )

    private val repository =
        object : CatalogRepository {
            override suspend fun getSeries(seriesId: String): AppResult<Series> =
                AppResult.Failure(AppError.NotFound(seriesId))

            override suspend fun getEpisodes(seriesId: String): AppResult<List<Episode>> =
                AppResult.Success(listOf(episode(3), episode(1), episode(2)))
        }

    @Test
    fun `episodes are sorted by index`() =
        runTest {
            val result = DefaultGetSeriesEpisodesUseCase(repository)("s")
            val indices = (result as AppResult.Success).value.map { it.index }
            assertEquals(listOf(1, 2, 3), indices)
        }
}
