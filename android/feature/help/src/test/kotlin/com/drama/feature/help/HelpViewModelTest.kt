package com.drama.feature.help

import com.drama.core.common.locale.FixedDeviceLocale
import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.ContactCategory
import com.drama.domain.model.ContactRequest
import com.drama.domain.model.FaqCategory
import com.drama.domain.model.FaqEntry
import com.drama.domain.model.SupportTicket
import com.drama.domain.model.TicketAuthor
import com.drama.domain.model.TicketMessage
import com.drama.domain.model.TicketStatus
import com.drama.domain.repository.HelpRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import com.drama.core.ui.R as CoreR

@OptIn(ExperimentalCoroutinesApi::class)
class HelpViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val help = FakeHelpRepository()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(language: String = "fr") =
        HelpViewModel(help = help, deviceLocale = FixedDeviceLocale(language, "CI"), logger = NoOpLogger)

    @Test
    fun `FAQ loads for the device language and keeps the server grouping`() =
        runTest(dispatcher) {
            val viewModel = viewModel(language = "es")
            assertTrue(viewModel.uiState.value.isFaqLoading)
            advanceUntilIdle()
            val state = viewModel.uiState.value
            assertEquals(listOf("es"), help.faqLanguages)
            assertFalse(state.isFaqLoading)
            assertEquals(listOf("coins", "playback"), state.visibleFaq.map { it.key })
            assertEquals(
                2,
                state.visibleFaq
                    .first()
                    .entries.size,
            )
            assertFalse(state.showFaqEmpty)

            viewModel.onToggleFaqEntry("q1")
            assertEquals(setOf("q1"), viewModel.uiState.value.expandedFaqIds)
            viewModel.onToggleFaqEntry("q1")
            assertTrue(
                viewModel.uiState.value.expandedFaqIds
                    .isEmpty(),
            )
        }

    @Test
    fun `search filters accent and case insensitively and an empty query restores everything`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            advanceUntilIdle()

            viewModel.onQueryChanged("pieces")
            var visible = viewModel.uiState.value.visibleFaq
            assertEquals(listOf("coins"), visible.map { it.key })
            assertEquals(listOf("q1"), visible.single().entries.map { it.id })

            viewModel.onQueryChanged("  SOUS-TITRÉS ") // matches an answer, not a question
            visible = viewModel.uiState.value.visibleFaq
            assertEquals(listOf("q3"), visible.flatMap { it.entries }.map { it.id })

            viewModel.onQueryChanged("zzz")
            assertTrue(
                viewModel.uiState.value.visibleFaq
                    .isEmpty(),
            )
            assertTrue(viewModel.uiState.value.showFaqEmptySearch)

            viewModel.onClearQuery()
            assertEquals("", viewModel.uiState.value.query)
            assertEquals(
                3,
                viewModel.uiState.value.visibleFaq
                    .flatMap { it.entries }
                    .size,
            )
            assertFalse(viewModel.uiState.value.showFaqEmptySearch)
        }

    @Test
    fun `offline FAQ sets isOffline and retry reloads`() =
        runTest(dispatcher) {
            help.failFaqWith = AppError.Network()
            val viewModel = viewModel()
            advanceUntilIdle()
            var state = viewModel.uiState.value
            assertTrue(state.isOffline)
            assertEquals(UiText.Res(CoreR.string.state_offline), state.faqError)
            assertTrue(state.faq.isEmpty())

            viewModel.retryFaq()
            advanceUntilIdle()
            state = viewModel.uiState.value
            assertEquals(2, help.faqLanguages.size)
            assertFalse(state.isOffline)
            assertNull(state.faqError)
            assertEquals(2, state.faq.size)
        }

    @Test
    fun `FAQ not served yet maps to coming soon and server errors carry the code`() =
        runTest(dispatcher) {
            help.failFaqWith = AppError.Http(code = 501)
            var viewModel = viewModel()
            advanceUntilIdle()
            assertEquals(UiText.Res(R.string.help_faq_unavailable), viewModel.uiState.value.faqError)
            assertFalse(viewModel.uiState.value.isOffline)

            help.failFaqWith = AppError.Server(503)
            viewModel = viewModel()
            advanceUntilIdle()
            assertEquals(UiText.of(CoreR.string.error_server, 503), viewModel.uiState.value.faqError)
        }

    @Test
    fun `contact validation blocks a short subject, a short message and a bad email`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            advanceUntilIdle()

            viewModel.onSubjectChanged("ab")
            viewModel.onMessageChanged("too short")
            viewModel.onEmailChanged("not-an-email")
            viewModel.sendContact()
            advanceUntilIdle()
            var form = viewModel.uiState.value.form
            assertTrue(help.contactRequests.isEmpty())
            assertEquals(
                UiText.of(R.string.help_contact_subject_error, HelpViewModel.MIN_SUBJECT_LENGTH),
                form.subjectError,
            )
            assertEquals(
                UiText.of(R.string.help_contact_message_error, HelpViewModel.MIN_MESSAGE_LENGTH),
                form.messageError,
            )
            assertEquals(UiText.Res(R.string.help_contact_email_error), form.emailError)

            // Typing clears the field error; a valid value passes.
            viewModel.onSubjectChanged("Paiement")
            form = viewModel.uiState.value.form
            assertNull(form.subjectError)
            assertNotNull(form.messageError)

            viewModel.onMessageChanged("Mon achat de pièces n'apparaît pas.")
            viewModel.onEmailChanged("")
            viewModel.sendContact()
            advanceUntilIdle()
            assertEquals(1, help.contactRequests.size)
            assertNull(help.contactRequests.single().email)
        }

    @Test
    fun `successful send gives the ticket id, clears the form and reloads the tickets`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            advanceUntilIdle()
            assertEquals(0, help.ticketCalls)

            viewModel.onCategorySelected(ContactCategory.PAYMENT)
            viewModel.onSubjectChanged("  Pièces manquantes ")
            viewModel.onMessageChanged("J'ai payé mais mon solde n'a pas bougé.")
            viewModel.onEmailChanged("thomas@example.com")
            viewModel.sendContact()
            assertTrue(viewModel.uiState.value.form.isSending)
            assertFalse(viewModel.uiState.value.form.canSend)
            advanceUntilIdle()

            val request = help.contactRequests.single()
            assertEquals(ContactCategory.PAYMENT, request.category)
            assertEquals("Pièces manquantes", request.subject)
            assertEquals("thomas@example.com", request.email)

            val state = viewModel.uiState.value
            assertEquals("t-new", state.form.sentTicketId)
            assertEquals("", state.form.subject)
            assertEquals("", state.form.message)
            assertEquals("", state.form.email)
            assertEquals(ContactCategory.OTHER, state.form.category)
            assertFalse(state.form.isSending)
            assertEquals(1, help.ticketCalls)
            assertTrue(state.ticketsLoaded)
            assertEquals(listOf("t2", "t1"), state.tickets.map { it.id })

            viewModel.onNewRequest()
            assertNull(viewModel.uiState.value.form.sentTicketId)
        }

    @Test
    fun `rate limited contact maps to error_rate_limited and keeps the form`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            advanceUntilIdle()
            viewModel.onSubjectChanged("Lecture")
            viewModel.onMessageChanged("La vidéo se coupe toutes les dix secondes.")

            help.failContactWith = AppError.Http(code = 429, serverCode = "RATE_LIMITED")
            viewModel.sendContact()
            advanceUntilIdle()
            var state = viewModel.uiState.value
            assertEquals(UiText.Res(CoreR.string.error_rate_limited), state.message)
            assertEquals("Lecture", state.form.subject)
            assertNull(state.form.sentTicketId)
            assertFalse(state.form.isSending)
            viewModel.onMessageShown()
            assertNull(viewModel.uiState.value.message)

            help.failContactWith = AppError.Http(code = 400, serverCode = "RATE_LIMITED")
            viewModel.sendContact()
            advanceUntilIdle()
            state = viewModel.uiState.value
            assertEquals(UiText.Res(CoreR.string.error_rate_limited), state.message)
            assertEquals(0, help.ticketCalls)
        }

    @Test
    fun `tickets load lazily when the tab opens, newest first, and refresh on demand`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            advanceUntilIdle()
            assertEquals(0, help.ticketCalls)
            assertFalse(viewModel.uiState.value.ticketsLoaded)

            viewModel.onTabSelected(HelpTab.TICKETS)
            assertEquals(HelpTab.TICKETS, viewModel.uiState.value.tab)
            assertTrue(viewModel.uiState.value.isTicketsLoading)
            advanceUntilIdle()
            var state = viewModel.uiState.value
            assertEquals(1, help.ticketCalls)
            assertTrue(state.ticketsLoaded)
            assertFalse(state.isTicketsLoading)
            assertEquals(listOf("t2", "t1"), state.tickets.map { it.id })

            // Re-opening the tab does not refetch.
            viewModel.onTabSelected(HelpTab.FAQ)
            viewModel.onTabSelected(HelpTab.TICKETS)
            advanceUntilIdle()
            assertEquals(1, help.ticketCalls)

            viewModel.onToggleTicket("t2")
            assertEquals(setOf("t2"), viewModel.uiState.value.expandedTicketIds)

            viewModel.refreshTickets()
            assertTrue(viewModel.uiState.value.isTicketsRefreshing)
            assertFalse(viewModel.uiState.value.isTicketsLoading)
            advanceUntilIdle()
            state = viewModel.uiState.value
            assertEquals(2, help.ticketCalls)
            assertFalse(state.isTicketsRefreshing)
        }

    @Test
    fun `tickets offline shows the offline state, then a snackbar once a list is shown`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            advanceUntilIdle()
            help.failTicketsWith = AppError.Network()
            viewModel.onTabSelected(HelpTab.TICKETS)
            advanceUntilIdle()
            var state = viewModel.uiState.value
            assertTrue(state.isTicketsOffline)
            assertEquals(UiText.Res(CoreR.string.state_offline), state.ticketsError)
            assertNull(state.message)

            viewModel.refreshTickets()
            advanceUntilIdle()
            state = viewModel.uiState.value
            assertTrue(state.ticketsLoaded)
            assertNull(state.ticketsError)

            help.failTicketsWith = AppError.Server(502)
            viewModel.refreshTickets()
            advanceUntilIdle()
            state = viewModel.uiState.value
            assertNull(state.ticketsError) // list kept
            assertEquals(2, state.tickets.size)
            assertEquals(UiText.of(CoreR.string.error_server, 502), state.message)
        }

    private class FakeHelpRepository : HelpRepository {
        val faqLanguages = mutableListOf<String>()
        val contactRequests = mutableListOf<ContactRequest>()
        var ticketCalls = 0
        var failFaqWith: AppError? = null
        var failContactWith: AppError? = null
        var failTicketsWith: AppError? = null

        private val faq =
            listOf(
                FaqCategory(
                    key = "coins",
                    title = "Pièces",
                    entries =
                        listOf(
                            FaqEntry("q1", "Comment acheter des pièces ?", "Depuis l'onglet Boutique."),
                            FaqEntry("q2", "Mon achat n'apparaît pas", "Le solde se met à jour en quelques minutes."),
                        ),
                ),
                FaqCategory(
                    key = "playback",
                    title = "Lecture",
                    entries =
                        listOf(
                            FaqEntry("q3", "La vidéo saccade", "Les épisodes sont sous-titrés et adaptent la qualité."),
                        ),
                ),
            )

        private val tickets =
            listOf(
                SupportTicket(
                    id = "t1",
                    category = ContactCategory.PAYMENT,
                    subject = "Ancien",
                    status = TicketStatus.CLOSED,
                    messages = listOf(TicketMessage(TicketAuthor.USER, "Bonjour", 1_000L)),
                    createdAtEpochMs = 1_000L,
                    updatedAtEpochMs = 2_000L,
                ),
                SupportTicket(
                    id = "t2",
                    category = ContactCategory.OTHER,
                    subject = "Récent",
                    status = TicketStatus.ANSWERED,
                    messages =
                        listOf(
                            TicketMessage(TicketAuthor.USER, "Question", 5_000L),
                            TicketMessage(TicketAuthor.SUPPORT, "Réponse", 6_000L),
                        ),
                    createdAtEpochMs = 5_000L,
                    updatedAtEpochMs = 6_000L,
                ),
            )

        override suspend fun getFaq(language: String): AppResult<List<FaqCategory>> {
            faqLanguages += language
            return failFaqWith.consume() ?: AppResult.Success(faq)
        }

        override suspend fun sendContact(request: ContactRequest): AppResult<String> {
            failContactWith.consume()?.let { return it }
            contactRequests += request
            return AppResult.Success("t-new")
        }

        override suspend fun getTickets(): AppResult<List<SupportTicket>> {
            ticketCalls++
            return failTicketsWith.consume() ?: AppResult.Success(tickets)
        }

        /** Returns the pending failure once (then the next call succeeds). */
        private fun AppError?.consume(): AppResult.Failure? {
            val error = this ?: return null
            when {
                error === failFaqWith -> failFaqWith = null
                error === failContactWith -> failContactWith = null
                error === failTicketsWith -> failTicketsWith = null
            }
            return AppResult.Failure(error)
        }
    }
}
