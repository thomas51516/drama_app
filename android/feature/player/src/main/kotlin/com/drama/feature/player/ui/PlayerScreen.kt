package com.drama.feature.player.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.activity.compose.LocalActivity
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
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
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
import androidx.compose.runtime.remember
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.traversalIndex
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
import com.drama.core.ads.ActivityAdHost
import com.drama.core.player.engine.PlaybackPosition
import com.drama.core.ui.component.ErrorMessage
import com.drama.core.ui.component.LoadingIndicator
import com.drama.core.ui.share.shareText
import com.drama.core.ui.text.UiText
import com.drama.core.ui.text.asString
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.core.ui.window.SecureWindow
import com.drama.domain.model.AdUiHost
import com.drama.domain.model.Episode
import com.drama.domain.model.SecureScreenRules
import com.drama.feature.player.EndOfEpisode
import com.drama.feature.player.PageState
import com.drama.feature.player.PaywallEvent
import com.drama.feature.player.PaywallUiState
import com.drama.feature.player.PaywallViewModel
import com.drama.feature.player.PlayerUiState
import com.drama.feature.player.PlayerViewModel
import com.drama.feature.player.R
import kotlinx.coroutines.flow.distinctUntilChanged
import com.drama.core.ui.R as CoreR

/** Callbacks of the player surface, grouped so the stateless content keeps a short signature. */
data class PlayerActions(
    val onPageSettled: (Int) -> Unit,
    val onTap: () -> Unit,
    val onDoubleTap: (rightHalf: Boolean) -> Unit,
    val onSeek: (Long) -> Unit,
    val onToggleMute: () -> Unit,
    val onNextEpisode: () -> Unit,
    /** Episode picker sheet: jump to another episode without leaving the player. */
    val onJumpToEpisode: (Int) -> Unit,
    val onReplay: () -> Unit,
    val onBack: () -> Unit,
    /** Returns the text to share, or null when nothing is loaded (M-16). */
    val onShare: () -> String?,
    /** "Débloquer" on a locked page whose paywall was closed (M-20). */
    val onOpenPaywall: () -> Unit,
    val settings: SettingsActions,
)

@Composable
fun PlayerScreen(
    onBack: () -> Unit,
    onOpenShop: (tab: String, missingCoins: Int) -> Unit,
    viewModel: PlayerViewModel = hiltViewModel(),
    paywallViewModel: PaywallViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val player by viewModel.activePlayer.collectAsStateWithLifecycle()
    val paywall by paywallViewModel.uiState.collectAsStateWithLifecycle()
    val activity = LocalActivity.current
    val adHost: AdUiHost? = remember(activity) { activity?.let(::ActivityAdHost) }

    // M-18: screenshots and recordings are blocked as soon as the episode on screen is not free.
    SecureWindow(secure = SecureScreenRules.shouldSecure(state.currentEpisode?.access))

    // Pause when the screen leaves the foreground, resume when it comes back (release happens in onCleared).
    LifecycleStartEffect(Unit) {
        viewModel.onForeground()
        onStopOrDispose { viewModel.onBackground() }
    }
    // The player decides when the paywall shows; the paywall view model owns balance, unlock and auto-unlock.
    LaunchedEffect(state.paywall) {
        state.paywall?.let(paywallViewModel::show)
    }
    LaunchedEffect(paywallViewModel) {
        paywallViewModel.events.collect { event ->
            when (event) {
                is PaywallEvent.Unlocked -> viewModel.onEpisodeUnlocked(event.episodeId)
                is PaywallEvent.SeriesUnlocked -> viewModel.onSeriesUnlocked(event.currentEpisodeId, event.episodeIds)
                is PaywallEvent.OpenShop -> onOpenShop(event.tab, event.missingCoins)
            }
        }
    }

    PlayerContent(
        state = state,
        player = player,
        paywall = paywall.takeIf { state.paywall != null },
        paywallActions =
            PaywallActions(
                onUnlock = paywallViewModel::onUnlock,
                onBecomeVip = paywallViewModel::onBecomeVip,
                onRecharge = paywallViewModel::onRecharge,
                onAutoUnlockChanged = paywallViewModel::onAutoUnlockChanged,
                onDismiss = viewModel::onPaywallDismissed,
                onWatchAd = { adHost?.let(paywallViewModel::onWatchAd) },
                onUnlockAll = paywallViewModel::onUnlockAllRequested,
                onUnlockAllConfirmed = paywallViewModel::onUnlockAllConfirmed,
                onUnlockAllDismissed = paywallViewModel::onUnlockAllDismissed,
            ),
        onFakeAdFinished = paywallViewModel::onFakeAdFinished,
        actions =
            PlayerActions(
                onPageSettled = viewModel::onPageSettled,
                onTap = viewModel::onTap,
                onDoubleTap = viewModel::onDoubleTap,
                onSeek = viewModel::onSeekTo,
                onToggleMute = viewModel::onToggleMute,
                onNextEpisode = viewModel::onNextEpisode,
                onJumpToEpisode = viewModel::onJumpToEpisode,
                onReplay = viewModel::onReplay,
                onBack = onBack,
                onShare = viewModel::onShare,
                onOpenPaywall = viewModel::onOpenPaywall,
                settings =
                    SettingsActions(
                        onSpeedSelected = viewModel::onSpeedSelected,
                        onQualitySelected = viewModel::onQualitySelected,
                        onSubtitleSelected = viewModel::onSubtitleSelected,
                    ),
            ),
    )
}

/**
 * Stateless player. TalkBack order (S06-A1-03): top bar (back, episode, chips, share, settings), then the video
 * surface of the current page (custom actions for play/pause and ±10 s), then the bottom block (title, mute,
 * seek bar). Every text comes from resources (S05-A2-03).
 */
@Composable
fun PlayerContent(
    state: PlayerUiState,
    player: Player?,
    actions: PlayerActions,
    modifier: Modifier = Modifier,
    paywall: PaywallUiState? = null,
    paywallActions: PaywallActions? = null,
    onFakeAdFinished: (Boolean) -> Unit = {},
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
            state.episodes.isEmpty() ->
                ErrorMessage(state.errorMessage?.asString() ?: stringResource(R.string.player_no_episodes))
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
        val context = LocalContext.current
        PlayerTopBar(
            state = state,
            onBack = actions.onBack,
            onShare = { actions.onShare()?.let { text -> context.shareText(text) } },
            onOpenSheet = { sheet = it },
            modifier =
                Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth()
                    // Drawn last (over the pager) but read first.
                    .semantics {
                        isTraversalGroup = true
                        traversalIndex = TOP_BAR_TRAVERSAL_INDEX
                    },
        )
        state.errorMessage?.takeIf { state.episodes.isNotEmpty() }?.let { message ->
            Text(
                text = message.asString(),
                color = MaterialTheme.colorScheme.error,
                modifier =
                    Modifier
                        .align(Alignment.Center)
                        .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(8.dp))
                        .padding(DramaSpacing.md)
                        .semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        sheet?.let { open ->
            PlayerSettingsSheet(
                sheet = open,
                state = state,
                actions = actions.settings,
                onJumpToEpisode = {
                    actions.onJumpToEpisode(it)
                    sheet = null
                },
                onNavigate = { sheet = it },
                onDismiss = { sheet = null },
            )
        }
        // M-20: the paywall sits in the lower band; the (paused or ended) video above stays whole.
        if (paywall != null && paywallActions != null) {
            PaywallSheet(
                state = paywall,
                actions = paywallActions,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
            if (paywall.confirmUnlockAll) {
                paywall.unlockAll?.let { quote ->
                    UnlockAllDialog(
                        quote = quote,
                        onConfirm = paywallActions.onUnlockAllConfirmed,
                        onDismiss = paywallActions.onUnlockAllDismissed,
                    )
                }
            }
            // M-22 (debug): the simulated rewarded ad covers everything until its countdown ends.
            paywall.fakeAd?.let { prompt -> FakeAdOverlay(prompt = prompt, onFinished = onFakeAdFinished) }
        }
    }
}

/** Back arrow, episode label and the live settings (speed, quality, subtitles) as tappable chips. */
@Composable
private fun PlayerTopBar(
    state: PlayerUiState,
    onBack: () -> Unit,
    onShare: () -> Unit,
    onOpenSheet: (PlayerSheet) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.6f), Color.Transparent)))
                .statusBarsPadding()
                // Minimum, not fixed: the title must not clip at 200 % font scale.
                .heightIn(min = TOP_BAR_HEIGHT)
                .padding(horizontal = DramaSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(CoreR.string.action_back),
                tint = Color.White,
            )
        }
        Text(
            text = state.currentEpisode?.let { stringResource(CoreR.string.episode_number, it.index) } ?: "",
            color = Color.White,
            style = MaterialTheme.typography.titleSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (state.episodes.isNotEmpty()) {
            val qualityText = state.qualityText()
            val subtitleText = state.subtitleText()
            SettingChip(
                text = state.speedLabel,
                contentDescription = stringResource(R.string.player_speed_chip_description, state.speedLabel),
                onClick = { onOpenSheet(PlayerSheet.SPEED) },
            )
            SettingChip(
                text = qualityText,
                contentDescription = stringResource(R.string.player_quality_chip_description, qualityText),
                onClick = { onOpenSheet(PlayerSheet.QUALITY) },
            )
            SettingChip(
                text =
                    stringResource(
                        R.string.player_subtitles_chip,
                        state.subtitleCode ?: stringResource(R.string.player_subtitles_off_short),
                    ),
                contentDescription = stringResource(R.string.player_subtitles_chip_description, subtitleText),
                active = state.activeSubtitleLanguage != null,
                onClick = { onOpenSheet(PlayerSheet.SUBTITLES) },
            )
            IconButton(onClick = { onOpenSheet(PlayerSheet.EPISODES) }) {
                Icon(
                    Icons.AutoMirrored.Filled.List,
                    contentDescription = stringResource(R.string.player_episodes_button),
                    tint = Color.White,
                )
            }
            IconButton(onClick = onShare) {
                Icon(
                    Icons.Default.Share,
                    contentDescription = stringResource(R.string.player_share_series),
                    tint = Color.White,
                )
            }
            IconButton(onClick = { onOpenSheet(PlayerSheet.SETTINGS) }) {
                Icon(
                    Icons.Default.Settings,
                    contentDescription = stringResource(R.string.player_settings_title),
                    tint = Color.White,
                )
            }
        }
    }
}

/** Compact pill in the top bar; the visible pill keeps its size, the touch target is at least 48 dp tall. */
@Composable
private fun SettingChip(
    text: String,
    contentDescription: String,
    onClick: () -> Unit,
    active: Boolean = false,
) {
    Box(
        modifier =
            Modifier
                .heightIn(min = DramaSizes.touchTarget)
                .clickable(onClick = onClick, role = Role.Button)
                .semantics { this.contentDescription = contentDescription }
                .padding(horizontal = DramaSpacing.xxs),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = Color.White,
            style = MaterialTheme.typography.labelMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier =
                Modifier
                    .background(
                        if (active) {
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.85f)
                        } else {
                            Color.White.copy(alpha = 0.16f)
                        },
                        RoundedCornerShape(50),
                    ).padding(
                        horizontal = DramaSpacing.sm + DramaSpacing.xxs,
                        vertical = DramaSpacing.xs + DramaSpacing.xxs,
                    ),
        )
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
    val surfaceDescription = stringResource(R.string.player_surface_description, episode.index)
    val playbackState =
        stringResource(if (isPlaying) R.string.player_state_playing else R.string.player_state_paused)
    val playPauseLabel = stringResource(if (isPlaying) R.string.player_action_pause else R.string.player_action_play)
    val forwardLabel = UiText.Plural(R.plurals.player_action_forward, SEEK_STEP_SECONDS).asString()
    val rewindLabel = UiText.Plural(R.plurals.player_action_rewind, SEEK_STEP_SECONDS).asString()
    Box(
        modifier =
            Modifier
                .fillMaxSize()
                .background(Color.Black)
                // TalkBack controls playback through custom actions, no double-tap gesture needed.
                .semantics {
                    contentDescription = surfaceDescription
                    stateDescription = playbackState
                    customActions =
                        listOf(
                            CustomAccessibilityAction(playPauseLabel) {
                                actions.onTap()
                                true
                            },
                            CustomAccessibilityAction(forwardLabel) {
                                actions.onDoubleTap(true)
                                true
                            },
                            CustomAccessibilityAction(rewindLabel) {
                                actions.onDoubleTap(false)
                                true
                            },
                        )
                }.pointerInput(actions) {
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
                // Whole frame, never cropped: thin letterbox bands on 20:9 screens where the controls sit (like TikTok).
                contentScale = ContentScale.Fit,
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
            is PageState.Locked ->
                LockedPlaceholder(episode = episode, coinCost = pageState.coinCost, onUnlock = actions.onOpenPaywall)
            is PageState.Failed ->
                Text(
                    text = pageState.message.asString(),
                    color = MaterialTheme.colorScheme.error,
                    modifier =
                        Modifier
                            .align(Alignment.Center)
                            .semantics { liveRegion = LiveRegionMode.Polite },
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
                    text = stringResource(R.string.player_episode_title, episode.index, episode.title),
                    color = Color.White,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                PillButton(
                    text = stringResource(if (isMuted) R.string.player_muted else R.string.player_sound),
                    contentDescription = stringResource(if (isMuted) R.string.player_unmute else R.string.player_mute),
                    onClick = actions.onToggleMute,
                )
            }
            Spacer(Modifier.height(DramaSpacing.sm))
            SeekBar(position = position, onSeek = actions.onSeek, modifier = Modifier.fillMaxWidth())
        }
    }
}

/** Locked page behind the paywall sheet (M-20): lock, episode, cost and a button reopening the sheet. */
@Composable
private fun LockedPlaceholder(
    episode: Episode,
    coinCost: Int?,
    onUnlock: () -> Unit,
) {
    val episodeLabel = stringResource(CoreR.string.episode_number, episode.index)
    val detail =
        coinCost?.let { cost ->
            stringResource(
                R.string.player_locked_episode_cost,
                episodeLabel,
                UiText.Plural(CoreR.plurals.coin_count, cost).asString(),
            )
        } ?: episodeLabel
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .background(Color(0xFF14141C))
                .padding(DramaSpacing.lg)
                // The sheet takes the lower band: keep the message in the upper part of the page.
                .padding(bottom = LOCKED_BOTTOM_INSET),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.semantics(mergeDescendants = true) {},
        ) {
            // Decorative glyph: the title carries the meaning.
            Text(text = LOCK_GLYPH, fontSize = 48.sp, modifier = Modifier.clearAndSetSemantics {})
            Spacer(Modifier.height(DramaSpacing.md))
            Text(
                text = stringResource(R.string.player_locked_title),
                color = Color.White,
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(DramaSpacing.sm))
            Text(
                text = detail,
                color = Color.White.copy(alpha = 0.7f),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(DramaSpacing.md))
        PillButton(text = stringResource(R.string.player_locked_open), onClick = onUnlock)
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
            Text(
                text = UiText.Plural(R.plurals.player_next_in, end.countdownSeconds).asString(),
                color = Color.White,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
            val next = stringResource(R.string.player_next_episode)
            PillButton(text = next + NEXT_GLYPH, contentDescription = next, onClick = onNext)
        } else {
            Text(
                text = stringResource(R.string.player_end_of_series),
                color = Color.White,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
            PillButton(text = stringResource(R.string.player_replay), onClick = onReplay)
        }
    }
}

/** Decorative: the paused state is announced by the video surface ([EpisodePage] `stateDescription`). */
@Composable
private fun PauseBadge(modifier: Modifier = Modifier) {
    Box(
        modifier =
            modifier
                .size(72.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.55f))
                .clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        Text(text = PLAY_GLYPH, color = Color.White, fontSize = 32.sp)
    }
}

/**
 * One-line startup measurement (S01-A2-01 spike instrumentation), kept discreet under the top bar.
 * Developer information: not translated, hidden from accessibility services.
 */
@Composable
private fun StartupBadge(
    state: PlayerUiState,
    modifier: Modifier = Modifier,
) {
    val last = state.lastStartup ?: return
    val mode = stringResource(if (last.wasPreloaded) R.string.player_debug_preloaded else R.string.player_debug_cold)
    Text(
        text =
            stringResource(
                R.string.player_debug_startup,
                last.startupMs,
                mode,
                state.currentIndex + 1,
                state.episodes.size,
            ),
        color = Color(0xFFB9F6CA),
        fontSize = 10.sp,
        fontFamily = FontFamily.Monospace,
        modifier =
            modifier
                .background(Color.Black.copy(alpha = 0.45f), RoundedCornerShape(6.dp))
                .padding(horizontal = DramaSpacing.sm, vertical = DramaSpacing.xxs)
                .clearAndSetSemantics {},
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
        // Status and navigation bars stay visible (owner's request, like TikTok).
        controller?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller?.show(WindowInsetsCompat.Type.systemBars())
        onDispose { controller?.show(WindowInsetsCompat.Type.systemBars()) }
    }
}

private tailrec fun Context.findActivity(): Activity? =
    when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }

/** Minimum height of the top bar; it grows with the font scale. */
private val TOP_BAR_HEIGHT = 48.dp
private val SUBTITLE_BOTTOM_INSET = 112.dp
private val LOCKED_BOTTOM_INSET = 160.dp
private const val TOP_BAR_TRAVERSAL_INDEX = -1f
private val SEEK_STEP_SECONDS = (PlayerViewModel.SEEK_STEP_MS / 1_000L).toInt()
private const val LOCK_GLYPH = "🔒"
private const val PLAY_GLYPH = "▶"
private const val NEXT_GLYPH = " ▶"
