package com.drama.feature.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drama.core.player.engine.PlaybackPosition
import com.drama.core.ui.theme.DramaSpacing
import java.util.Locale

/**
 * Draggable progress bar with time labels (M-13). While the user drags, the thumb follows the finger and
 * the label shows the target time; [onSeek] fires once on release.
 */
@Composable
fun SeekBar(
    position: PlaybackPosition,
    onSeek: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    var widthPx by remember { mutableStateOf(1) }
    var dragging by remember { mutableStateOf(false) }
    var dragFraction by remember { mutableFloatStateOf(0f) }

    val shownFraction = if (dragging) dragFraction else position.fraction
    val shownPositionMs = if (dragging) (dragFraction * position.durationMs).toLong() else position.positionMs
    val bufferedFraction =
        if (position.durationMs > 0) (position.bufferedMs.toFloat() / position.durationMs).coerceIn(0f, 1f) else 0f

    Column(modifier = modifier) {
        Row(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = formatTime(shownPositionMs),
                color = Color.White,
                fontSize = 12.sp,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = formatTime(position.durationMs),
                color = Color.White.copy(alpha = 0.8f),
                fontSize = 12.sp,
                fontFamily = FontFamily.Monospace,
            )
        }
        Spacer(Modifier.height(DramaSpacing.xs))
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(TOUCH_HEIGHT)
                    .onSizeChanged { widthPx = it.width.coerceAtLeast(1) }
                    .pointerInput(position.durationMs) {
                        detectHorizontalDragGestures(
                            onDragStart = { offset ->
                                dragging = true
                                dragFraction = (offset.x / widthPx).coerceIn(0f, 1f)
                            },
                            onDragEnd = {
                                dragging = false
                                if (position.durationMs > 0) onSeek((dragFraction * position.durationMs).toLong())
                            },
                            onDragCancel = { dragging = false },
                            onHorizontalDrag = { change, _ ->
                                change.consume()
                                dragFraction = (change.position.x / widthPx).coerceIn(0f, 1f)
                            },
                        )
                    },
            contentAlignment = Alignment.CenterStart,
        ) {
            val trackHeight = if (dragging) TRACK_HEIGHT_ACTIVE else TRACK_HEIGHT
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(trackHeight)
                    .background(Color.White.copy(alpha = 0.3f), RoundedCornerShape(2.dp)),
            )
            Box(
                Modifier
                    .fillMaxWidth(bufferedFraction)
                    .height(trackHeight)
                    .background(Color.White.copy(alpha = 0.45f), RoundedCornerShape(2.dp)),
            )
            Box(
                Modifier
                    .fillMaxWidth(shownFraction)
                    .height(trackHeight)
                    .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(2.dp)),
            )
            Box(
                Modifier.fillMaxWidth(shownFraction),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Box(
                    Modifier
                        .width(if (dragging) THUMB_ACTIVE else THUMB)
                        .height(if (dragging) THUMB_ACTIVE else THUMB)
                        .background(Color.White, RoundedCornerShape(50)),
                )
            }
        }
    }
}

/** Small translucent pill button used for mute / next / replay. */
@Composable
fun PillButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .background(Color.Black.copy(alpha = 0.55f), RoundedCornerShape(50))
                .clickable(onClick = onClick)
                .padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
    ) {
        Text(text = text, color = Color.White, style = MaterialTheme.typography.labelLarge)
    }
}

internal fun formatTime(ms: Long): String {
    val totalSeconds = (ms.coerceAtLeast(0L) / MS_PER_SECOND).toInt()
    val minutes = totalSeconds / SECONDS_PER_MINUTE
    val seconds = totalSeconds % SECONDS_PER_MINUTE
    return String.format(Locale.ROOT, "%d:%02d", minutes, seconds)
}

private const val MS_PER_SECOND = 1_000L
private const val SECONDS_PER_MINUTE = 60
private val TOUCH_HEIGHT = 28.dp
private val TRACK_HEIGHT = 3.dp
private val TRACK_HEIGHT_ACTIVE = 6.dp
private val THUMB = 10.dp
private val THUMB_ACTIVE = 16.dp
