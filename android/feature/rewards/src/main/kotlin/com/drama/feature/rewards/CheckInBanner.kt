package com.drama.feature.rewards

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.ui.text.UiText
import com.drama.core.ui.theme.DramaColors
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.CheckInRules
import com.drama.domain.model.CheckInStatus
import com.drama.core.ui.R as CoreR

/**
 * "Récompense du jour" banner of the home (M-40): day N, coins, "Réclamer" (or a check once claimed); tapping the
 * banner opens the rewards screen. Drawn only once the server answered, so a backend without the route shows nothing.
 */
@Composable
fun CheckInBanner(
    onOpenRewards: () -> Unit,
    onMessage: (UiText) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CheckInBannerViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LifecycleResumeEffect(Unit) {
        viewModel.refresh()
        onPauseOrDispose { }
    }
    val context = LocalContext.current
    LaunchedEffect(state.claimedCoins, state.message) {
        val coins = state.claimedCoins
        val message = state.message
        if (coins != null) {
            onMessage(UiText.Plural(R.plurals.rewards_msg_claimed, coins))
            viewModel.onFeedbackShown()
        } else if (message != null) {
            onMessage(UiText.Raw(message.asString(context)))
            viewModel.onFeedbackShown()
        }
    }
    val status = state.status ?: return
    CheckInBannerContent(
        status = status,
        isClaiming = state.isClaiming,
        onClaim = viewModel::onClaim,
        onOpen = onOpenRewards,
        modifier = modifier,
    )
}

@Composable
fun CheckInBannerContent(
    status: CheckInStatus,
    isClaiming: Boolean,
    onClaim: () -> Unit,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val coins = status.nextCoins
    val day = CheckInRules.todayDay(status)
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(horizontal = DramaSpacing.md)
                .clip(RoundedCornerShape(14.dp))
                .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                .clickable(onClick = onOpen, role = Role.Button)
                .heightIn(min = DramaSizes.touchTarget)
                .padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Default.Star, contentDescription = null, tint = DramaColors.Gold)
        Spacer(Modifier.width(DramaSpacing.sm + DramaSpacing.xs))
        Column(modifier = Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
            Text(
                text = stringResource(R.string.rewards_banner_title),
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                text =
                    if (status.claimedToday) {
                        stringResource(R.string.rewards_banner_claimed, day)
                    } else {
                        stringResource(
                            R.string.rewards_banner_subtitle,
                            day,
                            pluralStringResource(CoreR.plurals.coin_count, coins, coins),
                        )
                    },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(DramaSpacing.sm))
        if (status.claimedToday) {
            Icon(
                Icons.Default.Check,
                contentDescription = stringResource(R.string.rewards_day_claimed),
                tint = DramaColors.Success,
            )
        } else {
            Button(
                onClick = onClaim,
                enabled = !isClaiming,
                modifier = Modifier.heightIn(min = 36.dp),
            ) { Text(stringResource(if (isClaiming) R.string.rewards_claiming else R.string.rewards_claim)) }
        }
    }
}
