package com.drama.data.repository

import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.PlaybackApi
import com.drama.data.media.MediaUrlResolver
import com.drama.data.wallet.WalletStore
import com.drama.domain.model.Wallet
import com.drama.domain.model.WatchHistoryEntry
import com.drama.domain.model.WatchProgress
import com.drama.domain.repository.WatchHistoryRepository
import com.drama.domain.repository.WatchProgressRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/** `/play` with auto-unlock (M-21): `unlocked: true` flips the cached status and invalidates the mirrored wallet. */
class RemotePlaybackRepositoryTest {
    private val server = MockWebServer()
    private val walletStore = WalletStore()
    private val catalogLocal = RemoteUnlockRepositoryTest.RecordingCatalogLocal()
    private lateinit var repository: RemotePlaybackRepository

    @Before
    fun setUp() {
        server.start()
        val json = Json { ignoreUnknownKeys = true }
        val api =
            Retrofit
                .Builder()
                .baseUrl(server.url("/"))
                .client(OkHttpClient())
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
                .create(PlaybackApi::class.java)
        repository =
            RemotePlaybackRepository(
                api = api,
                errorMapper = ApiErrorMapper(json),
                media = MediaUrlResolver("http://10.0.2.2:9000/drama-media", rewriteLoopback = false),
                clock = Clock { 0L },
                watchProgress = NoProgress,
                watchHistory = NoHistory,
                catalogLocal = catalogLocal,
                walletStore = walletStore,
                logger = NoOpLogger,
            )
    }

    @After
    fun tearDown() = server.close()

    @Test
    fun `auto-unlocked play marks the episode unlocked and drops the stale wallet`() =
        runTest {
            walletStore.publish(Wallet(50, 0, 50, autoUnlock = true))
            server.enqueue(MockResponse(code = 200, body = play(unlocked = true)))

            val session = (repository.startPlayback("e3") as AppResult.Success).value

            assertTrue(session.unlocked)
            assertEquals("https://cdn/e3.m3u8", session.source.url)
            assertEquals(listOf("s1" to listOf("e3")), catalogLocal.unlocked)
            assertNull(walletStore.wallet.value)
        }

    @Test
    fun `a regular play leaves the cache and the wallet alone`() =
        runTest {
            walletStore.publish(Wallet(50, 0, 50, autoUnlock = false))
            server.enqueue(MockResponse(code = 200, body = play(unlocked = false)))

            val session = (repository.startPlayback("e3") as AppResult.Success).value

            assertFalse(session.unlocked)
            assertTrue(catalogLocal.unlocked.isEmpty())
            assertNotNull(walletStore.wallet.value)
        }

    private fun play(unlocked: Boolean) =
        """{"episodeId":"e3","seriesId":"s1","episodeNumber":3,"access":"unlocked","manifestUrl":"https://cdn/e3.m3u8",
           "expiresAt":"2026-10-30T12:00:00.000Z","resumePositionSeconds":0,"durationSeconds":90,"unlocked":$unlocked}"""

    private object NoProgress : WatchProgressRepository {
        override suspend fun save(progress: WatchProgress) = Unit

        override suspend fun get(episodeId: String): WatchProgress? = null

        override fun observeForSeries(seriesId: String): Flow<List<WatchProgress>> = flowOf(emptyList())
    }

    private object NoHistory : WatchHistoryRepository {
        override suspend fun recordWatch(
            seriesId: String,
            episodeId: String,
            episodeIndex: Int,
            positionMs: Long,
        ) = Unit

        override fun observeRecent(limit: Int): Flow<List<WatchHistoryEntry>> = flowOf(emptyList())

        override fun observeForSeries(seriesId: String): Flow<WatchHistoryEntry?> = flowOf(null)

        override suspend fun clear() = Unit
    }
}
