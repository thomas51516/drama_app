package com.drama.feature.player.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.drama.core.ui.component.DramaPrimaryButton
import com.drama.core.ui.text.asString
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.feature.player.PaywallUiState
import com.drama.feature.player.R
import com.drama.core.ui.R as CoreR

data class PaywallActions(
    val onUnlock: () -> Unit,
    val onBecomeVip: () -> Unit,
    val onRecharge: () -> Unit,
    val onAutoUnlockChanged: (Boolean) -> Unit,
    val onDismiss: () -> Unit,
)

/**
 * Paywall (M-20) drawn in the lower band of the player, over the paused / ended video which stays whole: balance,
 * cost, "Débloquer pour N pièces" (enabled when the balance covers the cost), "Devenir VIP", "Regarder une pub"
 * (disabled until M-22, sprint 8) and the auto-unlock switch (M-21).
 */
@Composable
fun PaywallSheet(
    state: PaywallUiState,
    actions: PaywallActions,
    modifier: Modifier = Modifier,
) {
    val episode = state.episode ?: return
    val costText = pluralStringResource(CoreR.plurals.coin_count, state.coinCost, state.coinCost)
    val balanceText = state.balance?.let { pluralStringResource(CoreR.plurals.coin_count, it, it) } ?: "—"
    Surface(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        tonalElevation = 3.dp,
    ) {
        Column(
            modifier =
                Modifier
                    .navigationBarsPadding()
                    .padding(start = DramaSpacing.md, end = DramaSpacing.sm, bottom = DramaSpacing.md)
                    .verticalScroll(rememberScrollState()),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(R.string.player_paywall_title, episode.index),
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                IconButton(onClick = actions.onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = stringResource(CoreR.string.action_close))
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(end = DramaSpacing.sm),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Figure(label = stringResource(R.string.player_paywall_balance), value = balanceText)
                Figure(label = stringResource(R.string.player_paywall_cost), value = costText, alignEnd = true)
            }
            if (state.isInsufficient) {
                Spacer(Modifier.height(DramaSpacing.xs))
                val missing = pluralStringResource(CoreR.plurals.coin_count, state.missingCoins, state.missingCoins)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = stringResource(R.string.player_paywall_missing, missing),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = actions.onRecharge) { Text(stringResource(R.string.player_paywall_recharge)) }
                }
            }
            state.message?.let { message ->
                Text(
                    text = message.asString(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(vertical = DramaSpacing.xs),
                )
            }
            Spacer(Modifier.height(DramaSpacing.sm))
            DramaPrimaryButton(
                text =
                    if (state.isUnlocking) {
                        stringResource(R.string.player_paywall_unlocking)
                    } else {
                        stringResource(R.string.player_paywall_unlock, costText)
                    },
                onClick = actions.onUnlock,
                enabled = state.canUnlock,
                modifier = Modifier.fillMaxWidth().padding(end = DramaSpacing.sm),
            )
            Spacer(Modifier.height(DramaSpacing.sm))
            Row(
                modifier = Modifier.fillMaxWidth().padding(end = DramaSpacing.sm),
                horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
            ) {
                OutlinedButton(
                    onClick = actions.onBecomeVip,
                    modifier = Modifier.weight(1f).heightIn(min = DramaSizes.touchTarget),
                ) { Text(stringResource(R.string.player_paywall_vip)) }
                OutlinedButton(
                    onClick = {},
                    enabled = false,
                    modifier = Modifier.weight(1f).heightIn(min = DramaSizes.touchTarget),
                ) { Text(stringResource(R.string.player_paywall_ad_soon), maxLines = 2) }
            }
            Spacer(Modifier.height(DramaSpacing.xs))
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = DramaSizes.touchTarget)
                        .toggleable(
                            value = state.autoUnlock,
                            enabled = !state.isSavingAutoUnlock,
                            role = Role.Switch,
                            onValueChange = actions.onAutoUnlockChanged,
                        ).padding(end = DramaSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.player_paywall_auto_unlock),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(DramaSpacing.sm))
                Switch(checked = state.autoUnlock, onCheckedChange = null, enabled = !state.isSavingAutoUnlock)
            }
        }
    }
}

@Composable
private fun Figure(
    label: String,
    value: String,
    alignEnd: Boolean = false,
) {
    Column(
        horizontalAlignment = if (alignEnd) Alignment.End else Alignment.Start,
        modifier = Modifier.semantics(mergeDescendants = true) {},
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            color = MaterialTheme.colorScheme.onBackground,
        )
    }
}
