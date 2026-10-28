package com.drama.core.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme =
    darkColorScheme(
        primary = DramaColors.Crimson,
        onPrimary = DramaColors.OnInk,
        secondary = DramaColors.Gold,
        onSecondary = DramaColors.Ink,
        background = DramaColors.Ink,
        onBackground = DramaColors.OnInk,
        surface = DramaColors.Surface,
        onSurface = DramaColors.OnInk,
        surfaceVariant = DramaColors.SurfaceHigh,
        onSurfaceVariant = DramaColors.Muted,
        error = DramaColors.Error,
    )

private val LightColorScheme =
    lightColorScheme(
        primary = DramaColors.CrimsonDark,
        secondary = DramaColors.Gold,
        error = DramaColors.Error,
    )

/**
 * Material 3 theme. A video app lives mostly in the dark; [forceDark] keeps the player and the
 * feed dark regardless of the system setting.
 */
@Composable
fun DramaTheme(
    forceDark: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = if (forceDark || isSystemInDarkTheme()) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        typography = DramaTypography,
        content = content,
    )
}
