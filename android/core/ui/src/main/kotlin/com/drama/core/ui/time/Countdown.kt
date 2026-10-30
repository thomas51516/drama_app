package com.drama.core.ui.time

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import java.util.Locale

/** Milliseconds left until [deadlineEpochMs], refreshed every second; 0 once passed. */
@Composable
fun rememberRemainingMs(deadlineEpochMs: Long?): Long {
    var remaining by remember(deadlineEpochMs) {
        mutableLongStateOf(deadlineEpochMs?.let { (it - System.currentTimeMillis()).coerceAtLeast(0L) } ?: 0L)
    }
    LaunchedEffect(deadlineEpochMs) {
        if (deadlineEpochMs == null) return@LaunchedEffect
        while (true) {
            remaining = (deadlineEpochMs - System.currentTimeMillis()).coerceAtLeast(0L)
            if (remaining == 0L) break
            delay(TICK_MS)
        }
    }
    return remaining
}

/** `1 j 04 h`, `04 h 12 min`, `12:34` depending on the magnitude; locale-neutral digits. */
fun formatRemaining(remainingMs: Long): String {
    val totalSeconds = remainingMs / MS_PER_SECOND
    val days = totalSeconds / SECONDS_PER_DAY
    val hours = (totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR
    val minutes = (totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE
    val seconds = totalSeconds % SECONDS_PER_MINUTE
    return when {
        days > 0 -> String.format(Locale.ROOT, "%d j %02d h", days, hours)
        hours > 0 -> String.format(Locale.ROOT, "%d h %02d min", hours, minutes)
        else -> String.format(Locale.ROOT, "%02d:%02d", minutes, seconds)
    }
}

private const val TICK_MS = 1_000L
private const val MS_PER_SECOND = 1_000L
private const val SECONDS_PER_MINUTE = 60L
private const val SECONDS_PER_HOUR = 3_600L
private const val SECONDS_PER_DAY = 86_400L
