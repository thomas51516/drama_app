package com.drama.core.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

private val DarkColorScheme =
    darkColorScheme(
        primary = DramaColors.Emerald,
        onPrimary = DramaColors.OnInk,
        primaryContainer = DramaColors.EmeraldDark,
        onPrimaryContainer = DramaColors.OnInk,
        secondary = DramaColors.Gold,
        onSecondary = DramaColors.Ink,
        tertiary = DramaColors.Success,
        onTertiary = DramaColors.Ink,
        background = DramaColors.Ink,
        onBackground = DramaColors.OnInk,
        surface = DramaColors.Ink,
        onSurface = DramaColors.OnInk,
        surfaceVariant = DramaColors.SurfaceHigh,
        onSurfaceVariant = DramaColors.Muted,
        surfaceContainer = DramaColors.Surface,
        surfaceContainerLow = DramaColors.Surface,
        surfaceContainerHigh = DramaColors.SurfaceHigh,
        surfaceContainerHighest = DramaColors.SurfaceHigher,
        outline = DramaColors.Outline,
        outlineVariant = DramaColors.Outline,
        error = DramaColors.Error,
        onError = DramaColors.Ink,
        scrim = DramaColors.Scrim,
    )

private val DramaShapes =
    Shapes(
        extraSmall = RoundedCornerShape(6.dp),
        small = RoundedCornerShape(10.dp),
        medium = RoundedCornerShape(14.dp),
        large = RoundedCornerShape(20.dp),
        extraLarge = RoundedCornerShape(28.dp),
    )

/**
 * Material 3 theme. A vertical-video app lives in the dark: the scheme is always dark, whatever the
 * system setting, so posters and the player read the same everywhere ([forceDark] is kept for API stability).
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun DramaTheme(
    forceDark: Boolean = true,
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = DramaTypography,
        shapes = DramaShapes,
        content = content,
    )
}
