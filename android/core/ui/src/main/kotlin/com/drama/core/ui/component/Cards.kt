package com.drama.core.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing

/**
 * Vertical 2:3 poster card used on every home row. [progress] (0..1) draws the continue-watching bar and
 * [badge] a small label over the poster (episode number, "Nouveau", ...).
 */
@Composable
fun PosterCard(
    title: String,
    imageUrl: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    badge: String? = null,
    progress: Float? = null,
    width: Dp = DramaSizes.posterCardWidth,
) {
    Column(
        modifier =
            modifier
                .width(width)
                .clip(RoundedCornerShape(DramaSizes.posterCornerRadius))
                .clickable(onClick = onClick),
    ) {
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(POSTER_RATIO)
                    .clip(RoundedCornerShape(DramaSizes.posterCornerRadius)),
        ) {
            PosterImage(url = imageUrl, contentDescription = title, modifier = Modifier.fillMaxSize())
            if (badge != null) {
                Text(
                    text = badge,
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White,
                    modifier =
                        Modifier
                            .align(Alignment.TopStart)
                            .padding(DramaSpacing.xs)
                            .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(6.dp))
                            .padding(horizontal = DramaSpacing.sm, vertical = DramaSpacing.xxs),
                )
            }
            if (progress != null) {
                BottomScrim()
                LinearProgressIndicator(
                    progress = { progress },
                    color = MaterialTheme.colorScheme.primary,
                    trackColor = Color.White.copy(alpha = 0.3f),
                    drawStopIndicator = {},
                    gapSize = 0.dp,
                    modifier =
                        Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .height(3.dp),
                )
            }
        }
        Spacer(Modifier.height(DramaSpacing.xs))
        Text(
            text = title,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 2,
            minLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = DramaSpacing.xxs),
        )
        if (subtitle != null) {
            Text(
                text = subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = DramaSpacing.xxs),
            )
        }
    }
}

/** Dark gradient at the bottom of a poster so white text stays readable. */
@Composable
fun BoxScope.BottomScrim(
    modifier: Modifier = Modifier,
    heightFraction: Float = 0.5f,
) {
    Box(
        modifier =
            modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .fillMaxHeight(heightFraction)
                .background(
                    Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f))),
                ),
    )
}

private const val POSTER_RATIO = 2f / 3f
