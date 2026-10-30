package com.drama.feature.notifications

import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.ui.component.ErrorState
import com.drama.core.ui.component.LoadingIndicator
import com.drama.core.ui.text.asString
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.AppNotification
import com.drama.domain.model.NotificationRouting
import com.drama.domain.model.NotificationTarget
import com.drama.core.ui.R as CoreR

/** Notification history (M-54, S06-A1-02). */
@Composable
fun NotificationsScreen(
    onBack: () -> Unit,
    onOpenTarget: (NotificationTarget) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: NotificationsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val pendingTarget by viewModel.pendingTarget.collectAsStateWithLifecycle()
    LaunchedEffect(pendingTarget) {
        val target = pendingTarget ?: return@LaunchedEffect
        viewModel.onTargetConsumed()
        // Tapping an entry that routes back to this very screen has nothing to open.
        if (target != NotificationTarget.Notifications) onOpenTarget(target)
    }
    NotificationsContent(
        state = state,
        actions =
            NotificationsActions(
                onBack = onBack,
                onRefresh = viewModel::refresh,
                onRetry = viewModel::retry,
                onLoadMore = viewModel::loadMore,
                onNotificationClicked = viewModel::onNotificationClicked,
            ),
        modifier = modifier,
    )
}

data class NotificationsActions(
    val onBack: () -> Unit = {},
    val onRefresh: () -> Unit = {},
    val onRetry: () -> Unit = {},
    val onLoadMore: () -> Unit = {},
    val onNotificationClicked: (AppNotification) -> Unit = {},
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsContent(
    state: NotificationsUiState,
    actions: NotificationsActions,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .statusBarsPadding(),
    ) {
        TopBar(onBack = actions.onBack)
        when {
            state.isLoading -> LoadingIndicator()
            state.error != null ->
                ErrorState(
                    message = state.error.asString(),
                    onRetry = actions.onRetry,
                )
            else ->
                PullToRefreshBox(
                    isRefreshing = state.isRefreshing,
                    onRefresh = actions.onRefresh,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    if (state.showEmpty) {
                        EmptyState(isComingSoon = state.isComingSoon)
                    } else {
                        NotificationList(state = state, actions = actions)
                    }
                }
        }
    }
}

@Composable
private fun TopBar(onBack: () -> Unit) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = DramaSpacing.xs, vertical = DramaSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(CoreR.string.action_back))
        }
        Text(
            text = stringResource(R.string.notifications_title),
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.semantics { heading() },
        )
    }
}

@Composable
private fun NotificationList(
    state: NotificationsUiState,
    actions: NotificationsActions,
) {
    val listState = rememberLazyListState()
    val lastVisibleIndex by remember {
        derivedStateOf {
            listState.layoutInfo.visibleItemsInfo
                .lastOrNull()
                ?.index ?: -1
        }
    }
    LaunchedEffect(lastVisibleIndex, state.items.size, state.hasMore) {
        if (state.hasMore && lastVisibleIndex >= state.items.lastIndex) actions.onLoadMore()
    }
    LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
        items(state.items, key = { it.id }) { item ->
            NotificationRow(item = item, onClick = { actions.onNotificationClicked(item) })
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
        if (state.isLoadingMore) {
            item(key = "loading-more") {
                Box(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(DramaSpacing.md),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(LOADING_MORE_SIZE), strokeWidth = 2.dp)
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(
    item: AppNotification,
    onClick: () -> Unit,
) {
    val unreadLabel = stringResource(R.string.notifications_unread)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = DramaSizes.touchTarget)
                .clickable(onClick = onClick, role = Role.Button)
                .semantics(mergeDescendants = true) {
                    if (!item.isRead) stateDescription = unreadLabel
                }.padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm + DramaSpacing.xs),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            imageVector = item.icon(),
            contentDescription = null,
            tint = if (item.isRead) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary,
            modifier =
                Modifier
                    .padding(top = DramaSpacing.xxs)
                    .size(ICON_SIZE),
        )
        Spacer(Modifier.width(DramaSpacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = if (item.isRead) FontWeight.Normal else FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (item.body.isNotBlank()) {
                Spacer(Modifier.height(DramaSpacing.xxs))
                Text(
                    text = item.body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            item.sentAtEpochMs?.let { sentAt ->
                Spacer(Modifier.height(DramaSpacing.xs))
                Text(
                    text = relativeTime(sentAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (!item.isRead) {
            Spacer(Modifier.width(DramaSpacing.sm))
            Box(
                modifier =
                    Modifier
                        .padding(top = DramaSpacing.sm)
                        .size(UNREAD_DOT_SIZE)
                        .background(MaterialTheme.colorScheme.primary, CircleShape),
            )
        }
    }
}

@Composable
private fun EmptyState(isComingSoon: Boolean) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(horizontal = DramaSpacing.lg, vertical = DramaSpacing.xl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Outlined.Notifications,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(DramaSizes.touchTarget),
        )
        Spacer(Modifier.height(DramaSpacing.md))
        Text(
            text = stringResource(R.string.notifications_empty_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(DramaSpacing.xs))
        Text(
            text =
                stringResource(
                    if (isComingSoon) R.string.notifications_coming_soon else R.string.notifications_empty_body,
                ),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

private fun AppNotification.icon(): ImageVector =
    when (type) {
        NotificationRouting.TYPE_NEW_EPISODE -> Icons.Default.PlayArrow
        NotificationRouting.TYPE_OFFER, NotificationRouting.TYPE_CAMPAIGN -> Icons.Default.Star
        NotificationRouting.TYPE_CHECKIN_REMINDER -> Icons.Default.Notifications
        NotificationRouting.TYPE_SUPPORT_REPLY -> Icons.Default.Email
        else -> Icons.Default.Info
    }

private fun relativeTime(epochMs: Long): String =
    DateUtils
        .getRelativeTimeSpanString(
            epochMs,
            System.currentTimeMillis(),
            DateUtils.MINUTE_IN_MILLIS,
            DateUtils.FORMAT_ABBREV_RELATIVE,
        ).toString()

private val ICON_SIZE = 24.dp
private val UNREAD_DOT_SIZE = 10.dp
private val LOADING_MORE_SIZE = 24.dp
