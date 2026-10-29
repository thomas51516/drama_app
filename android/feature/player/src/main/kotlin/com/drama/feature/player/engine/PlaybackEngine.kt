package com.drama.feature.player.engine

import androidx.media3.common.Player
import com.drama.domain.model.PlaybackSource
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow

/** Events the engine reports to the view model. Everything is emitted on the main thread. */
sealed interface PlaybackEvent {
    /**
     * First video frame rendered for [index]. [startupMs] is measured between the
     * `setMediaSource()/prepare()` call and `Player.Listener.onRenderedFirstFrame()`.
     * [readyMs] is the time to `STATE_READY` on the same clock, when it happened before the frame.
     */
    data class FirstFrameRendered(
        val index: Int,
        val startupMs: Long,
        val readyMs: Long?,
        val wasPreloaded: Boolean,
    ) : PlaybackEvent

    data class PreloadCompleted(
        val index: Int,
    ) : PlaybackEvent

    data class IsPlayingChanged(
        val isPlaying: Boolean,
    ) : PlaybackEvent

    data class Ended(
        val index: Int,
    ) : PlaybackEvent

    data class Error(
        val index: Int,
        val message: String,
    ) : PlaybackEvent
}

/** Current position of the visible player, refreshed about four times per second while attached. */
data class PlaybackPosition(
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val bufferedMs: Long = 0L,
) {
    val fraction: Float get() = if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
}

/**
 * Abstraction over the Media3 stack so the view model stays testable on the JVM.
 * All methods must be called from the main thread.
 *
 * Playlist slots are declared up front ([setPlaylist]) and their streams attached later ([setSource]) because
 * manifest URLs come from `POST /episodes/{id}/play`, one episode at a time; the engine preloads around the
 * current index whichever sources are already known.
 */
interface PlaybackEngine {
    val events: SharedFlow<PlaybackEvent>

    /** The player currently bound to the visible page, or null before the first start. */
    val activePlayer: StateFlow<Player?>

    val position: StateFlow<PlaybackPosition>

    /** Declares [count] episode slots and drops any previous sources and players' media. */
    fun setPlaylist(count: Int)

    /** Attaches (or replaces, when the URL changed) the stream of slot [index]. */
    fun setSource(
        index: Int,
        source: PlaybackSource,
    )

    fun hasSource(index: Int): Boolean

    /** Makes [index] the current episode: starts playback at [startPositionMs] and re-targets preloading. */
    fun play(
        index: Int,
        startPositionMs: Long = 0L,
    )

    /** Stops the visible player (locked page, screen left) without releasing resources. */
    fun stop()

    fun togglePlayPause()

    fun pause()

    fun resume()

    fun seekTo(positionMs: Long)

    fun setMuted(muted: Boolean)

    /** Synchronous read for progress reports; -1 when no player is attached. */
    fun currentPositionMs(): Long

    fun currentDurationMs(): Long

    fun release()
}

fun interface PlaybackEngineFactory {
    fun create(): PlaybackEngine
}
