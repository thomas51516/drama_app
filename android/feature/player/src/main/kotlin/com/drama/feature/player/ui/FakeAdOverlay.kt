package com.drama.feature.player.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.FakeAdPrompt
import com.drama.feature.player.R
import kotlinx.coroutines.delay
import com.drama.core.ui.R as CoreR

/**
 * Simulated rewarded ad (debug builds, M-22): full screen, a countdown of [FakeAdPrompt.durationSeconds] and a
 * close button that only appears once the countdown reached zero, like a real rewarded ad. Back is swallowed
 * while the ad runs; closing early (the X during the countdown does not exist) is only possible through
 * "Quitter la pub" which forfeits the reward.
 */
@Composable
fun FakeAdOverlay(
    prompt: FakeAdPrompt,
    onFinished: (completed: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    var remaining by remember(prompt.request.sessionId) { mutableIntStateOf(prompt.durationSeconds) }
    LaunchedEffect(prompt.request.sessionId) {
        while (remaining > 0) {
            delay(1_000L)
            remaining--
        }
    }
    val completed = remaining == 0
    BackHandler(enabled = true) { if (completed) onFinished(true) }
    Box(
        modifier =
            modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(listOf(Color(0xFF1B1035), Color(0xFF3A0F2E), Color(0xFF0B0B10))),
                ),
    ) {
        Column(
            modifier = Modifier.align(Alignment.Center).padding(DramaSpacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(DramaSpacing.md),
        ) {
            Text(text = AD_GLYPH, fontSize = 64.sp, modifier = Modifier.clearAndSetSemantics {})
            Text(
                text = stringResource(R.string.player_fake_ad_title),
                color = Color.White,
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                textAlign = TextAlign.Center,
            )
            Text(
                text = stringResource(R.string.player_fake_ad_body),
                color = Color.White.copy(alpha = 0.8f),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
            if (!completed) {
                Box(contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(
                        progress = { 1f - remaining.toFloat() / prompt.durationSeconds },
                        modifier = Modifier.size(72.dp),
                        color = MaterialTheme.colorScheme.primary,
                        trackColor = Color.White.copy(alpha = 0.2f),
                    )
                    Text(
                        text = remaining.toString(),
                        color = Color.White,
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
                Text(
                    text = stringResource(R.string.player_fake_ad_countdown, remaining),
                    color = Color.White.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.bodySmall,
                )
            } else {
                Button(
                    onClick = { onFinished(true) },
                    modifier = Modifier.heightIn(min = DramaSizes.touchTarget),
                ) { Text(stringResource(R.string.player_fake_ad_collect)) }
            }
        }
        if (completed) {
            IconButton(
                onClick = { onFinished(true) },
                modifier =
                    Modifier
                        .align(Alignment.TopEnd)
                        .statusBarsPadding()
                        .padding(DramaSpacing.sm)
                        .size(DramaSizes.touchTarget)
                        .background(Color.Black.copy(alpha = 0.45f), CircleShape),
            ) {
                Icon(
                    Icons.Default.Close,
                    contentDescription = stringResource(CoreR.string.action_close),
                    tint = Color.White,
                )
            }
        } else {
            // Leaving early forfeits the reward, like a real rewarded ad.
            TextButton(
                onClick = { onFinished(false) },
                modifier =
                    Modifier
                        .align(Alignment.TopEnd)
                        .statusBarsPadding()
                        .padding(DramaSpacing.sm)
                        .heightIn(min = DramaSizes.touchTarget),
            ) {
                Text(
                    text = stringResource(R.string.player_fake_ad_skip),
                    color = Color.White.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.labelMedium,
                    modifier =
                        Modifier
                            .background(Color.Black.copy(alpha = 0.35f), RoundedCornerShape(50))
                            .padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
                )
            }
        }
        Column(modifier = Modifier.align(Alignment.BottomCenter).padding(DramaSpacing.md)) {
            LinearProgressIndicator(
                progress = { 1f - remaining.toFloat() / prompt.durationSeconds },
                modifier = Modifier.fillMaxWidth().height(3.dp).clearAndSetSemantics {},
                color = MaterialTheme.colorScheme.primary,
                trackColor = Color.White.copy(alpha = 0.2f),
            )
            Spacer(Modifier.height(DramaSpacing.xs))
            Text(
                text = stringResource(R.string.player_fake_ad_debug_label),
                color = Color.White.copy(alpha = 0.5f),
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

private const val AD_GLYPH = "📺"
