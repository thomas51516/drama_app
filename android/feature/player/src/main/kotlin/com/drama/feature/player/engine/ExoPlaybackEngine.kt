package com.drama.feature.player.engine

import android.content.Context
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.preload.DefaultPreloadManager
import androidx.media3.exoplayer.source.preload.DefaultPreloadManager.PreloadStatus
import androidx.media3.exoplayer.source.preload.PreloadException
import androidx.media3.exoplayer.source.preload.PreloadManagerListener
import androidx.media3.exoplayer.source.preload.TargetPreloadStatusControl
import com.drama.core.common.logging.Logger
import com.drama.domain.model.PlaybackSource
import com.drama.domain.model.StreamFormat
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.abs

/**
 * Sprint 1 player spike (S01-A2-01).
 *
 * Strategy ("one player per visible page", pool of two):
 * - A [DefaultPreloadManager] owns every episode as a `MediaSource` and preloads the neighbours of the
 *   current page (next/previous: 5 s of media loaded, +-2: tracks selected only). Sources are backed by a
 *   [CacheDataSource] over the shared [SimpleCache] so segments already fetched are never re-downloaded.
 * - ExoPlayer instances are built with [DefaultPreloadManager.Builder.buildExoPlayer] so they share the
 *   preload manager's playback looper, load control and bandwidth meter. At most two players are alive:
 *   the one bound to the visible page and one idle player kept for the next page. Alternating players means
 *   the outgoing page keeps its own surface (no black flash while the pager settles) while memory stays bounded.
 * - Startup time = `SystemClock.elapsedRealtime()` between `setMediaSource()+prepare()` and
 *   `onRenderedFirstFrame()`, logged under the tag `PlayerSpike` and surfaced through [PlaybackEvent.FirstFrameRendered].
 */
@OptIn(UnstableApi::class)
class ExoPlaybackEngine(
    context: Context,
    cache: Cache,
    private val logger: Logger,
) : PlaybackEngine {
    private val eventsFlow = MutableSharedFlow<PlaybackEvent>(extraBufferCapacity = 64)
    override val events: SharedFlow<PlaybackEvent> = eventsFlow.asSharedFlow()

    private val activePlayerFlow = MutableStateFlow<Player?>(null)
    override val activePlayer: StateFlow<Player?> = activePlayerFlow.asStateFlow()

    private var mediaItems: List<MediaItem> = emptyList()
    private var currentIndex: Int = -1
    private val preloadedIndices = linkedSetOf<Int>()

    private var current: ExoPlayer? = null
    private val idlePlayers = ArrayDeque<ExoPlayer>()

    // Startup instrumentation for the current episode.
    private var startRequestedAtMs = 0L
    private var readyAtMs: Long? = null
    private var firstFrameReported = false
    private var currentWasPreloaded = false

    private val dataSourceFactory: DataSource.Factory =
        CacheDataSource
            .Factory()
            .setCache(cache)
            .setUpstreamDataSourceFactory(
                DefaultHttpDataSource
                    .Factory()
                    .setUserAgent(USER_AGENT)
                    .setAllowCrossProtocolRedirects(true),
            ).setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

    private val loadControl =
        DefaultLoadControl
            .Builder()
            .setBufferDurationsMs(
                MIN_BUFFER_MS,
                MAX_BUFFER_MS,
                BUFFER_FOR_PLAYBACK_MS,
                BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS,
            ).setPrioritizeTimeOverSizeThresholds(true)
            .build()

    private val targetPreloadStatusControl =
        TargetPreloadStatusControl<Int, PreloadStatus> { rankingData ->
            when (abs(rankingData - currentIndex)) {
                1 -> PreloadStatus.specifiedRangeLoaded(PRELOAD_NEIGHBOUR_MS)
                2 -> PreloadStatus.PRELOAD_STATUS_TRACKS_SELECTED
                else -> PreloadStatus.PRELOAD_STATUS_NOT_PRELOADED
            }
        }

    private val preloadManagerBuilder =
        DefaultPreloadManager
            .Builder(context, targetPreloadStatusControl)
            .setDataSourceFactory(dataSourceFactory)
            .setLoadControl(loadControl)

    private val preloadManager: DefaultPreloadManager =
        preloadManagerBuilder.build().also { manager ->
            manager.addListener(
                object : PreloadManagerListener {
                    override fun onCompleted(mediaItem: MediaItem) {
                        val index = mediaItems.indexOf(mediaItem)
                        if (index < 0) return
                        preloadedIndices += index
                        logger.i(TAG, "preload completed index=$index")
                        eventsFlow.tryEmit(PlaybackEvent.PreloadCompleted(index))
                    }

                    override fun onError(error: PreloadException) {
                        val index = mediaItems.indexOf(error.mediaItem)
                        logger.w(TAG, "preload error index=$index: ${error.message}", error)
                    }
                },
            )
        }

    override fun setPlaylist(sources: List<PlaybackSource>) {
        mediaItems = sources.mapIndexed { index, source -> source.toMediaItem(index) }
        preloadedIndices.clear()
        preloadManager.reset()
        preloadManager.addMediaItems(mediaItems, mediaItems.indices.toList())
        logger.i(TAG, "playlist set: ${mediaItems.size} items, cache-backed data source")
    }

    override fun play(index: Int) {
        val item = mediaItems.getOrNull(index) ?: return
        if (index == currentIndex && current != null) {
            resume()
            return
        }
        currentIndex = index
        preloadManager.setCurrentPlayingIndex(index)
        preloadManager.invalidate()

        current?.let { outgoing ->
            outgoing.stop()
            outgoing.clearMediaItems()
            idlePlayers.addLast(outgoing)
        }

        val player = idlePlayers.removeFirstOrNull() ?: createPlayer()
        current = player
        currentWasPreloaded = index in preloadedIndices
        firstFrameReported = false
        readyAtMs = null

        val preloadedSource = preloadManager.getMediaSource(item)
        startRequestedAtMs = SystemClock.elapsedRealtime()
        if (preloadedSource != null) {
            player.setMediaSource(preloadedSource)
        } else {
            player.setMediaItem(item)
        }
        player.prepare()
        player.playWhenReady = true
        logger.i(TAG, "start index=$index preloaded=$currentWasPreloaded uri=${item.localConfiguration?.uri}")
        activePlayerFlow.value = player
    }

    override fun togglePlayPause() {
        val player = current ?: return
        when {
            player.playbackState == Player.STATE_ENDED -> {
                player.seekToDefaultPosition()
                player.play()
            }
            player.isPlaying -> player.pause()
            else -> player.play()
        }
    }

    override fun pause() {
        current?.pause()
    }

    override fun resume() {
        current?.play()
    }

    override fun release() {
        current?.release()
        current = null
        idlePlayers.forEach { it.release() }
        idlePlayers.clear()
        activePlayerFlow.value = null
        preloadManager.release()
        logger.i(TAG, "engine released")
    }

    private fun createPlayer(): ExoPlayer {
        val player = preloadManagerBuilder.buildExoPlayer()
        player.videoScalingMode = C.VIDEO_SCALING_MODE_SCALE_TO_FIT
        player.repeatMode = Player.REPEAT_MODE_OFF
        player.addListener(PlayerEvents(player))
        return player
    }

    private inner class PlayerEvents(
        private val player: ExoPlayer,
    ) : Player.Listener {
        override fun onRenderedFirstFrame() {
            if (player !== current || firstFrameReported) return
            firstFrameReported = true
            val now = SystemClock.elapsedRealtime()
            val startupMs = now - startRequestedAtMs
            val readyMs = readyAtMs?.let { it - startRequestedAtMs }
            logger.i(
                TAG,
                "first_frame index=$currentIndex startup_ms=$startupMs ready_ms=${readyMs ?: -1} " +
                    "preloaded=$currentWasPreloaded",
            )
            eventsFlow.tryEmit(PlaybackEvent.FirstFrameRendered(currentIndex, startupMs, readyMs, currentWasPreloaded))
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            if (player !== current) return
            when (playbackState) {
                Player.STATE_READY ->
                    if (readyAtMs == null) {
                        val now = SystemClock.elapsedRealtime()
                        readyAtMs = now
                        // STATE_READY usually lands just after the first frame; log it so both marks are in Logcat.
                        logger.i(TAG, "ready index=$currentIndex ready_ms=${now - startRequestedAtMs}")
                    }
                Player.STATE_ENDED -> eventsFlow.tryEmit(PlaybackEvent.Ended(currentIndex))
                else -> Unit
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (player === current) eventsFlow.tryEmit(PlaybackEvent.IsPlayingChanged(isPlaying))
        }

        override fun onPlayerError(error: PlaybackException) {
            if (player !== current) return
            logger.e(TAG, "player error index=$currentIndex code=${error.errorCodeName}", error)
            eventsFlow.tryEmit(PlaybackEvent.Error(currentIndex, error.errorCodeName))
        }
    }

    private fun PlaybackSource.toMediaItem(index: Int): MediaItem =
        MediaItem
            .Builder()
            .setUri(url)
            .setMediaId("episode-$index")
            .setMimeType(
                when (format) {
                    StreamFormat.HLS -> MimeTypes.APPLICATION_M3U8
                    StreamFormat.DASH -> MimeTypes.APPLICATION_MPD
                    StreamFormat.PROGRESSIVE -> null
                },
            ).build()

    companion object {
        const val TAG = "PlayerSpike"
        private const val USER_AGENT = "DRAMA-Android/0.1 (spike)"
        private const val PRELOAD_NEIGHBOUR_MS = 5_000L
        private const val MIN_BUFFER_MS = 10_000
        private const val MAX_BUFFER_MS = 30_000
        private const val BUFFER_FOR_PLAYBACK_MS = 500
        private const val BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS = 1_500
    }
}
