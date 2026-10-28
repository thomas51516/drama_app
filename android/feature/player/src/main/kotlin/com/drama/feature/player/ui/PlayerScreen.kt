package com.drama.feature.player.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.compose.ContentFrame
import com.drama.core.ui.component.ErrorMessage
import com.drama.core.ui.component.LoadingIndicator
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.Episode
import com.drama.feature.player.PlayerUiState
import com.drama.feature.player.PlayerViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.isActive

@Composable
fun PlayerScreen(
    onBack: () -> Unit,
    viewModel: PlayerViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val player by viewModel.activePlayer.collectAsStateWithLifecycle()

    // Pause when the screen leaves the foreground, resume when it comes back (release happens in onCleared).
    LifecycleStartEffect(Unit) {
        viewModel.onForeground()
        onStopOrDispose { viewModel.onBackground() }
    }

    PlayerContent(
        state = state,
        player = player,
        onPageSettled = viewModel::onPageSettled,
        onTap = viewModel::onTap,
        onBack = onBack,
    )
}

@Composable
fun PlayerContent(
    state: PlayerUiState,
    player: Player?,
    onPageSettled: (Int) -> Unit,
    onTap: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    KeepScreenOn(enabled = state.isPlaying)
    ImmersiveSystemBars()

    Box(
        modifier =
            modifier
                .fillMaxSize()
                .background(Color.Black),
    ) {
        when {
            state.isLoading -> LoadingIndicator()
            state.episodes.isEmpty() -> ErrorMessage(state.errorMessage ?: "Aucun épisode")
            else -> {
                val pagerState = rememberPagerState(initialPage = state.currentIndex) { state.episodes.size }
                LaunchedEffect(pagerState) {
                    snapshotFlow { pagerState.settledPage }
                        .distinctUntilChanged()
                        .collect(onPageSettled)
                }
                // Follow programmatic changes (auto-advance at the end of an episode).
                LaunchedEffect(state.currentIndex) {
                    if (pagerState.settledPage != state.currentIndex && !pagerState.isScrollInProgress) {
                        pagerState.animateScrollToPage(state.currentIndex)
                    }
                }
                VerticalPager(
                    state = pagerState,
                    beyondViewportPageCount = 1,
                    modifier = Modifier.fillMaxSize(),
                ) { page ->
                    EpisodePage(
                        episode = state.episodes[page],
                        player = player.takeIf { page == state.currentIndex },
                        isPlaying = state.isPlaying && page == state.currentIndex,
                        onTap = onTap,
                    )
                }
                DebugOverlay(
                    state = state,
                    modifier =
                        Modifier
                            .align(Alignment.TopStart)
                            .statusBarsPadding()
                            .padding(DramaSpacing.sm),
                )
            }
        }
        TextButton(
            onClick = onBack,
            modifier =
                Modifier
                    .align(Alignment.TopEnd)
                    .statusBarsPadding(),
        ) {
            Text("Fermer", color = Color.White)
        }
        state.errorMessage?.takeIf { state.episodes.isNotEmpty() }?.let { message ->
            Text(
                text = message,
                color = MaterialTheme.colorScheme.error,
                modifier =
                    Modifier
                        .align(Alignment.Center)
                        .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(8.dp))
                        .padding(DramaSpacing.md),
            )
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun EpisodePage(
    episode: Episode,
    player: Player?,
    isPlaying: Boolean,
    onTap: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .background(Color.Black)
                .clickable(interactionSource = interactionSource, indication = null, onClick = onTap),
    ) {
        if (player != null) {
            ContentFrame(
                player = player,
                modifier = Modifier.fillMaxSize(),
                // Contenu 9:16 : on remplit l'écran (léger rognage latéral sur les écrans 20:9), comme ReelShort.
                contentScale = ContentScale.Crop,
            )
        }

        if (player != null && !isPlaying) {
            PauseBadge(modifier = Modifier.align(Alignment.Center))
        }

        val progress by rememberPlaybackProgress(player)
        Column(
            modifier =
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
        ) {
            Text(
                text = "Épisode ${episode.index} — ${episode.title}",
                color = Color.White,
                style = MaterialTheme.typography.titleMedium,
            )
            LinearProgressIndicator(
                progress = { progress },
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(top = DramaSpacing.sm),
                color = MaterialTheme.colorScheme.primary,
                trackColor = Color.White.copy(alpha = 0.3f),
            )
        }
    }
}

@Composable
private fun PauseBadge(modifier: Modifier = Modifier) {
    Box(
        modifier =
            modifier
                .size(72.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.55f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = "▶", color = Color.White, fontSize = 32.sp)
    }
}

@Composable
private fun DebugOverlay(
    state: PlayerUiState,
    modifier: Modifier = Modifier,
) {
    val last = state.lastStartup
    val lines =
        buildList {
            add("PlayerSpike — ép. ${state.currentIndex + 1}/${state.episodes.size}")
            add(
                last?.let {
                    val mode = if (it.wasPreloaded) "préchargé" else "à froid"
                    "1re image : ${it.startupMs} ms ($mode)" + (it.readyMs?.let { r -> " · READY $r ms" } ?: "")
                } ?: "1re image : …",
            )
            add("préchargés : ${state.preloadedIndices.sorted().map { it + 1 }.ifEmpty { listOf("aucun") }}")
            add("état : ${if (state.isPlaying) "lecture" else "pause"}")
            if (state.startupMetrics.size > 1) {
                add(
                    "historique : " +
                        state.startupMetrics.joinToString(" · ") { "ép.${it.index + 1} ${it.startupMs} ms" },
                )
            }
        }
    Column(
        modifier =
            modifier
                .background(Color.Black.copy(alpha = 0.55f), RoundedCornerShape(6.dp))
                .padding(DramaSpacing.sm),
    ) {
        lines.forEach { line ->
            Text(text = line, color = Color(0xFFB9F6CA), fontSize = 11.sp, fontFamily = FontFamily.Monospace)
        }
    }
}

/** Polls the player position four times per second while attached. Player calls stay on the main thread. */
@Composable
private fun rememberPlaybackProgress(player: Player?): State<Float> {
    val progress = remember { mutableFloatStateOf(0f) }
    LaunchedEffect(player) {
        if (player == null) {
            progress.floatValue = 0f
            return@LaunchedEffect
        }
        while (isActive) {
            val duration = player.duration
            progress.floatValue =
                if (duration > 0 && duration != C.TIME_UNSET) {
                    (player.currentPosition.toFloat() / duration).coerceIn(0f, 1f)
                } else {
                    0f
                }
            delay(PROGRESS_POLL_MS)
        }
    }
    return progress
}

@Composable
private fun KeepScreenOn(enabled: Boolean) {
    val view = LocalView.current
    DisposableEffect(view, enabled) {
        view.keepScreenOn = enabled
        onDispose { view.keepScreenOn = false }
    }
}

@Composable
private fun ImmersiveSystemBars() {
    val view = LocalView.current
    DisposableEffect(view) {
        val window = view.context.findActivity()?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        controller?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller?.hide(WindowInsetsCompat.Type.systemBars())
        onDispose { controller?.show(WindowInsetsCompat.Type.systemBars()) }
    }
}

private tailrec fun Context.findActivity(): Activity? =
    when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }

private const val PROGRESS_POLL_MS = 250L
