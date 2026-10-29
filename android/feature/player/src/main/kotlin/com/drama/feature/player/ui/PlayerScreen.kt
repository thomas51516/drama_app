package com.drama.feature.player.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.compose.ContentFrame
import com.drama.core.ui.component.ErrorMessage
import com.drama.core.ui.component.LoadingIndicator
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.Episode
import com.drama.feature.player.EndOfEpisode
import com.drama.feature.player.PageState
import com.drama.feature.player.PlayerUiState
import com.drama.feature.player.PlayerViewModel
import com.drama.feature.player.engine.PlaybackPosition
import kotlinx.coroutines.flow.distinctUntilChanged

/** Callbacks of the player surface, grouped so the stateless content keeps a short signature. */
data class PlayerActions(
    val onPageSettled: (Int) -> Unit,
    val onTap: () -> Unit,
    val onDoubleTap: (rightHalf: Boolean) -> Unit,
    val onSeek: (Long) -> Unit,
    val onToggleMute: () -> Unit,
    val onNextEpisode: () -> Unit,
    val onReplay: () -> Unit,
    val onBack: () -> Unit,
)

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
        actions =
            PlayerActions(
                onPageSettled = viewModel::onPageSettled,
                onTap = viewModel::onTap,
                onDoubleTap = viewModel::onDoubleTap,
                onSeek = viewModel::onSeekTo,
                onToggleMute = viewModel::onToggleMute,
                onNextEpisode = viewModel::onNextEpisode,
                onReplay = viewModel::onReplay,
                onBack = onBack,
            ),
    )
}

@Composable
fun PlayerContent(
    state: PlayerUiState,
    player: Player?,
    actions: PlayerActions,
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
                        .collect(actions.onPageSettled)
                }
                // Follow programmatic changes (next episode at the end of an episode).
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
                    val isCurrent = page == state.currentIndex
                    EpisodePage(
                        episode = state.episodes[page],
                        pageState = state.pageState(page),
                        player = player.takeIf { isCurrent },
                        isPlaying = state.isPlaying && isCurrent,
                        isMuted = state.isMuted,
                        position = if (isCurrent) state.position else PlaybackPosition(),
                        endOfEpisode = state.endOfEpisode.takeIf { isCurrent },
                        actions = actions,
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
            onClick = actions.onBack,
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
    pageState: PageState,
    player: Player?,
    isPlaying: Boolean,
    isMuted: Boolean,
    position: PlaybackPosition,
    endOfEpisode: EndOfEpisode?,
    actions: PlayerActions,
) {
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .background(Color.Black)
                .pointerInput(actions) {
                    detectTapGestures(
                        onTap = { actions.onTap() },
                        onDoubleTap = { offset -> actions.onDoubleTap(offset.x > size.width / 2) },
                    )
                },
    ) {
        if (player != null) {
            ContentFrame(
                player = player,
                modifier = Modifier.fillMaxSize(),
                // Contenu 9:16 : on remplit l'écran (léger rognage latéral sur les écrans 20:9), comme ReelShort.
                contentScale = ContentScale.Crop,
            )
        }

        when (pageState) {
            is PageState.Locked -> LockedPlaceholder(episode = episode, coinCost = pageState.coinCost)
            is PageState.Failed ->
                Text(
                    text = pageState.message,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.align(Alignment.Center),
                )
            PageState.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            PageState.Ready, PageState.Idle -> Unit
        }

        if (player != null && !isPlaying && endOfEpisode == null && pageState is PageState.Ready) {
            PauseBadge(modifier = Modifier.align(Alignment.Center))
        }

        endOfEpisode?.let { end ->
            EndOfEpisodeOverlay(
                end = end,
                onNext = actions.onNextEpisode,
                onReplay = actions.onReplay,
                modifier = Modifier.align(Alignment.Center),
            )
        }

        Column(
            modifier =
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Épisode ${episode.index} — ${episode.title}",
                    color = Color.White,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                PillButton(text = if (isMuted) "Muet" else "Son", onClick = actions.onToggleMute)
            }
            Spacer(Modifier.height(DramaSpacing.sm))
            SeekBar(position = position, onSeek = actions.onSeek, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun LockedPlaceholder(
    episode: Episode,
    coinCost: Int?,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .background(Color(0xFF14141C))
                .padding(DramaSpacing.lg),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = "🔒", fontSize = 48.sp)
        Spacer(Modifier.height(DramaSpacing.md))
        Text(
            text = "Épisode verrouillé — paywall au sprint 7",
            color = Color.White,
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(DramaSpacing.sm))
        Text(
            text =
                buildString {
                    append("Épisode ${episode.index}")
                    coinCost?.let { append(" · $it pièces") }
                },
            color = Color.White.copy(alpha = 0.7f),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun EndOfEpisodeOverlay(
    end: EndOfEpisode,
    onNext: () -> Unit,
    onReplay: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(12.dp))
                .padding(DramaSpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
    ) {
        if (end.nextIndex != null) {
            Text("Épisode suivant dans ${end.countdownSeconds} s", color = Color.White)
            PillButton(text = "Épisode suivant ▶", onClick = onNext)
        } else {
            Text("Fin de la série", color = Color.White)
            PillButton(text = "Revoir", onClick = onReplay)
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
