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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.drama.core.ui.R
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import kotlin.math.roundToInt

/**
 * Vertical 2:3 poster card used on every home row. [progress] (0..1) draws the continue-watching bar and
 * [badge] a small label over the poster (episode number, "Nouveau", ...).
 *
 * Accessibility (S06-A1-03): one button node reading title, subtitle and, when a progress bar is shown, the
 * progress as a state description. The badge duplicates the subtitle and the image the title, so both are
 * left out of the merged node. The height follows the text so a 200 % font scale never clips.
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
    val progressDescription =
        progress?.let { stringResource(R.string.progress_percent, (it * PERCENT).roundToInt().coerceIn(0, PERCENT)) }
    Column(
        modifier =
            modifier
                .width(width)
                .clip(RoundedCornerShape(DramaSizes.posterCornerRadius))
                .clickable(onClick = onClick, role = Role.Button)
                .semantics(mergeDescendants = true) {
                    if (progressDescription != null) stateDescription = progressDescription
                },
    ) {
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(POSTER_RATIO)
                    .clip(RoundedCornerShape(DramaSizes.posterCornerRadius)),
        ) {
            PosterImage(
                url = imageUrl,
                contentDescription = null,
                fallbackText = title,
                modifier = Modifier.fillMaxSize(),
            )
            if (badge != null) {
                Text(
                    text = badge,
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier =
                        Modifier
                            .align(Alignment.TopStart)
                            .padding(DramaSpacing.xs)
                            .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(6.dp))
                            .padding(horizontal = DramaSpacing.sm, vertical = DramaSpacing.xxs)
                            .clearAndSetSemantics {},
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
                            .height(3.dp)
                            .clearAndSetSemantics {},
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
private const val PERCENT = 100
