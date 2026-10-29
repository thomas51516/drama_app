package com.drama.feature.player.ui

import android.graphics.Color
import android.graphics.Typeface
import android.util.TypedValue
import androidx.annotation.OptIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.Player
import androidx.media3.common.text.Cue
import androidx.media3.common.text.CueGroup
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.SubtitleView

/**
 * Renders the player's text cues (M-14). `ContentFrame` from media3-ui-compose draws video only, so the
 * cues are forwarded to a classic [SubtitleView] styled for readability over video: bold white text on a
 * translucent black box with a drop shadow, 18 sp, embedded WebVTT styles ignored.
 */
@OptIn(UnstableApi::class)
@Composable
fun SubtitleOverlay(
    player: Player,
    modifier: Modifier = Modifier,
    bottomPaddingFraction: Float = DEFAULT_BOTTOM_PADDING_FRACTION,
) {
    var cues by remember(player) { mutableStateOf<List<Cue>>(player.currentCues.cues) }
    DisposableEffect(player) {
        val listener =
            object : Player.Listener {
                override fun onCues(cueGroup: CueGroup) {
                    cues = cueGroup.cues
                }
            }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }
    AndroidView(
        factory = { context ->
            SubtitleView(context).apply {
                setStyle(
                    CaptionStyleCompat(
                        Color.WHITE,
                        BACKGROUND_COLOR,
                        Color.TRANSPARENT,
                        CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW,
                        Color.BLACK,
                        Typeface.DEFAULT_BOLD,
                    ),
                )
                setFixedTextSize(TypedValue.COMPLEX_UNIT_SP, TEXT_SIZE_SP)
                setApplyEmbeddedStyles(false)
                setApplyEmbeddedFontSizes(false)
                setBottomPaddingFraction(bottomPaddingFraction)
            }
        },
        update = { view -> view.setCues(cues) },
        modifier = modifier,
    )
}

private const val TEXT_SIZE_SP = 18f
private const val BACKGROUND_COLOR = 0x99000000.toInt()
private const val DEFAULT_BOTTOM_PADDING_FRACTION = 0.04f
