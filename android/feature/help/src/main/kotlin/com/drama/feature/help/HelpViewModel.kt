package com.drama.feature.help

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.locale.DeviceLocaleProvider
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.ContactCategory
import com.drama.domain.model.ContactRequest
import com.drama.domain.model.FaqCategory
import com.drama.domain.model.SupportTicket
import com.drama.domain.repository.HelpRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.text.Normalizer
import javax.inject.Inject
import com.drama.core.ui.R as CoreR

enum class HelpTab {
    FAQ,
    CONTACT,
    TICKETS,
}

/** Contact form (`POST /help/contact`). Field errors are set on submit and cleared as the viewer types. */
data class ContactFormState(
    val category: ContactCategory = ContactCategory.OTHER,
    val subject: String = "",
    val message: String = "",
    val email: String = "",
    val subjectError: UiText? = null,
    val messageError: UiText? = null,
    val emailError: UiText? = null,
    val isSending: Boolean = false,
    /** Id of the ticket just created; the confirmation card replaces the form until [HelpViewModel.onNewRequest]. */
    val sentTicketId: String? = null,
) {
    val canSend: Boolean get() = !isSending
}

data class HelpUiState(
    val tab: HelpTab = HelpTab.FAQ,
    // FAQ
    val isFaqLoading: Boolean = false,
    /** Categories as served, in the viewer's language. */
    val faq: List<FaqCategory> = emptyList(),
    /** [faq] filtered by [query]; categories without a matching entry are dropped. */
    val visibleFaq: List<FaqCategory> = emptyList(),
    val query: String = "",
    val expandedFaqIds: Set<String> = emptySet(),
    val faqError: UiText? = null,
    /** The FAQ could not be fetched because the device is offline: full offline state with retry. */
    val isOffline: Boolean = false,
    // Contact
    val form: ContactFormState = ContactFormState(),
    // Tickets
    val tickets: List<SupportTicket> = emptyList(),
    /** False until `GET /help/tickets` answered once; the tab loads lazily on first open. */
    val ticketsLoaded: Boolean = false,
    val isTicketsLoading: Boolean = false,
    val isTicketsRefreshing: Boolean = false,
    val ticketsError: UiText? = null,
    val isTicketsOffline: Boolean = false,
    val expandedTicketIds: Set<String> = emptySet(),
    /** One-shot snackbar text; the UI calls [HelpViewModel.onMessageShown] once displayed. */
    val message: UiText? = null,
) {
    /** The search matched nothing although the FAQ has content. */
    val showFaqEmptySearch: Boolean get() = query.isNotBlank() && visibleFaq.isEmpty() && faq.isNotEmpty()

    /** The server answered with an empty FAQ. */
    val showFaqEmpty: Boolean get() = !isFaqLoading && faqError == null && faq.isEmpty()
}

/**
 * Help centre (M-53, S06-A1-01): FAQ in the app language with accent-insensitive search, contact form with
 * client-side validation (the server validates again), and the viewer's own tickets loaded on first open.
 */
@HiltViewModel
class HelpViewModel
    @Inject
    constructor(
        private val help: HelpRepository,
        private val deviceLocale: DeviceLocaleProvider,
        private val logger: Logger,
    ) : ViewModel() {
        private val uiStateFlow = MutableStateFlow(HelpUiState())
        val uiState: StateFlow<HelpUiState> = uiStateFlow.asStateFlow()

        private var faqJob: kotlinx.coroutines.Job? = null
        private var ticketsJob: kotlinx.coroutines.Job? = null

        init {
            loadFaq()
        }

        // region Tabs

        fun onTabSelected(tab: HelpTab) {
            uiStateFlow.update { it.copy(tab = tab) }
            if (tab == HelpTab.TICKETS && !uiStateFlow.value.ticketsLoaded) loadTickets(refresh = false)
        }

        fun onMessageShown() = uiStateFlow.update { it.copy(message = null) }

        // endregion

        // region FAQ

        fun retryFaq() = loadFaq()

        fun onQueryChanged(query: String) =
            uiStateFlow.update { it.copy(query = query, visibleFaq = it.faq.filterBy(query)) }

        fun onClearQuery() = onQueryChanged("")

        fun onToggleFaqEntry(id: String) =
            uiStateFlow.update { it.copy(expandedFaqIds = it.expandedFaqIds.toggled(id)) }

        private fun loadFaq() {
            if (faqJob?.isActive == true) return
            uiStateFlow.update { it.copy(isFaqLoading = true, faqError = null, isOffline = false) }
            faqJob =
                viewModelScope.launch {
                    when (val result = help.getFaq(deviceLocale.language)) {
                        is AppResult.Success ->
                            uiStateFlow.update {
                                it.copy(
                                    isFaqLoading = false,
                                    faq = result.value,
                                    visibleFaq = result.value.filterBy(it.query),
                                )
                            }
                        is AppResult.Failure -> {
                            logger.w(TAG, "GET /help/faq failed: ${result.error}")
                            uiStateFlow.update {
                                it.copy(
                                    isFaqLoading = false,
                                    faqError = result.error.toLoadMessage(R.string.help_faq_unavailable),
                                    isOffline = result.error is AppError.Network,
                                )
                            }
                        }
                    }
                }
        }

        // endregion

        // region Contact

        fun onCategorySelected(category: ContactCategory) = updateForm { it.copy(category = category) }

        fun onSubjectChanged(value: String) = updateForm { it.copy(subject = value, subjectError = null) }

        fun onMessageChanged(value: String) = updateForm { it.copy(message = value, messageError = null) }

        fun onEmailChanged(value: String) = updateForm { it.copy(email = value, emailError = null) }

        /** Back to an empty form after the confirmation card. */
        fun onNewRequest() = updateForm { ContactFormState() }

        fun sendContact() {
            val form = uiStateFlow.value.form
            if (!form.canSend) return
            val subject = form.subject.trim()
            val message = form.message.trim()
            val email = form.email.trim()
            val subjectError =
                if (subject.length < MIN_SUBJECT_LENGTH) {
                    UiText.of(R.string.help_contact_subject_error, MIN_SUBJECT_LENGTH)
                } else {
                    null
                }
            val messageError =
                if (message.length < MIN_MESSAGE_LENGTH) {
                    UiText.of(R.string.help_contact_message_error, MIN_MESSAGE_LENGTH)
                } else {
                    null
                }
            val emailError =
                UiText
                    .Res(
                        R.string.help_contact_email_error,
                    ).takeIf { email.isNotEmpty() && !EMAIL_REGEX.matches(email) }
            if (subjectError != null || messageError != null || emailError != null) {
                updateForm {
                    it.copy(
                        subjectError = subjectError,
                        messageError = messageError,
                        emailError = emailError,
                    )
                }
                return
            }
            updateForm { it.copy(isSending = true) }
            viewModelScope.launch {
                val request =
                    ContactRequest(
                        category = form.category,
                        subject = subject,
                        message = message,
                        email = email.takeIf { it.isNotEmpty() },
                    )
                when (val result = help.sendContact(request)) {
                    is AppResult.Success -> {
                        updateForm { ContactFormState(sentTicketId = result.value) }
                        loadTickets(refresh = true)
                    }
                    is AppResult.Failure -> {
                        logger.w(TAG, "POST /help/contact failed: ${result.error}")
                        uiStateFlow.update {
                            it.copy(
                                form = it.form.copy(isSending = false),
                                message = result.error.toSendMessage(),
                            )
                        }
                    }
                }
            }
        }

        private inline fun updateForm(crossinline transform: (ContactFormState) -> ContactFormState) =
            uiStateFlow.update { it.copy(form = transform(it.form)) }

        // endregion

        // region Tickets

        /** Pull-to-refresh and the retry button; also called after a request was sent. */
        fun refreshTickets() = loadTickets(refresh = true)

        fun onToggleTicket(id: String) =
            uiStateFlow.update { it.copy(expandedTicketIds = it.expandedTicketIds.toggled(id)) }

        private fun loadTickets(refresh: Boolean) {
            if (ticketsJob?.isActive == true) return
            uiStateFlow.update {
                it.copy(
                    isTicketsLoading = !refresh || !it.ticketsLoaded,
                    isTicketsRefreshing = refresh && it.ticketsLoaded,
                    ticketsError = null,
                    isTicketsOffline = false,
                )
            }
            ticketsJob =
                viewModelScope.launch {
                    when (val result = help.getTickets()) {
                        is AppResult.Success ->
                            uiStateFlow.update {
                                it.copy(
                                    tickets = result.value.sortedByDescending { t -> t.sortKey },
                                    ticketsLoaded = true,
                                    isTicketsLoading = false,
                                    isTicketsRefreshing = false,
                                )
                            }
                        is AppResult.Failure -> {
                            logger.w(TAG, "GET /help/tickets failed: ${result.error}")
                            val error = result.error.toLoadMessage(R.string.help_tickets_failed)
                            uiStateFlow.update {
                                it.copy(
                                    isTicketsLoading = false,
                                    isTicketsRefreshing = false,
                                    // Keep the list usable when a refresh fails: snackbar instead of a full error.
                                    ticketsError = if (it.ticketsLoaded) null else error,
                                    isTicketsOffline = !it.ticketsLoaded && result.error is AppError.Network,
                                    message = if (it.ticketsLoaded) error else it.message,
                                )
                            }
                        }
                    }
                }
        }

        // endregion

        private fun Set<String>.toggled(id: String): Set<String> = if (id in this) this - id else this + id

        private val SupportTicket.sortKey: Long get() = updatedAtEpochMs ?: createdAtEpochMs ?: 0L

        private fun List<FaqCategory>.filterBy(query: String): List<FaqCategory> {
            val needle = query.normalizedForSearch()
            if (needle.isEmpty()) return this
            return mapNotNull { category ->
                val entries =
                    category.entries.filter { entry ->
                        needle in entry.question.normalizedForSearch() || needle in entry.answer.normalizedForSearch()
                    }
                if (entries.isEmpty()) null else category.copy(entries = entries)
            }
        }

        private fun AppError.toLoadMessage(unavailableRes: Int): UiText =
            when (this) {
                is AppError.Network -> UiText.Res(CoreR.string.state_offline)
                is AppError.NotFound -> UiText.Res(unavailableRes)
                is AppError.Http ->
                    when {
                        code == HTTP_NOT_FOUND || code == HTTP_NOT_IMPLEMENTED -> UiText.Res(unavailableRes)
                        isRateLimited() -> UiText.Res(CoreR.string.error_rate_limited)
                        else -> UiText.Res(CoreR.string.error_generic)
                    }
                is AppError.Server -> UiText.of(CoreR.string.error_server, code)
                is AppError.Unauthenticated -> UiText.Res(CoreR.string.error_session_expired)
                else -> UiText.Res(CoreR.string.error_generic)
            }

        private fun AppError.toSendMessage(): UiText =
            when (this) {
                is AppError.Network -> UiText.Res(CoreR.string.error_network)
                is AppError.Server -> UiText.of(CoreR.string.error_server, code)
                is AppError.Http ->
                    if (isRateLimited()) {
                        UiText.Res(CoreR.string.error_rate_limited)
                    } else {
                        UiText.Res(R.string.help_contact_failed)
                    }
                is AppError.Unauthenticated -> UiText.Res(CoreR.string.error_session_expired)
                else -> UiText.Res(R.string.help_contact_failed)
            }

        private fun AppError.Http.isRateLimited(): Boolean =
            code == HTTP_TOO_MANY_REQUESTS || serverCode.equals(RATE_LIMITED_CODE, ignoreCase = true)

        companion object {
            const val MIN_SUBJECT_LENGTH = 3
            const val MIN_MESSAGE_LENGTH = 10
            private const val TAG = "Help"
            private const val HTTP_NOT_FOUND = 404
            private const val HTTP_TOO_MANY_REQUESTS = 429
            private const val HTTP_NOT_IMPLEMENTED = 501
            private const val RATE_LIMITED_CODE = "RATE_LIMITED"
            private val EMAIL_REGEX = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$")
            private val COMBINING_MARKS = Regex("\\p{M}+")

            /** Lowercase, accents stripped (NFD then combining marks removed), trimmed. */
            internal fun String.normalizedForSearch(): String =
                Normalizer
                    .normalize(trim(), Normalizer.Form.NFD)
                    .replace(COMBINING_MARKS, "")
                    .lowercase()
        }
    }
