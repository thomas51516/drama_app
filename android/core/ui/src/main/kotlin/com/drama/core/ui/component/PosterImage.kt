package com.drama.core.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.painter.ColorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.drama.core.ui.theme.DramaSpacing

/**
 * Poster or banner loaded with Coil: tinted placeholder while loading, 250 ms crossfade, and the title as a
 * fallback when the URL is missing or fails (the dev catalogue has few real posters).
 */
@Composable
fun PosterImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    fallbackText: String? = contentDescription,
) {
    val placeholderColor = MaterialTheme.colorScheme.surfaceContainerHigh
    Box(modifier = modifier.background(placeholderColor), contentAlignment = Alignment.Center) {
        if (!fallbackText.isNullOrBlank()) {
            Text(
                text = fallbackText,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(DramaSpacing.sm),
            )
        }
        if (!url.isNullOrBlank()) {
            AsyncImage(
                model =
                    ImageRequest
                        .Builder(LocalContext.current)
                        .data(url)
                        .crossfade(CROSSFADE_MS)
                        .build(),
                contentDescription = contentDescription,
                contentScale = contentScale,
                placeholder = ColorPainter(placeholderColor),
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

private const val CROSSFADE_MS = 250
