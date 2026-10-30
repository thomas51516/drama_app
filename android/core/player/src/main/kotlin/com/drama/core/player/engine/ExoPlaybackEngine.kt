package com.drama.core.player.engine

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
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
import com.drama.domain.model.Subtitle
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.abs

/**
 * Media3 engine (S01-A2-01 spike, extended in S02-A2-03 with lazy sources, seek and mute).
 *
 * Strategy ("one player per visible page", pool of two):
 * - A [DefaultPreloadManager] owns every known episode as a `MediaSource` and preloads the neighbours of the
 *   current page (next/previous: 5 s of media loaded, +-2: tracks selected only). Sources are backed by a
 *   [CacheDataSource] over the shared [SimpleCache] so segments already fetched are never re-downloaded.
 * - ExoPlayer instances are built with [DefaultPreloadManager.Builder.buildExoPlayer] so they share the
 *   preload manager's playback looper, load control and bandwidth meter. At most two players are alive:
 *   the one bound to the visible page and one idle player kept for the next page.
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

    private val positionFlow = MutableStateFlow(PlaybackPosition())
    override val position: StateFlow<PlaybackPosition> = positionFlow.asStateFlow()

    private val tracksFlow = MutableStateFlow(AvailableTracks())
    override val tracks: StateFlow<AvailableTracks> = tracksFlow.asStateFlow()

    // Settings applied to every player the pool hands out (they survive episode changes, S03-A2-01/02).
    private var playbackSpeed = 1f
    private var maxVideoShortSide = 0
    private var subtitleLanguage: String? = null

    private var slotCount = 0
    private val mediaItems = mutableMapOf<Int, MediaItem>()
    private var currentIndex: Int = -1
    private val preloadedIndices = linkedSetOf<Int>()
    private var muted = false

    private var current: ExoPlayer? = null
    private val idlePlayers = ArrayDeque<ExoPlayer>()

    // Startup instrumentation for the current episode.
    private var startRequestedAtMs = 0L
    private var readyAtMs: Long? = null
    private var firstFrameReported = false
    private var currentWasPreloaded = false

    private val mainHandler = Handler(Looper.getMainLooper())
    private val positionTicker =
        object : Runnable {
            override fun run() {
                publishPosition()
                if (current != null) mainHandler.postDelayed(this, POSITION_POLL_MS)
            }
        }

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
                        val index = indexOf(mediaItem) ?: return
                        preloadedIndices += index
                        logger.i(TAG, "preload completed index=$index")
                        eventsFlow.tryEmit(PlaybackEvent.PreloadCompleted(index))
                    }

                    override fun onError(error: PreloadException) {
                        val index = indexOf(error.mediaItem)
                        logger.w(TAG, "preload error index=$index: ${error.message}", error)
                    }
                },
            )
        }

    override fun setPlaylist(count: Int) {
        stop()
        slotCount = count
        mediaItems.clear()
        preloadedIndices.clear()
        currentIndex = -1
        preloadManager.reset()
        logger.i(TAG, "playlist set: $count slots, sources resolved lazily via /play, cache-backed data source")
    }

    override fun growPlaylist(count: Int) {
        if (count <= slotCount) return
        slotCount = count
        logger.i(TAG, "playlist grown to $count slots")
    }

    override fun setSource(
        index: Int,
        source: PlaybackSource,
    ) {
        if (index !in 0 until slotCount) return
        val item = source.toMediaItem(index)
        val existing = mediaItems[index]
        if (existing != null) {
            if (existing.localConfiguration?.uri == item.localConfiguration?.uri) return
            preloadManager.remove(existing)
            preloadedIndices -= index
        }
        mediaItems[index] = item
        preloadManager.add(item, index)
        if (currentIndex >= 0) preloadManager.invalidate()
        logger.i(TAG, "source set index=$index uri=${item.localConfiguration?.uri}")
    }

    override fun hasSource(index: Int): Boolean = mediaItems.containsKey(index)

    override fun play(
        index: Int,
        startPositionMs: Long,
    ) {
        val item = mediaItems[index] ?: return
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
        player.volume = if (muted) 0f else 1f
        applySettings(player)
        tracksFlow.value = AvailableTracks()
        currentWasPreloaded = index in preloadedIndices
        firstFrameReported = false
        readyAtMs = null

        val preloadedSource = preloadManager.getMediaSource(item)
        startRequestedAtMs = SystemClock.elapsedRealtime()
        val startMs = startPositionMs.coerceAtLeast(0L)
        if (preloadedSource != null) {
            player.setMediaSource(preloadedSource, startMs)
        } else {
            player.setMediaItem(item, startMs)
        }
        player.prepare()
        player.playWhenReady = true
        logger.i(
            TAG,
            "start index=$index preloaded=$currentWasPreloaded start_ms=$startMs uri=${item.localConfiguration?.uri}",
        )
        activePlayerFlow.value = player
        mainHandler.removeCallbacks(positionTicker)
        mainHandler.post(positionTicker)
    }

    override fun restart(
        index: Int,
        startPositionMs: Long,
    ) {
        if (index !in mediaItems) return
        if (index == currentIndex) {
            // Force a fresh prepare: the outgoing player goes back to the pool, the new one gets the new source.
            currentIndex = -1
        }
        logger.i(TAG, "restart index=$index start_ms=$startPositionMs")
        play(index, startPositionMs)
    }

    override fun stop() {
        val player = current ?: return
        player.stop()
        player.clearMediaItems()
        idlePlayers.addLast(player)
        current = null
        activePlayerFlow.value = null
        mainHandler.removeCallbacks(positionTicker)
        positionFlow.value = PlaybackPosition()
        tracksFlow.value = AvailableTracks()
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

    override fun seekTo(positionMs: Long) {
        val player = current ?: return
        val duration = player.duration.takeIf { it != C.TIME_UNSET && it > 0 }
        val target = if (duration != null) positionMs.coerceIn(0L, duration) else positionMs.coerceAtLeast(0L)
        player.seekTo(target)
        publishPosition()
    }

    override fun setMuted(muted: Boolean) {
        this.muted = muted
        current?.volume = if (muted) 0f else 1f
    }

    override fun setPlaybackSpeed(speed: Float) {
        playbackSpeed = speed
        current?.let { applySettings(it) }
    }

    override fun setMaxVideoShortSide(shortSide: Int) {
        maxVideoShortSide = shortSide
        current?.let { applySettings(it) }
    }

    override fun setSubtitleLanguage(language: String?) {
        subtitleLanguage = language
        current?.let { applySettings(it) }
    }

    /** Speed, quality cap and subtitle choice are plain player parameters: cheap to re-apply on every start. */
    private fun applySettings(player: ExoPlayer) {
        val cap = TrackSelectionMapper.longSideCap(maxVideoShortSide)
        player.trackSelectionParameters =
            player.trackSelectionParameters
                .buildUpon()
                .setMaxVideoSize(cap, cap)
                .setPreferredTextLanguage(subtitleLanguage)
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, subtitleLanguage == null)
                .build()
        if (player.playbackParameters.speed != playbackSpeed) player.setPlaybackSpeed(playbackSpeed)
        logger.i(
            TAG,
            "settings applied speed=$playbackSpeed max_short_side=$maxVideoShortSide subtitles=${subtitleLanguage ?: "off"}",
        )
    }

    override fun currentPositionMs(): Long = current?.currentPosition ?: -1L

    override fun currentDurationMs(): Long = current?.duration?.takeIf { it != C.TIME_UNSET } ?: 0L

    override fun release() {
        mainHandler.removeCallbacks(positionTicker)
        current?.release()
        current = null
        idlePlayers.forEach { it.release() }
        idlePlayers.clear()
        activePlayerFlow.value = null
        preloadManager.release()
        logger.i(TAG, "engine released")
    }

    private fun publishPosition() {
        val player = current ?: return
        val duration = player.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L
        positionFlow.value =
            PlaybackPosition(
                positionMs = player.currentPosition.coerceAtLeast(0L),
                durationMs = duration,
                bufferedMs = player.bufferedPosition.coerceAtLeast(0L),
            )
    }

    private fun indexOf(mediaItem: MediaItem): Int? = mediaItems.entries.firstOrNull { it.value == mediaItem }?.key

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
                        publishPosition()
                    }
                Player.STATE_ENDED -> {
                    publishPosition()
                    eventsFlow.tryEmit(PlaybackEvent.Ended(currentIndex))
                }
                else -> Unit
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (player === current) eventsFlow.tryEmit(PlaybackEvent.IsPlayingChanged(isPlaying))
        }

        override fun onTracksChanged(tracks: Tracks) {
            if (player !== current) return
            val videoFormats =
                tracks.groups
                    .filter { it.type == C.TRACK_TYPE_VIDEO }
                    .flatMap { group -> (0 until group.length).map { group.getTrackFormat(it) } }
            val textGroups = tracks.groups.filter { it.type == C.TRACK_TYPE_TEXT }
            val selectedText =
                textGroups
                    .flatMap { group ->
                        (0 until group.length).filter { group.isTrackSelected(it) }.map { group.getTrackFormat(it) }
                    }.firstOrNull()
                    ?.language
            tracksFlow.value =
                tracksFlow.value.copy(
                    videoShortSides =
                        videoFormats
                            .filter { it.width > 0 && it.height > 0 }
                            .map { TrackSelectionMapper.shortSide(it.width, it.height) }
                            .distinct()
                            .sorted(),
                    subtitleLanguages =
                        textGroups
                            .flatMap { group -> (0 until group.length).map { group.getTrackFormat(it) } }
                            .mapNotNull { it.language?.lowercase() }
                            .distinct(),
                    selectedSubtitleLanguage = selectedText?.lowercase(),
                )
            logger.i(
                TAG,
                "tracks index=$currentIndex video=${tracksFlow.value.videoShortSides.joinToString("/") { "${it}p" }} " +
                    "text=${tracksFlow.value.subtitleLanguages} selected_text=${selectedText ?: "none"}",
            )
        }

        override fun onVideoSizeChanged(videoSize: VideoSize) {
            if (player !== current || videoSize.width == 0 || videoSize.height == 0) return
            val format = player.videoFormat
            tracksFlow.value = tracksFlow.value.copy(playingWidth = videoSize.width, playingHeight = videoSize.height)
            logger.i(
                TAG,
                "selected video format index=$currentIndex ${videoSize.width}x${videoSize.height} " +
                    "bitrate=${format?.bitrate ?: -1} codecs=${format?.codecs ?: "?"} cap_short_side=$maxVideoShortSide",
            )
        }

        override fun onPlayerError(error: PlaybackException) {
            if (player !== current) return
            val httpStatus = error.httpStatus()
            logger.e(
                TAG,
                "player error index=$currentIndex code=${error.errorCodeName} http=${httpStatus ?: "-"}",
                error,
            )
            eventsFlow.tryEmit(PlaybackEvent.Error(currentIndex, error.errorCodeName, httpStatus))
        }
    }

    /** HTTP status of the failing media request, when the cause chain carries one (manifest or segment load). */
    private fun PlaybackException.httpStatus(): Int? {
        var cause: Throwable? = this
        while (cause != null) {
            if (cause is HttpDataSource.InvalidResponseCodeException) return cause.responseCode
            cause = cause.cause
        }
        return null
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
            ).setSubtitleConfigurations(subtitles.map { it.toSubtitleConfiguration() })
            .build()

    /** Side-loaded WebVTT track (M-14); never flagged default: the selector picks it from the preference. */
    private fun Subtitle.toSubtitleConfiguration(): MediaItem.SubtitleConfiguration =
        MediaItem.SubtitleConfiguration
            .Builder(Uri.parse(url))
            .setMimeType(MimeTypes.TEXT_VTT)
            .setLanguage(language)
            .setLabel(label)
            .setSelectionFlags(0)
            .build()

    companion object {
        const val TAG = "PlayerSpike"
        private const val USER_AGENT = "DRAMA-Android/0.1"
        private const val PRELOAD_NEIGHBOUR_MS = 5_000L
        private const val MIN_BUFFER_MS = 10_000
        private const val MAX_BUFFER_MS = 30_000
        private const val BUFFER_FOR_PLAYBACK_MS = 500
        private const val BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS = 1_500
        private const val POSITION_POLL_MS = 250L
    }
}
