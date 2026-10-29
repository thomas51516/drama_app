package com.drama.domain.usecase

import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.domain.model.PlaySession
import com.drama.domain.model.PlaybackSource
import com.drama.domain.model.StreamFormat
import com.drama.domain.model.WatchProgress
import com.drama.domain.repository.PlaybackRepository
import com.drama.domain.repository.WatchProgressRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StartPlaybackUseCaseTest {
    private fun session(
        resumeMs: Long,
        durationMs: Long = 30_000,
    ) = PlaySession(
        episodeId = "ep1",
        seriesId = "s1",
        episodeNumber = 1,
        source = PlaybackSource("https://cdn/ep1.m3u8", StreamFormat.HLS),
        expiresAtEpochMs = Long.MAX_VALUE,
        resumePositionMs = resumeMs,
        durationMs = durationMs,
        nextEpisodeId = "ep2",
        subtitles = emptyList(),
    )

    private fun local(
        positionMs: Long,
        completed: Boolean = false,
    ) = WatchProgress("ep1", "s1", positionMs, 30_000, completed)

    @Test
    fun `server position wins over local`() {
        assertEquals(12_000L, DefaultStartPlaybackUseCase.resolveStartPosition(session(12_000), local(5_000)))
    }

    @Test
    fun `local position is used when the server has none`() {
        assertEquals(5_000L, DefaultStartPlaybackUseCase.resolveStartPosition(session(0), local(5_000)))
    }

    @Test
    fun `completed local progress restarts from zero`() {
        assertEquals(0L, DefaultStartPlaybackUseCase.resolveStartPosition(session(0), local(29_000, completed = true)))
    }

    @Test
    fun `positions at the very end restart from zero`() {
        assertEquals(0L, DefaultStartPlaybackUseCase.resolveStartPosition(session(29_000), null))
    }

    @Test
    fun `use case combines play session and local progress`() =
        runTest {
            val playback =
                object : PlaybackRepository {
                    override suspend fun startPlayback(episodeId: String): AppResult<PlaySession> =
                        AppResult.Success(session(0))

                    override suspend fun reportProgress(progress: WatchProgress): AppResult<Unit> =
                        AppResult.Success(Unit)
                }
            val progress =
                object : WatchProgressRepository {
                    override suspend fun save(progress: WatchProgress) = Unit

                    override suspend fun get(episodeId: String): WatchProgress? = local(7_000)

                    override fun observeForSeries(seriesId: String): Flow<List<WatchProgress>> = flowOf(emptyList())
                }
            val result = DefaultStartPlaybackUseCase(playback, progress)("ep1")
            val start = (result as AppResult.Success).value
            assertEquals(7_000L, start.startPositionMs)
            assertTrue(start.isResume)
        }

    @Test
    fun `locked episodes propagate the failure`() =
        runTest {
            val playback =
                object : PlaybackRepository {
                    override suspend fun startPlayback(episodeId: String): AppResult<PlaySession> =
                        AppResult.Failure(AppError.Locked("ep1", "s1", 10))

                    override suspend fun reportProgress(progress: WatchProgress): AppResult<Unit> =
                        AppResult.Success(Unit)
                }
            val progress =
                object : WatchProgressRepository {
                    override suspend fun save(progress: WatchProgress) = Unit

                    override suspend fun get(episodeId: String): WatchProgress? = null

                    override fun observeForSeries(seriesId: String): Flow<List<WatchProgress>> = flowOf(emptyList())
                }
            val result = DefaultStartPlaybackUseCase(playback, progress)("ep1")
            assertTrue((result as AppResult.Failure).error is AppError.Locked)
        }
}
