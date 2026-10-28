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

/**
 * Abstraction over the Media3 stack so the view model stays testable on the JVM.
 * All methods must be called from the main thread.
 */
interface PlaybackEngine {
    val events: SharedFlow<PlaybackEvent>

    /** The player currently bound to the visible page, or null before the first start. */
    val activePlayer: StateFlow<Player?>

    fun setPlaylist(sources: List<PlaybackSource>)

    /** Makes [index] the current episode: starts playback and re-targets preloading around it. */
    fun play(index: Int)

    fun togglePlayPause()

    fun pause()

    fun resume()

    fun release()
}

fun interface PlaybackEngineFactory {
    fun create(): PlaybackEngine
}
