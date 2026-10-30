package com.drama.feature.wallet

import android.text.format.DateUtils
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.ui.browser.openCustomTab
import com.drama.core.ui.component.DramaPrimaryButton
import com.drama.core.ui.component.ErrorState
import com.drama.core.ui.component.LoadingIndicator
import com.drama.core.ui.text.asString
import com.drama.core.ui.theme.DramaColors
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.BonusExpiry
import com.drama.domain.model.LedgerBucket
import com.drama.domain.model.LedgerEntry
import com.drama.domain.model.LedgerType
import com.drama.domain.model.Wallet
import com.drama.core.ui.R as CoreR

data class WalletActions(
    val onBack: () -> Unit,
    val onOpenShop: () -> Unit,
    val onRefresh: () -> Unit,
    val onLoadMore: () -> Unit,
    val onAutoUnlockChanged: (Boolean) -> Unit,
    val onPromoOpen: () -> Unit = {},
    val onPromoDismiss: () -> Unit = {},
    val onPromoCodeChanged: (String) -> Unit = {},
    val onPromoSubmit: () -> Unit = {},
    /** "Recharger par mobile money" (M-34): opens the recharge site in a Custom Tab. */
    val onOpenRechargeLink: (String) -> Unit = {},
)

/** "Mon portefeuille" (M-32). */
@Composable
fun WalletScreen(
    onBack: () -> Unit,
    onOpenShop: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: WalletViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    LaunchedEffect(state.message) {
        val message = state.message ?: return@LaunchedEffect
        viewModel.onMessageShown()
        snackbar.showSnackbar(message.asString(context))
    }
    WalletContent(
        state = state,
        actions =
            WalletActions(
                onBack = onBack,
                onOpenShop = onOpenShop,
                onRefresh = viewModel::refresh,
                onLoadMore = viewModel::loadMore,
                onAutoUnlockChanged = viewModel::onAutoUnlockChanged,
                onPromoOpen = viewModel::onPromoOpen,
                onPromoDismiss = viewModel::onPromoDismiss,
                onPromoCodeChanged = viewModel::onPromoCodeChanged,
                onPromoSubmit = viewModel::onPromoSubmit,
                onOpenRechargeLink = { url -> context.openCustomTab(url) },
            ),
        snackbar = snackbar,
        modifier = modifier,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletContent(
    state: WalletUiState,
    actions: WalletActions,
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
                title = { Text(stringResource(R.string.wallet_title), modifier = Modifier.semantics { heading() }) },
                navigationIcon = {
                    IconButton(onClick = actions.onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(CoreR.string.action_back),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when {
                state.isLoading && state.wallet == null -> LoadingIndicator()
                state.showError -> ErrorState(message = state.error?.asString().orEmpty(), onRetry = actions.onRefresh)
                else -> WalletBody(state, actions)
            }
        }
    }
    if (state.promo.isOpen) PromoCodeDialog(promo = state.promo, actions = actions)
}

/** "J'ai un code" (M-24): one field, the server validates; errors are shown inline. */
@Composable
private fun PromoCodeDialog(
    promo: PromoUi,
    actions: WalletActions,
) {
    AlertDialog(
        onDismissRequest = { if (!promo.isSubmitting) actions.onPromoDismiss() },
        title = { Text(stringResource(R.string.wallet_promo_title)) },
        text = {
            Column {
                OutlinedTextField(
                    value = promo.code,
                    onValueChange = actions.onPromoCodeChanged,
                    singleLine = true,
                    enabled = !promo.isSubmitting,
                    isError = promo.error != null,
                    label = { Text(stringResource(R.string.wallet_promo_label)) },
                    keyboardOptions =
                        KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { actions.onPromoSubmit() }),
                    modifier = Modifier.fillMaxWidth(),
                )
                promo.error?.let { error ->
                    Text(
                        text = error.asString(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = DramaSpacing.xs),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = actions.onPromoSubmit, enabled = promo.canSubmit) {
                Text(
                    stringResource(
                        if (promo.isSubmitting) R.string.wallet_promo_submitting else R.string.wallet_promo_submit,
                    ),
                )
            }
        },
        dismissButton = {
            TextButton(onClick = actions.onPromoDismiss, enabled = !promo.isSubmitting) {
                Text(stringResource(CoreR.string.action_cancel))
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WalletBody(
    state: WalletUiState,
    actions: WalletActions,
) {
    val listState = rememberLazyListState()
    val shouldLoadMore by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()?.index ?: -1
            last >= info.totalItemsCount - LOAD_MORE_THRESHOLD
        }
    }
    LaunchedEffect(shouldLoadMore, state.hasMore, state.entries.size) {
        if (shouldLoadMore && state.hasMore) actions.onLoadMore()
    }
    val bottomInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    PullToRefreshBox(isRefreshing = state.isRefreshing, onRefresh = actions.onRefresh) {
        LazyColumn(
            state = listState,
            contentPadding =
                PaddingValues(
                    start = DramaSpacing.md,
                    end = DramaSpacing.md,
                    bottom =
                        bottomInset + DramaSpacing.xl,
                ),
            verticalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
            modifier = Modifier.fillMaxSize(),
        ) {
            item {
                BalanceCard(
                    wallet = state.wallet ?: Wallet.EMPTY,
                    expiring = state.bonusExpiringSoon,
                    onOpenShop = actions.onOpenShop,
                    rechargeLink = state.rechargeLink,
                    onOpenRechargeLink = actions.onOpenRechargeLink,
                    onPromoOpen = actions.onPromoOpen,
                )
            }
            item {
                AutoUnlockRow(
                    checked = state.wallet?.autoUnlock == true,
                    enabled = state.wallet != null && !state.isSavingAutoUnlock,
                    onCheckedChange = actions.onAutoUnlockChanged,
                )
            }
            item {
                Text(
                    text = stringResource(R.string.wallet_history_heading),
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.padding(top = DramaSpacing.sm).semantics { heading() },
                )
            }
            if (state.entries.isEmpty() && !state.isLoading) {
                item {
                    Text(
                        text = stringResource(R.string.wallet_history_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = DramaSpacing.md),
                    )
                }
            }
            items(state.entries, key = { it.id }) { entry -> LedgerRow(entry) }
            if (state.isLoadingMore) {
                item {
                    Box(Modifier.fillMaxWidth().padding(DramaSpacing.md), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp))
                    }
                }
            }
        }
    }
}

/** Purchased / bonus / total with "Recharger" (M-32); one TalkBack node per figure. */
@Composable
private fun BalanceCard(
    wallet: Wallet,
    expiring: BonusExpiry?,
    onOpenShop: () -> Unit,
    rechargeLink: String? = null,
    onOpenRechargeLink: (String) -> Unit = {},
    onPromoOpen: () -> Unit = {},
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainerHigh, RoundedCornerShape(16.dp))
                .padding(DramaSpacing.md),
    ) {
        Text(
            text = stringResource(R.string.wallet_total_label),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = pluralStringResource(CoreR.plurals.coin_count, wallet.total, wallet.total),
            style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(DramaSpacing.sm))
        Row(horizontalArrangement = Arrangement.spacedBy(DramaSpacing.lg)) {
            BalanceFigure(label = stringResource(R.string.wallet_purchased_label), value = wallet.purchased)
            BalanceFigure(label = stringResource(R.string.wallet_bonus_label), value = wallet.bonus)
        }
        if (expiring != null) {
            Spacer(Modifier.height(DramaSpacing.sm))
            val context = LocalContext.current
            val whenText =
                DateUtils.getRelativeTimeSpanString(context, expiring.expiresAtEpochMs, false).toString()
            Text(
                text =
                    stringResource(
                        R.string.wallet_bonus_expiring,
                        pluralStringResource(CoreR.plurals.coin_count, expiring.amount, expiring.amount),
                        whenText,
                    ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.secondary,
            )
        }
        Spacer(Modifier.height(DramaSpacing.md))
        DramaPrimaryButton(
            text = stringResource(R.string.wallet_recharge),
            onClick = onOpenShop,
            modifier = Modifier.fillMaxWidth(),
        )
        if (rechargeLink != null) {
            // M-34: the mobile money recharge site (Remote Config flag), outside Google Play billing.
            Spacer(Modifier.height(DramaSpacing.sm))
            OutlinedButton(
                onClick = { onOpenRechargeLink(rechargeLink) },
                modifier = Modifier.fillMaxWidth().heightIn(min = DramaSizes.touchTarget),
            ) { Text(stringResource(R.string.wallet_recharge_mobile_money)) }
        }
        TextButton(onClick = onPromoOpen, modifier = Modifier.fillMaxWidth().heightIn(min = DramaSizes.touchTarget)) {
            Text(stringResource(R.string.wallet_promo_entry))
        }
    }
}

@Composable
private fun BalanceFigure(
    label: String,
    value: Int,
) {
    Column(modifier = Modifier.semantics(mergeDescendants = true) {}) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = pluralStringResource(CoreR.plurals.coin_count, value, value),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
    }
}

@Composable
private fun AutoUnlockRow(
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = DramaSizes.touchTarget)
                .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = onCheckedChange)
                .padding(vertical = DramaSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.wallet_auto_unlock),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                text = stringResource(R.string.wallet_auto_unlock_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(DramaSpacing.md))
        Switch(checked = checked, onCheckedChange = null, enabled = enabled)
    }
}

/** One ledger line: icon per type, description, date, signed amount (green when positive). */
@Composable
private fun LedgerRow(entry: LedgerEntry) {
    val context = LocalContext.current
    val typeLabel = stringResource(entry.type.labelRes())
    val dateText =
        entry.createdAtEpochMs?.let {
            DateUtils.formatDateTime(
                context,
                it,
                DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_TIME or DateUtils.FORMAT_ABBREV_MONTH,
            )
        }
    val positive = entry.amount > 0
    val amountText = (if (positive) "+" else "") + entry.amount.toString()
    val amountDescription = pluralStringResource(CoreR.plurals.coin_count, entry.amount, entry.amount)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = DramaSizes.touchTarget)
                .semantics(mergeDescendants = true) {}
                .padding(vertical = DramaSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier =
                Modifier
                    .size(40.dp)
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = entry.type.icon(),
                contentDescription = typeLabel,
                tint = if (positive) DramaColors.Success else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(Modifier.width(DramaSpacing.sm + DramaSpacing.xs))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = entry.description ?: typeLabel,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground,
            )
            val bucket =
                stringResource(
                    if (entry.bucket ==
                        LedgerBucket.BONUS
                    ) {
                        R.string.wallet_bonus_label
                    } else {
                        R.string.wallet_purchased_label
                    },
                )
            Text(
                text = listOfNotNull(dateText, bucket).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = amountText,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            color = if (positive) DramaColors.Success else MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.End,
            modifier = Modifier.semantics { contentDescription = amountDescription },
        )
    }
}

private fun LedgerType.labelRes(): Int =
    when (this) {
        LedgerType.PURCHASE -> R.string.wallet_type_purchase
        LedgerType.BONUS -> R.string.wallet_type_bonus
        LedgerType.UNLOCK -> R.string.wallet_type_unlock
        LedgerType.ADJUSTMENT -> R.string.wallet_type_adjustment
        LedgerType.EXPIRY -> R.string.wallet_type_expiry
        LedgerType.REFUND -> R.string.wallet_type_refund
        LedgerType.MERGE -> R.string.wallet_type_merge
        LedgerType.UNKNOWN -> R.string.wallet_type_other
    }

private fun LedgerType.icon(): ImageVector =
    when (this) {
        LedgerType.PURCHASE -> Icons.Default.ShoppingCart
        LedgerType.BONUS -> Icons.Default.Star
        LedgerType.UNLOCK -> Icons.Default.Lock
        LedgerType.ADJUSTMENT -> Icons.Default.Build
        LedgerType.EXPIRY -> Icons.Default.DateRange
        LedgerType.REFUND -> Icons.Default.Warning
        LedgerType.MERGE -> Icons.Default.AccountCircle
        LedgerType.UNKNOWN -> Icons.Default.Build
    }

private const val LOAD_MORE_THRESHOLD = 3
