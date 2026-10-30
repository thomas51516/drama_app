package com.drama.feature.rewards

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.ui.component.DramaPrimaryButton
import com.drama.core.ui.component.ErrorState
import com.drama.core.ui.component.LoadingIndicator
import com.drama.core.ui.text.asString
import com.drama.core.ui.theme.DramaColors
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.CheckInDay
import com.drama.domain.model.CheckInDayState
import com.drama.domain.model.RewardTask
import com.drama.domain.model.RewardTaskStatus
import com.drama.core.ui.R as CoreR

data class RewardsActions(
    val onBack: () -> Unit,
    val onRefresh: () -> Unit,
    val onClaimCheckIn: () -> Unit,
    val onClaimTask: (RewardTask) -> Unit,
    val onClaimAnimationShown: () -> Unit,
)

/** Profil -> "Récompenses" (M-40 / M-41). */
@Composable
fun RewardsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: RewardsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    LaunchedEffect(state.message) {
        val message = state.message ?: return@LaunchedEffect
        viewModel.onMessageShown()
        snackbar.showSnackbar(message.asString(context))
    }
    RewardsContent(
        state = state,
        actions =
            RewardsActions(
                onBack = onBack,
                onRefresh = viewModel::refresh,
                onClaimCheckIn = viewModel::onClaimCheckIn,
                onClaimTask = viewModel::onClaimTask,
                onClaimAnimationShown = viewModel::onClaimAnimationShown,
            ),
        snackbar = snackbar,
        modifier = modifier,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RewardsContent(
    state: RewardsUiState,
    actions: RewardsActions,
    modifier: Modifier = Modifier,
    snackbar: SnackbarHostState = remember { SnackbarHostState() },
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.rewards_title), modifier = Modifier.semantics { heading() }) },
                navigationIcon = {
                    IconButton(onClick = actions.onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(CoreR.string.action_back),
                        )
                    }
                },
                actions = {
                    state.balance?.let { balance ->
                        Text(
                            text = pluralStringResource(CoreR.plurals.coin_count, balance, balance),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onBackground,
                            modifier = Modifier.padding(end = DramaSpacing.md),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when {
                state.isLoading -> LoadingIndicator()
                state.unavailable && state.checkIn == null ->
                    ErrorState(message = stringResource(CoreR.string.state_coming_soon), onRetry = actions.onRefresh)
                state.error != null && state.checkIn == null ->
                    ErrorState(message = state.error.asString(), onRetry = actions.onRefresh)
                else -> RewardsBody(state, actions)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RewardsBody(
    state: RewardsUiState,
    actions: RewardsActions,
) {
    val bottomInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    PullToRefreshBox(isRefreshing = false, onRefresh = actions.onRefresh) {
        LazyColumn(
            contentPadding =
                PaddingValues(
                    start = DramaSpacing.md,
                    end = DramaSpacing.md,
                    bottom = bottomInset + DramaSpacing.xl,
                ),
            verticalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
            modifier = Modifier.fillMaxSize(),
        ) {
            item(key = "checkin") {
                CheckInCard(state = state, onClaim = actions.onClaimCheckIn, onShown = actions.onClaimAnimationShown)
            }
            item(key = "tasks-heading") {
                Text(
                    text = stringResource(R.string.rewards_tasks_heading),
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.padding(top = DramaSpacing.md).semantics { heading() },
                )
            }
            if (state.tasks.isEmpty()) {
                item(key = "tasks-empty") {
                    Text(
                        text = stringResource(R.string.rewards_tasks_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = DramaSpacing.sm),
                    )
                }
            }
            items(state.tasks, key = { it.id }) { task ->
                TaskRow(task = task, busy = state.claimingTaskId == task.id, onClaim = { actions.onClaimTask(task) })
            }
        }
    }
}

/** 7-day strip (M-40): claimed days ticked, today highlighted, next days dimmed; one claim button. */
@Composable
private fun CheckInCard(
    state: RewardsUiState,
    onClaim: () -> Unit,
    onShown: () -> Unit,
) {
    val status = state.checkIn
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainerHigh, RoundedCornerShape(16.dp))
                .padding(DramaSpacing.md),
    ) {
        Text(
            text = stringResource(R.string.rewards_checkin_heading),
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = stringResource(R.string.rewards_checkin_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(DramaSpacing.md))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(DramaSpacing.xs),
        ) {
            state.days.forEach { day ->
                DayCell(
                    day = day,
                    justClaimed = state.justClaimedDay == day.day,
                    onShown = onShown,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        Spacer(Modifier.height(DramaSpacing.md))
        val nextCoins = status?.nextCoins ?: 0
        DramaPrimaryButton(
            text =
                when {
                    state.isClaimingCheckIn -> stringResource(R.string.rewards_claiming)
                    status?.claimedToday == true -> stringResource(R.string.rewards_claimed_today)
                    else ->
                        stringResource(
                            R.string.rewards_claim_coins,
                            pluralStringResource(CoreR.plurals.coin_count, nextCoins, nextCoins),
                        )
                },
            onClick = onClaim,
            enabled = state.canClaimCheckIn,
            modifier = Modifier.fillMaxWidth(),
        )
        if (status?.claimedToday == true) {
            Spacer(Modifier.height(DramaSpacing.xs))
            Text(
                text =
                    stringResource(
                        R.string.rewards_come_back_tomorrow,
                        pluralStringResource(CoreR.plurals.coin_count, nextCoins, nextCoins),
                    ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun DayCell(
    day: CheckInDay,
    justClaimed: Boolean,
    onShown: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // Simple pop (no confetti): the claimed cell scales up then settles.
    val scale by animateFloatAsState(
        targetValue = if (justClaimed) CLAIM_POP_SCALE else 1f,
        animationSpec = tween(CLAIM_POP_MS),
        finishedListener = { if (justClaimed) onShown() },
        label = "checkin-pop",
    )
    val claimed = day.state == CheckInDayState.CLAIMED || day.state == CheckInDayState.CLAIMED_TODAY
    val today = day.state == CheckInDayState.TODAY || day.state == CheckInDayState.CLAIMED_TODAY
    val shape = RoundedCornerShape(10.dp)
    val stateLabel =
        stringResource(
            when (day.state) {
                CheckInDayState.CLAIMED, CheckInDayState.CLAIMED_TODAY -> R.string.rewards_day_claimed
                CheckInDayState.TODAY -> R.string.rewards_day_today
                CheckInDayState.UPCOMING -> R.string.rewards_day_upcoming
            },
        )
    val coinsText = pluralStringResource(CoreR.plurals.coin_count, day.coins, day.coins)
    val description = stringResource(R.string.rewards_day_cd, day.day, coinsText, stateLabel)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier =
            modifier
                .scale(scale)
                .heightIn(min = 64.dp)
                .background(
                    when {
                        today -> DramaColors.CrimsonSoft
                        claimed -> MaterialTheme.colorScheme.surfaceContainerHighest
                        else -> MaterialTheme.colorScheme.surfaceContainer
                    },
                    shape,
                ).then(if (today) Modifier.border(1.dp, MaterialTheme.colorScheme.primary, shape) else Modifier)
                .padding(vertical = DramaSpacing.sm, horizontal = DramaSpacing.xxs)
                .semantics(mergeDescendants = true) { contentDescription = description },
    ) {
        Text(
            text = stringResource(R.string.rewards_day_short, day.day),
            style = MaterialTheme.typography.labelSmall,
            color = if (today) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
        Spacer(Modifier.height(DramaSpacing.xs))
        if (claimed) {
            Icon(
                Icons.Default.Check,
                contentDescription = null,
                tint = DramaColors.Success,
                modifier = Modifier.size(18.dp),
            )
        } else {
            Text(
                text = "+${day.coins}",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                color = if (today) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
            )
        }
    }
}

/** One task (M-41): title, description, progress bar `progress/target`, coins and the claim button. */
@Composable
private fun TaskRow(
    task: RewardTask,
    busy: Boolean,
    onClaim: () -> Unit,
) {
    val shape = RoundedCornerShape(14.dp)
    val coinsText = pluralStringResource(CoreR.plurals.coin_count, task.coins, task.coins)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainerHigh, shape)
                .padding(DramaSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
            Text(
                text = task.title,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onBackground,
            )
            task.description?.let { description ->
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(DramaSpacing.xs))
            LinearProgressIndicator(
                progress = { task.fraction },
                modifier = Modifier.fillMaxWidth(),
                color =
                    if (task.status ==
                        RewardTaskStatus.CLAIMED
                    ) {
                        DramaColors.Success
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
            )
            Spacer(Modifier.height(DramaSpacing.xxs))
            Text(
                text =
                    if (task.target > 0) {
                        stringResource(
                            R.string.rewards_task_progress,
                            task.progress.coerceAtMost(task.target),
                            task.target,
                            coinsText,
                        )
                    } else {
                        coinsText
                    },
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(DramaSpacing.sm))
        when (task.status) {
            RewardTaskStatus.CLAIMABLE ->
                Button(
                    onClick = onClaim,
                    enabled = !busy,
                    modifier = Modifier.heightIn(min = DramaSizes.touchTarget),
                ) {
                    Text(stringResource(if (busy) R.string.rewards_claiming else R.string.rewards_claim))
                }
            RewardTaskStatus.CLAIMED ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Check, contentDescription = null, tint = DramaColors.Success)
                    Spacer(Modifier.width(DramaSpacing.xxs))
                    Text(
                        text = stringResource(R.string.rewards_task_claimed),
                        style = MaterialTheme.typography.labelMedium,
                        color = DramaColors.Success,
                    )
                }
            RewardTaskStatus.LOCKED ->
                Icon(
                    Icons.Default.Lock,
                    contentDescription = stringResource(R.string.rewards_task_locked),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            RewardTaskStatus.AVAILABLE, RewardTaskStatus.UNKNOWN ->
                Text(
                    text = stringResource(R.string.rewards_task_in_progress),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
        }
    }
}

private const val CLAIM_POP_SCALE = 1.15f
private const val CLAIM_POP_MS = 350
