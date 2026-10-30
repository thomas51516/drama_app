package com.drama.feature.help

import android.text.format.DateUtils
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.ui.component.DramaPrimaryButton
import com.drama.core.ui.component.ErrorState
import com.drama.core.ui.component.LoadingIndicator
import com.drama.core.ui.text.asString
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.ContactCategory
import com.drama.domain.model.FaqCategory
import com.drama.domain.model.FaqEntry
import com.drama.domain.model.SupportTicket
import com.drama.domain.model.TicketAuthor
import com.drama.domain.model.TicketMessage
import com.drama.domain.model.TicketStatus
import com.drama.core.ui.R as CoreR

data class HelpActions(
    val onBack: () -> Unit,
    val onTabSelected: (HelpTab) -> Unit,
    val onQueryChanged: (String) -> Unit,
    val onClearQuery: () -> Unit,
    val onToggleFaqEntry: (String) -> Unit,
    val onRetryFaq: () -> Unit,
    val onCategorySelected: (ContactCategory) -> Unit,
    val onSubjectChanged: (String) -> Unit,
    val onMessageChanged: (String) -> Unit,
    val onEmailChanged: (String) -> Unit,
    val onSend: () -> Unit,
    val onNewRequest: () -> Unit,
    val onRefreshTickets: () -> Unit,
    val onToggleTicket: (String) -> Unit,
)

/** Help centre (M-53): FAQ, contact form and the viewer's own tickets. */
@Composable
fun HelpScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: HelpViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current
    LaunchedEffect(state.message) {
        val message = state.message ?: return@LaunchedEffect
        viewModel.onMessageShown()
        snackbarHostState.showSnackbar(message.asString(context))
    }
    HelpContent(
        state = state,
        actions =
            HelpActions(
                onBack = onBack,
                onTabSelected = viewModel::onTabSelected,
                onQueryChanged = viewModel::onQueryChanged,
                onClearQuery = viewModel::onClearQuery,
                onToggleFaqEntry = viewModel::onToggleFaqEntry,
                onRetryFaq = viewModel::retryFaq,
                onCategorySelected = viewModel::onCategorySelected,
                onSubjectChanged = viewModel::onSubjectChanged,
                onMessageChanged = viewModel::onMessageChanged,
                onEmailChanged = viewModel::onEmailChanged,
                onSend = viewModel::sendContact,
                onNewRequest = viewModel::onNewRequest,
                onRefreshTickets = viewModel::refreshTickets,
                onToggleTicket = viewModel::onToggleTicket,
            ),
        snackbarHostState = snackbarHostState,
        modifier = modifier,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HelpContent(
    state: HelpUiState,
    actions: HelpActions,
    modifier: Modifier = Modifier,
    snackbarHostState: SnackbarHostState = remember { SnackbarHostState() },
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.help_title)) },
                navigationIcon = {
                    IconButton(onClick = actions.onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(CoreR.string.action_back),
                        )
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding),
        ) {
            PrimaryTabRow(selectedTabIndex = state.tab.ordinal) {
                HelpTab.entries.forEach { tab ->
                    Tab(
                        selected = tab == state.tab,
                        onClick = { actions.onTabSelected(tab) },
                        text = { Text(stringResource(tab.labelRes()), maxLines = 2, textAlign = TextAlign.Center) },
                        modifier = Modifier.heightIn(min = DramaSizes.touchTarget),
                    )
                }
            }
            when (state.tab) {
                HelpTab.FAQ -> FaqTab(state, actions)
                HelpTab.CONTACT -> ContactTab(state.form, actions)
                HelpTab.TICKETS -> TicketsTab(state, actions)
            }
        }
    }
}

private fun HelpTab.labelRes(): Int =
    when (this) {
        HelpTab.FAQ -> R.string.help_tab_faq
        HelpTab.CONTACT -> R.string.help_tab_contact
        HelpTab.TICKETS -> R.string.help_tab_tickets
    }

// region FAQ

@Composable
private fun FaqTab(
    state: HelpUiState,
    actions: HelpActions,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = state.query,
            onValueChange = actions.onQueryChanged,
            placeholder = { Text(stringResource(R.string.help_faq_search_placeholder)) },
            singleLine = true,
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon = {
                if (state.query.isNotEmpty()) {
                    IconButton(onClick = actions.onClearQuery) {
                        Icon(Icons.Default.Clear, contentDescription = stringResource(R.string.help_faq_search_clear))
                    }
                }
            },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            shape = MaterialTheme.shapes.large,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
        )
        when {
            state.isFaqLoading -> LoadingIndicator()
            state.faqError != null -> ErrorState(message = state.faqError.asString(), onRetry = actions.onRetryFaq)
            state.showFaqEmpty -> CenteredHint(stringResource(R.string.help_faq_empty))
            state.showFaqEmptySearch ->
                Column(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(DramaSpacing.lg),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = stringResource(R.string.help_faq_empty_search, state.query.trim()),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(DramaSpacing.sm))
                    TextButton(
                        onClick = { actions.onTabSelected(HelpTab.CONTACT) },
                        modifier = Modifier.heightIn(min = DramaSizes.touchTarget),
                    ) { Text(stringResource(R.string.help_faq_ask_support)) }
                }
            else -> FaqList(state.visibleFaq, state.expandedFaqIds, actions.onToggleFaqEntry)
        }
    }
}

@Composable
private fun FaqList(
    categories: List<FaqCategory>,
    expandedIds: Set<String>,
    onToggle: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
    ) {
        categories.forEach { category ->
            item(key = "cat-${category.key}") {
                Text(
                    text = category.title,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.primary,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(top = DramaSpacing.md, bottom = DramaSpacing.xs)
                            .semantics { heading() },
                )
            }
            items(category.entries, key = { "faq-${it.id}" }) { entry ->
                FaqRow(entry = entry, expanded = entry.id in expandedIds, onToggle = { onToggle(entry.id) })
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
}

/** Question row toggling its answer: one TalkBack node with the expanded/collapsed state (S06-A1-03). */
@Composable
private fun FaqRow(
    entry: FaqEntry,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    val stateText = stringResource(if (expanded) R.string.help_faq_expanded else R.string.help_faq_collapsed)
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggle, role = Role.Button)
                .semantics(mergeDescendants = true) { stateDescription = stateText },
    ) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = DramaSizes.touchTarget)
                    .padding(vertical = DramaSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = entry.question,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(DramaSpacing.sm))
            Icon(
                imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        AnimatedVisibility(visible = expanded) {
            Text(
                text = entry.answer,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = DramaSpacing.md, end = DramaSpacing.xl),
            )
        }
    }
}

// endregion

// region Contact

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ContactTab(
    form: ContactFormState,
    actions: HelpActions,
) {
    val sentTicketId = form.sentTicketId
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(DramaSpacing.md),
        verticalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
    ) {
        if (sentTicketId != null) {
            SentCard(ticketId = sentTicketId, actions = actions)
            return@Column
        }
        Text(
            text = stringResource(R.string.help_contact_intro),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = stringResource(R.string.help_contact_category),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onBackground,
            modifier =
                Modifier
                    .padding(top = DramaSpacing.sm)
                    .semantics { heading() },
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
            modifier = Modifier.fillMaxWidth(),
        ) {
            ContactCategory.entries.forEach { category ->
                FilterChip(
                    selected = category == form.category,
                    onClick = { actions.onCategorySelected(category) },
                    enabled = !form.isSending,
                    label = { Text(stringResource(category.labelRes())) },
                )
            }
        }
        OutlinedTextField(
            value = form.subject,
            onValueChange = actions.onSubjectChanged,
            label = { Text(stringResource(R.string.help_contact_subject)) },
            singleLine = true,
            enabled = !form.isSending,
            isError = form.subjectError != null,
            supportingText = form.subjectError?.let { { Text(it.asString()) } },
            keyboardOptions =
                KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = form.message,
            onValueChange = actions.onMessageChanged,
            label = { Text(stringResource(R.string.help_contact_message)) },
            minLines = 4,
            enabled = !form.isSending,
            isError = form.messageError != null,
            supportingText = form.messageError?.let { { Text(it.asString()) } },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = form.email,
            onValueChange = actions.onEmailChanged,
            label = { Text(stringResource(R.string.help_contact_email)) },
            singleLine = true,
            enabled = !form.isSending,
            isError = form.emailError != null,
            supportingText = {
                Text(form.emailError?.asString() ?: stringResource(R.string.help_contact_email_hint))
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth(),
        )
        if (form.isSending) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
        DramaPrimaryButton(
            text = stringResource(if (form.isSending) R.string.help_contact_sending else R.string.help_contact_send),
            onClick = actions.onSend,
            enabled = form.canSend,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(DramaSpacing.lg))
    }
}

@Composable
private fun SentCard(
    ticketId: String,
    actions: HelpActions,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(DramaSpacing.md),
            verticalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
        ) {
            Text(
                text = stringResource(R.string.help_contact_sent_title),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(R.string.help_contact_sent_body, ticketId),
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(DramaSpacing.xs))
            DramaPrimaryButton(
                text = stringResource(R.string.help_contact_sent_view),
                onClick = { actions.onTabSelected(HelpTab.TICKETS) },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedButton(
                onClick = actions.onNewRequest,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = DramaSizes.touchTarget),
            ) { Text(stringResource(R.string.help_contact_sent_new)) }
        }
    }
}

private fun ContactCategory.labelRes(): Int =
    when (this) {
        ContactCategory.ACCOUNT -> R.string.help_category_account
        ContactCategory.COINS -> R.string.help_category_coins
        ContactCategory.VIP -> R.string.help_category_vip
        ContactCategory.PAYMENT -> R.string.help_category_payment
        ContactCategory.PLAYBACK -> R.string.help_category_playback
        ContactCategory.CONTENT -> R.string.help_category_content
        ContactCategory.OTHER -> R.string.help_category_other
    }

// endregion

// region Tickets

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TicketsTab(
    state: HelpUiState,
    actions: HelpActions,
) {
    when {
        state.isTicketsLoading -> LoadingIndicator()
        state.ticketsError != null ->
            ErrorState(
                message = state.ticketsError.asString(),
                onRetry = actions.onRefreshTickets,
            )
        else ->
            PullToRefreshBox(
                isRefreshing = state.isTicketsRefreshing,
                onRefresh = actions.onRefreshTickets,
                modifier = Modifier.fillMaxSize(),
            ) {
                if (state.tickets.isEmpty()) {
                    EmptyTickets(actions)
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(DramaSpacing.md),
                        verticalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
                    ) {
                        ticketItems(state, actions)
                    }
                }
            }
    }
}

@Composable
private fun EmptyTickets(actions: HelpActions) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(DramaSpacing.lg),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.help_tickets_empty),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.bodyLarge,
        )
        Spacer(Modifier.height(DramaSpacing.md))
        DramaPrimaryButton(
            text = stringResource(R.string.help_tickets_empty_action),
            onClick = { actions.onTabSelected(HelpTab.CONTACT) },
        )
        TextButton(
            onClick = actions.onRefreshTickets,
            modifier = Modifier.heightIn(min = DramaSizes.touchTarget),
        ) {
            Icon(Icons.Default.Refresh, contentDescription = null)
            Spacer(Modifier.width(DramaSpacing.xs))
            Text(stringResource(R.string.help_tickets_refresh))
        }
    }
}

private fun LazyListScope.ticketItems(
    state: HelpUiState,
    actions: HelpActions,
) {
    items(state.tickets, key = { it.id }) { ticket ->
        TicketCard(
            ticket = ticket,
            expanded = ticket.id in state.expandedTicketIds,
            onToggle = { actions.onToggleTicket(ticket.id) },
        )
    }
}

@Composable
private fun TicketCard(
    ticket: SupportTicket,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    val stateText =
        stringResource(
            if (expanded) R.string.help_ticket_messages_expanded else R.string.help_ticket_messages_collapsed,
        )
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggle, role = Role.Button)
                    .semantics(mergeDescendants = true) { stateDescription = stateText }
                    .padding(DramaSpacing.md),
        ) {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = DramaSizes.touchTarget - DramaSpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(DramaSpacing.xs)) {
                    Text(
                        text = ticket.subject,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text =
                            listOf(
                                stringResource(R.string.help_ticket_number, ticket.id),
                                stringResource(ticket.category.labelRes()),
                                pluralStringResource(
                                    R.plurals.help_ticket_message_count,
                                    ticket.messages.size,
                                    ticket.messages.size,
                                ),
                            ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    (ticket.updatedAtEpochMs ?: ticket.createdAtEpochMs)?.let { at ->
                        Text(
                            text = relativeTime(at),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Spacer(Modifier.width(DramaSpacing.sm))
                Column(
                    horizontalAlignment = Alignment.End,
                    verticalArrangement = Arrangement.spacedBy(DramaSpacing.xs),
                ) {
                    StatusChip(ticket.status)
                    Icon(
                        imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            AnimatedVisibility(visible = expanded) {
                Column(
                    modifier = Modifier.padding(top = DramaSpacing.md),
                    verticalArrangement = Arrangement.spacedBy(DramaSpacing.sm),
                ) {
                    ticket.messages.forEach { message -> MessageBubble(message) }
                }
            }
        }
    }
}

@Composable
private fun StatusChip(status: TicketStatus) {
    val tint =
        when (status) {
            TicketStatus.OPEN -> MaterialTheme.colorScheme.secondary
            TicketStatus.ANSWERED -> MaterialTheme.colorScheme.primary
            TicketStatus.CLOSED -> MaterialTheme.colorScheme.onSurfaceVariant
        }
    val label =
        when (status) {
            TicketStatus.OPEN -> R.string.help_ticket_status_open
            TicketStatus.ANSWERED -> R.string.help_ticket_status_answered
            TicketStatus.CLOSED -> R.string.help_ticket_status_closed
        }
    Surface(
        color = tint.copy(alpha = STATUS_CHIP_BACKGROUND_ALPHA),
        contentColor = tint,
        shape = MaterialTheme.shapes.small,
    ) {
        Text(
            text = stringResource(label),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = DramaSpacing.sm, vertical = DramaSpacing.xs),
        )
    }
}

/** User messages on the right (primary container), support replies on the left (surface variant). */
@Composable
private fun MessageBubble(message: TicketMessage) {
    val fromUser = message.from == TicketAuthor.USER
    val background =
        if (fromUser) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh
    val foreground =
        if (fromUser) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface
    Box(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier =
                Modifier
                    .align(if (fromUser) Alignment.CenterEnd else Alignment.CenterStart)
                    .fillMaxWidth(BUBBLE_MAX_WIDTH_FRACTION)
                    .background(background, MaterialTheme.shapes.medium)
                    .padding(DramaSpacing.sm + DramaSpacing.xs),
            verticalArrangement = Arrangement.spacedBy(DramaSpacing.xxs),
        ) {
            Text(
                text =
                    listOfNotNull(
                        stringResource(
                            if (fromUser) R.string.help_ticket_from_user else R.string.help_ticket_from_support,
                        ),
                        message.atEpochMs?.let { relativeTime(it) },
                    ).joinToString(" · "),
                style = MaterialTheme.typography.labelSmall,
                color = foreground.copy(alpha = SECONDARY_TEXT_ALPHA),
            )
            Text(text = message.body, style = MaterialTheme.typography.bodyMedium, color = foreground)
        }
    }
}

// endregion

@Composable
private fun CenteredHint(text: String) {
    Text(
        text = text,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(DramaSpacing.lg),
    )
}

/** Localised "il y a 2 h" / "hier" style text; the framework picks the device language. */
@Composable
private fun relativeTime(epochMs: Long): String =
    remember(epochMs) {
        DateUtils
            .getRelativeTimeSpanString(epochMs, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS)
            .toString()
    }

private const val STATUS_CHIP_BACKGROUND_ALPHA = 0.14f
private const val SECONDARY_TEXT_ALPHA = 0.75f
private const val BUBBLE_MAX_WIDTH_FRACTION = 0.88f
