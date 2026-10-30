package com.drama.feature.wallet

import androidx.activity.compose.LocalActivity
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.billing.ActivityBillingHost
import com.drama.core.ui.browser.openCustomTab
import com.drama.core.ui.component.ErrorState
import com.drama.core.ui.component.LoadingIndicator
import com.drama.core.ui.text.asString
import com.drama.core.ui.theme.DramaColors
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.core.ui.time.formatRemaining
import com.drama.core.ui.time.rememberRemainingMs
import com.drama.domain.model.BillingPromptAnswer
import com.drama.domain.model.BillingUiHost
import com.drama.domain.model.CoinPack
import com.drama.domain.model.Subscription
import com.drama.domain.model.VipPeriod
import com.drama.domain.model.VipPlan
import com.drama.domain.model.WelcomeOffer
import java.util.Locale
import com.drama.core.ui.R as CoreR

data class ShopActions(
    val onBack: () -> Unit,
    val onOpenWallet: () -> Unit,
    val onTabSelected: (ShopTab) -> Unit,
    val onBuyPack: (BillingUiHost, CoinPack) -> Unit,
    val onSubscribe: (BillingUiHost, VipPlan) -> Unit,
    val onRestore: () -> Unit,
    val onRetry: () -> Unit,
    val onPromptAnswer: (BillingPromptAnswer) -> Unit,
    /** "Recharger par mobile money" (M-34): opens the recharge site in a Custom Tab. */
    val onOpenRechargeLink: (String) -> Unit = {},
)

/** "Boutique" (M-30/M-31): coin packs and VIP plans, purchase through the store, restore. */
@Composable
fun ShopScreen(
    onBack: () -> Unit,
    onOpenWallet: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ShopViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    LaunchedEffect(state.message) {
        val message = state.message ?: return@LaunchedEffect
        viewModel.onMessageShown()
        snackbar.showSnackbar(message.asString(context))
    }
    ShopContent(
        state = state,
        actions =
            ShopActions(
                onBack = onBack,
                onOpenWallet = onOpenWallet,
                onTabSelected = viewModel::onTabSelected,
                onBuyPack = viewModel::onBuyPack,
                onSubscribe = viewModel::onSubscribe,
                onRestore = viewModel::onRestorePurchases,
                onRetry = viewModel::retry,
                onPromptAnswer = viewModel::onPromptAnswer,
                onOpenRechargeLink = { url -> context.openCustomTab(url) },
            ),
        snackbar = snackbar,
        modifier = modifier,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShopContent(
    state: ShopUiState,
    actions: ShopActions,
    modifier: Modifier = Modifier,
    snackbar: SnackbarHostState = remember { SnackbarHostState() },
) {
    val activity = LocalActivity.current
    val host: BillingUiHost? = remember(activity) { activity?.let(::ActivityBillingHost) }
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.shop_title), modifier = Modifier.semantics { heading() }) },
                navigationIcon = {
                    IconButton(onClick = actions.onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(CoreR.string.action_back),
                        )
                    }
                },
                actions = { BalanceChip(total = state.wallet?.total, onClick = actions.onOpenWallet) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            PrimaryTabRow(selectedTabIndex = state.tab.ordinal) {
                ShopTab.entries.forEach { tab ->
                    Tab(
                        selected = tab == state.tab,
                        onClick = { actions.onTabSelected(tab) },
                        text = {
                            Text(
                                stringResource(
                                    if (tab ==
                                        ShopTab.COINS
                                    ) {
                                        R.string.shop_tab_coins
                                    } else {
                                        R.string.shop_tab_vip
                                    },
                                ),
                            )
                        },
                        modifier = Modifier.heightIn(min = DramaSizes.touchTarget),
                    )
                }
            }
            if (state.isBusy) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            when {
                state.isLoading -> LoadingIndicator()
                state.error != null && state.packs.isEmpty() && state.plans.isEmpty() ->
                    ErrorState(message = state.error.asString(), onRetry = actions.onRetry)
                else -> ShopBody(state, actions, host)
            }
        }
    }
    state.prompt?.let { prompt ->
        // Simulated store (debug): the viewer picks how the purchase ends.
        AlertDialog(
            onDismissRequest = { actions.onPromptAnswer(BillingPromptAnswer.CANCEL) },
            title = { Text(stringResource(R.string.shop_fake_dialog_title)) },
            text = { Text(stringResource(R.string.shop_fake_dialog_body, prompt.sku)) },
            confirmButton = {
                TextButton(onClick = { actions.onPromptAnswer(BillingPromptAnswer.SUCCESS) }) {
                    Text(stringResource(R.string.shop_fake_success))
                }
            },
            dismissButton = {
                Row {
                    TextButton(onClick = { actions.onPromptAnswer(BillingPromptAnswer.PENDING) }) {
                        Text(stringResource(R.string.shop_fake_pending))
                    }
                    TextButton(onClick = { actions.onPromptAnswer(BillingPromptAnswer.CANCEL) }) {
                        Text(stringResource(CoreR.string.action_cancel))
                    }
                }
            },
        )
    }
}

@Composable
private fun ShopBody(
    state: ShopUiState,
    actions: ShopActions,
    host: BillingUiHost?,
) {
    val bottomInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val locale: Locale = LocalConfiguration.current.locales[0]
    LazyColumn(
        contentPadding =
            PaddingValues(
                start = DramaSpacing.md,
                end = DramaSpacing.md,
                top = DramaSpacing.md,
                bottom =
                    bottomInset + DramaSpacing.xl,
            ),
        verticalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
        modifier = Modifier.fillMaxSize(),
    ) {
        if (state.isFakeBilling) {
            item {
                Text(
                    text = stringResource(R.string.shop_fake_banner),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.secondary,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh, RoundedCornerShape(8.dp))
                            .padding(DramaSpacing.sm),
                )
            }
        }
        state.welcomeOffer?.let { offer ->
            item { WelcomeOfferBanner(offer) }
        }
        if (state.missingCoins > 0 && state.tab == ShopTab.COINS) {
            item {
                Text(
                    text =
                        stringResource(
                            R.string.shop_missing_coins,
                            pluralStringResource(CoreR.plurals.coin_count, state.missingCoins, state.missingCoins),
                        ),
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(vertical = DramaSpacing.xs),
                )
            }
        }
        when (state.tab) {
            ShopTab.COINS -> {
                if (state.packs.isEmpty()) {
                    item { EmptyText(stringResource(R.string.shop_no_packs)) }
                }
                items(state.packs, key = { it.pack.id }) { item ->
                    PackCard(
                        item = item,
                        locale = locale,
                        enabled = host != null && !state.isBusy,
                        busy = state.purchasingSku == item.pack.sku,
                        onBuy = { host?.let { actions.onBuyPack(it, item.pack) } },
                    )
                }
            }
            ShopTab.VIP -> {
                state.subscription?.takeIf { it.isActive }?.let { sub -> item { VipStatusCard(sub) } }
                if (state.plans.isEmpty()) {
                    item { EmptyText(stringResource(R.string.shop_no_plans)) }
                }
                items(state.plans, key = { it.plan.id }) { item ->
                    PlanCard(
                        item = item,
                        locale = locale,
                        enabled = host != null && !state.isBusy && state.subscription?.isActive != true,
                        busy = state.purchasingSku == item.plan.sku,
                        onSubscribe = { host?.let { actions.onSubscribe(it, item.plan) } },
                    )
                }
                item {
                    Text(
                        text = stringResource(R.string.shop_vip_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = DramaSpacing.sm),
                    )
                }
            }
        }
        if (state.rechargeLink != null && state.tab == ShopTab.COINS) {
            item {
                // M-34: mobile money through the recharge web site (Remote Config flag), outside Google Play.
                OutlinedButton(
                    onClick = { actions.onOpenRechargeLink(state.rechargeLink) },
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .heightIn(
                                min = DramaSizes.touchTarget,
                            ).padding(top = DramaSpacing.sm),
                ) { Text(stringResource(R.string.shop_recharge_mobile_money)) }
            }
        }
        item {
            TextButton(
                onClick = actions.onRestore,
                enabled = !state.isBusy,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(
                            min = DramaSizes.touchTarget,
                        ).padding(top = DramaSpacing.md),
            ) { Text(stringResource(R.string.shop_restore)) }
        }
    }
}

/** Welcome offer (M-24): bonus on the first purchase with a live countdown. */
@Composable
private fun WelcomeOfferBanner(offer: WelcomeOffer) {
    val remaining = rememberRemainingMs(offer.expiresAtEpochMs)
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(DramaColors.CrimsonSoft, RoundedCornerShape(12.dp))
                .border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(12.dp))
                .padding(DramaSpacing.md)
                .semantics(mergeDescendants = true) {},
    ) {
        Text(
            text = stringResource(R.string.shop_welcome_offer_title, offer.bonusPercent),
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.primary,
        )
        Text(
            text =
                if (offer.expiresAtEpochMs != null) {
                    stringResource(R.string.shop_welcome_offer_until, formatRemaining(remaining))
                } else {
                    stringResource(R.string.shop_welcome_offer_body)
                },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onBackground,
        )
    }
}

@Composable
private fun EmptyText(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = DramaSpacing.md),
    )
}

@Composable
internal fun PriceDisplay.label(locale: Locale): String =
    when (this) {
        is PriceDisplay.Store -> formatted
        is PriceDisplay.Local -> PriceFormatter.format(price, locale)
    }

/** Coin pack: coins, bonus badge, badge from the back-office, price button. One merged TalkBack node + button. */
@Composable
private fun PackCard(
    item: PackUi,
    locale: Locale,
    enabled: Boolean,
    busy: Boolean,
    onBuy: () -> Unit,
) {
    val pack = item.pack
    val priceLabel = item.price.label(locale)
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainerHigh, shape)
                .then(
                    if (pack.badge !=
                        null
                    ) {
                        Modifier.border(1.dp, MaterialTheme.colorScheme.primary, shape)
                    } else {
                        Modifier
                    },
                ).padding(DramaSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
            Text(
                text = pluralStringResource(CoreR.plurals.coin_count, pack.coins, pack.coins),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground,
            )
            if (pack.bonusCoins > 0) {
                Text(
                    text = stringResource(R.string.shop_bonus_coins, pack.bonusCoins),
                    style = MaterialTheme.typography.labelMedium,
                    color = DramaColors.Success,
                )
            }
            item.limitedOffer?.let { offer ->
                // M-24: time-limited bonus badge with its countdown.
                val remaining = rememberRemainingMs(offer.endsAtEpochMs)
                Spacer(Modifier.height(DramaSpacing.xs))
                Text(
                    text =
                        if (offer.endsAtEpochMs != null) {
                            stringResource(
                                R.string.shop_limited_offer_until,
                                offer.bonusPercent,
                                formatRemaining(remaining),
                            )
                        } else {
                            stringResource(R.string.shop_limited_offer, offer.bonusPercent)
                        },
                    style = MaterialTheme.typography.labelSmall,
                    color = DramaColors.Gold,
                    modifier =
                        Modifier
                            .background(DramaColors.Gold.copy(alpha = 0.18f), RoundedCornerShape(6.dp))
                            .padding(horizontal = DramaSpacing.sm, vertical = DramaSpacing.xxs),
                )
            }
            pack.badge?.let { badge ->
                Spacer(Modifier.height(DramaSpacing.xs))
                Text(
                    text = badge,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier =
                        Modifier
                            .background(DramaColors.CrimsonSoft, RoundedCornerShape(6.dp))
                            .padding(horizontal = DramaSpacing.sm, vertical = DramaSpacing.xxs),
                )
            }
        }
        Spacer(Modifier.width(DramaSpacing.sm))
        val buyDescription = stringResource(R.string.shop_buy_cd, pack.totalCoins, priceLabel)
        Button(
            onClick = onBuy,
            enabled = enabled && !busy,
            modifier =
                Modifier
                    .heightIn(
                        min = DramaSizes.touchTarget,
                    ).semantics { contentDescription = buyDescription },
        ) {
            Text(if (busy) stringResource(R.string.shop_buying) else priceLabel)
        }
    }
}

@Composable
private fun PlanCard(
    item: PlanUi,
    locale: Locale,
    enabled: Boolean,
    busy: Boolean,
    onSubscribe: () -> Unit,
) {
    val plan = item.plan
    val priceLabel = item.price.label(locale)
    val periodLabel = stringResource(plan.period.labelRes())
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainerHigh, shape)
                .then(
                    if (plan.badge !=
                        null
                    ) {
                        Modifier.border(1.dp, MaterialTheme.colorScheme.primary, shape)
                    } else {
                        Modifier
                    },
                ).padding(DramaSpacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics(mergeDescendants = true) {}) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.shop_vip_plan_title, periodLabel),
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    text =
                        stringResource(
                            R.string.shop_vip_price_per,
                            priceLabel,
                            stringResource(plan.period.perRes()),
                        ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (plan.trialDays > 0) {
                    Text(
                        text = pluralStringResource(R.plurals.shop_vip_trial, plan.trialDays, plan.trialDays),
                        style = MaterialTheme.typography.labelMedium,
                        color = DramaColors.Success,
                    )
                }
            }
            plan.badge?.let { badge ->
                Text(
                    text = badge,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier =
                        Modifier
                            .background(DramaColors.CrimsonSoft, RoundedCornerShape(6.dp))
                            .padding(horizontal = DramaSpacing.sm, vertical = DramaSpacing.xxs),
                )
            }
        }
        Spacer(Modifier.height(DramaSpacing.sm))
        Button(
            onClick = onSubscribe,
            enabled = enabled && !busy,
            modifier = Modifier.fillMaxWidth().heightIn(min = DramaSizes.touchTarget),
        ) {
            Text(
                if (busy) {
                    stringResource(R.string.shop_buying)
                } else if (plan.trialDays > 0) {
                    stringResource(R.string.shop_vip_start_trial)
                } else {
                    stringResource(R.string.shop_vip_subscribe)
                },
            )
        }
    }
}

@Composable
private fun VipStatusCard(subscription: Subscription) {
    val context = LocalContext.current
    val until =
        subscription.expiresAtEpochMs?.let {
            android.text.format.DateUtils
                .formatDateTime(context, it, android.text.format.DateUtils.FORMAT_SHOW_DATE)
        }
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(DramaColors.CrimsonSoft, RoundedCornerShape(14.dp))
                .padding(DramaSpacing.md)
                .semantics(mergeDescendants = true) {},
    ) {
        Text(
            text = stringResource(R.string.shop_vip_active_title),
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.primary,
        )
        if (until != null) {
            Text(
                text =
                    stringResource(
                        if (subscription.autoRenew) R.string.shop_vip_renews_on else R.string.shop_vip_ends_on,
                        until,
                    ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Coin balance chip (shop, series header, paywall): "N pièces", opens the wallet. */
@Composable
fun BalanceChip(
    total: Int?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val text = total?.let { pluralStringResource(CoreR.plurals.coin_count, it, it) } ?: "—"
    val description = stringResource(R.string.shop_balance_cd, text)
    Box(
        modifier =
            modifier
                .heightIn(min = DramaSizes.touchTarget)
                .padding(horizontal = DramaSpacing.xs)
                .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        OutlinedButton(onClick = onClick, modifier = Modifier.heightIn(min = 36.dp)) {
            Text(text, style = MaterialTheme.typography.labelLarge)
        }
    }
}

private fun VipPeriod.labelRes(): Int =
    when (this) {
        VipPeriod.WEEK -> R.string.shop_period_week
        VipPeriod.MONTH -> R.string.shop_period_month
        VipPeriod.YEAR -> R.string.shop_period_year
    }

private fun VipPeriod.perRes(): Int =
    when (this) {
        VipPeriod.WEEK -> R.string.shop_per_week
        VipPeriod.MONTH -> R.string.shop_per_month
        VipPeriod.YEAR -> R.string.shop_per_year
    }
