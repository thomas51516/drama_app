package com.drama.feature.player.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
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
    val settings: SettingsActions,
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
                settings =
                    SettingsActions(
                        onSpeedSelected = viewModel::onSpeedSelected,
                        onQualitySelected = viewModel::onQualitySelected,
                        onSubtitleSelected = viewModel::onSubtitleSelected,
                    ),
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
    var sheet by rememberSaveable { mutableStateOf<PlayerSheet?>(null) }

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
                StartupBadge(
                    state = state,
                    modifier =
                        Modifier
                            .align(Alignment.TopStart)
                            .statusBarsPadding()
                            .padding(top = TOP_BAR_HEIGHT, start = DramaSpacing.sm),
                )
            }
        }
        PlayerTopBar(
            state = state,
            onBack = actions.onBack,
            onOpenSheet = { sheet = it },
            modifier =
                Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth(),
        )
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
        sheet?.let { open ->
            PlayerSettingsSheet(
                sheet = open,
                state = state,
                actions = actions.settings,
                onNavigate = { sheet = it },
                onDismiss = { sheet = null },
            )
        }
    }
}

/** Back arrow, episode label and the live settings (speed, quality, subtitles) as tappable chips. */
@Composable
private fun PlayerTopBar(
    state: PlayerUiState,
    onBack: () -> Unit,
    onOpenSheet: (PlayerSheet) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.6f), Color.Transparent)))
                .statusBarsPadding()
                .height(TOP_BAR_HEIGHT)
                .padding(horizontal = DramaSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour", tint = Color.White)
        }
        Text(
            text = state.currentEpisode?.let { "Épisode ${it.index}" } ?: "",
            color = Color.White,
            style = MaterialTheme.typography.titleSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (state.episodes.isNotEmpty()) {
            SettingChip(text = state.speedLabel, onClick = { onOpenSheet(PlayerSheet.SPEED) })
            SettingChip(text = state.qualityLabel, onClick = { onOpenSheet(PlayerSheet.QUALITY) })
            SettingChip(
                text = "CC ${state.subtitleLabel}",
                active = state.activeSubtitleLanguage != null,
                onClick = { onOpenSheet(PlayerSheet.SUBTITLES) },
            )
            IconButton(onClick = { onOpenSheet(PlayerSheet.SETTINGS) }) {
                Icon(Icons.Default.Settings, contentDescription = "Paramètres de lecture", tint = Color.White)
            }
        }
    }
}

@Composable
private fun SettingChip(
    text: String,
    onClick: () -> Unit,
    active: Boolean = false,
) {
    Text(
        text = text,
        color = Color.White,
        style = MaterialTheme.typography.labelMedium,
        maxLines = 1,
        modifier =
            Modifier
                .padding(horizontal = DramaSpacing.xxs)
                .background(
                    if (active) {
                        MaterialTheme.colorScheme.primary.copy(
                            alpha = 0.85f,
                        )
                    } else {
                        Color.White.copy(alpha = 0.16f)
                    },
                    RoundedCornerShape(50),
                ).clickable(onClick = onClick)
                .padding(
                    horizontal = DramaSpacing.sm + DramaSpacing.xxs,
                    vertical = DramaSpacing.xs + DramaSpacing.xxs,
                ),
    )
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
                // 9:16 content fills the screen (slight side crop on 20:9 screens), like ReelShort.
                contentScale = ContentScale.Crop,
            )
            // Cues sit above the title/seek-bar block and the navigation bar, never under them.
            SubtitleOverlay(
                player = player,
                modifier =
                    Modifier
                        .fillMaxSize()
                        .navigationBarsPadding()
                        .padding(bottom = SUBTITLE_BOTTOM_INSET),
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
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.7f))))
                    .navigationBarsPadding()
                    .padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Épisode ${episode.index} — ${episode.title}",
                    color = Color.White,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
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

/** One-line startup measurement (S01-A2-01 spike instrumentation), kept discreet under the top bar. */
@Composable
private fun StartupBadge(
    state: PlayerUiState,
    modifier: Modifier = Modifier,
) {
    val last = state.lastStartup ?: return
    val mode = if (last.wasPreloaded) "préchargé" else "à froid"
    Text(
        text = "1re image ${last.startupMs} ms · $mode · ${state.currentIndex + 1}/${state.episodes.size}",
        color = Color(0xFFB9F6CA),
        fontSize = 10.sp,
        fontFamily = FontFamily.Monospace,
        modifier =
            modifier
                .background(Color.Black.copy(alpha = 0.45f), RoundedCornerShape(6.dp))
                .padding(horizontal = DramaSpacing.sm, vertical = DramaSpacing.xxs),
    )
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

private val TOP_BAR_HEIGHT = 48.dp
private val SUBTITLE_BOTTOM_INSET = 112.dp
