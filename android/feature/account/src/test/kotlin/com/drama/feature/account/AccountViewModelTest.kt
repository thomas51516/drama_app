package com.drama.feature.account

import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.auth.AuthConfig
import com.drama.core.common.locale.FixedDeviceLocale
import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.AccountDeletion
import com.drama.domain.model.AuthProvider
import com.drama.domain.model.LedgerPage
import com.drama.domain.model.LedgerType
import com.drama.domain.model.NotificationPreferences
import com.drama.domain.model.OtpChallenge
import com.drama.domain.model.SessionReplacement
import com.drama.domain.model.SessionState
import com.drama.domain.model.SignInResult
import com.drama.domain.model.UserProfile
import com.drama.domain.model.Wallet
import com.drama.domain.repository.AccountRepository
import com.drama.domain.repository.SessionRepository
import com.drama.domain.repository.WalletRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AccountViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val session = FakeSessionRepository()
    private val account =
        FakeAccountRepository(onLogout = {
            session.state.value =
                SessionState.Authenticated("guest-2", true)
        })
    private val events = mutableListOf<AnalyticsEvent>()
    private val analytics =
        object : AnalyticsTracker {
            override fun track(event: AnalyticsEvent) {
                events += event
            }

            override fun setUserId(userId: String?) = Unit
        }

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(googleClientId: String = "web-client-id") =
        AccountViewModel(
            account = account,
            sessionRepository = session,
            analytics = analytics,
            authConfig = AuthConfig(googleClientId),
            deviceLocale = FixedDeviceLocale("fr", "CI"),
            logger = NoOpLogger,
            wallet = walletRepository,
        )

    private val walletRepository = FakeWalletRepository()

    @Test
    fun `guest sees the options with the device country preselected and google disabled when unconfigured`() =
        runTest(dispatcher) {
            val viewModel = viewModel(googleClientId = "")
            advanceUntilIdle()
            val state = viewModel.uiState.value
            assertTrue(state.isGuest)
            assertFalse(state.googleConfigured)
            assertEquals("CI", state.country.iso)
            assertEquals(AccountStep.OVERVIEW, state.step)
        }

    @Test
    fun `otp request opens the code step and the resend timer counts down from resendAfter`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            viewModel.onStep(AccountStep.PHONE)
            viewModel.onPhoneChanged("07 00 00 00 00")
            viewModel.onRequestOtp()
            runCurrent() // not advanceUntilIdle: that would run the 60 s countdown to its end

            val state = viewModel.uiState.value
            assertEquals(listOf("+2250700000000"), account.otpRequests) // CI keeps the leading 0 (10 digits)
            assertEquals(AccountStep.OTP, state.step)
            assertEquals(60, state.resendInSeconds)
            assertFalse(state.canResend)

            advanceTimeBy(59_000)
            runCurrent()
            assertEquals(1, viewModel.uiState.value.resendInSeconds)
            advanceTimeBy(1_001)
            runCurrent()
            assertTrue(viewModel.uiState.value.canResend)

            viewModel.onResendOtp()
            runCurrent()
            assertEquals(2, account.otpRequests.size)
            assertEquals(60, viewModel.uiState.value.resendInSeconds)
        }

    @Test
    fun `invalid phone number is rejected locally`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            viewModel.onPhoneChanged("12")
            viewModel.onRequestOtp()
            advanceUntilIdle()
            assertEquals(UiText.Res(R.string.account_phone_invalid), viewModel.uiState.value.phoneError)
            assertTrue(account.otpRequests.isEmpty())
        }

    @Test
    fun `six digits verify automatically and a linked account shows the history message`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            viewModel.onCountrySelected(Country.forIso("TG"))
            viewModel.onPhoneChanged("90000000")
            viewModel.onRequestOtp()
            advanceUntilIdle()
            account.linked = true

            viewModel.onOtpChanged("12-34 56")
            advanceUntilIdle()

            val state = viewModel.uiState.value
            assertEquals(listOf("req-1" to "123456"), account.verifications)
            assertEquals(AccountViewModel.LINKED_MESSAGE, state.message)
            assertEquals(AccountStep.OVERVIEW, state.step)
            assertTrue(events.contains(AnalyticsEvent.Login("phone", linked = true)))
            assertEquals("+22890000000", state.profile?.phone)
        }

    @Test
    fun `wrong code shows the error and clears the field`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            viewModel.onPhoneChanged("90000000")
            viewModel.onRequestOtp()
            advanceUntilIdle()
            account.failNextWith = AppError.Http(400, "OTP_INVALID", "invalid")

            viewModel.onOtpChanged("000000")
            advanceUntilIdle()
            assertEquals(UiText.Res(R.string.account_err_otp_invalid), viewModel.uiState.value.otpError)
            assertEquals("", viewModel.uiState.value.otpCode)
            assertEquals(AccountStep.OTP, viewModel.uiState.value.step)
        }

    @Test
    fun `email register validates the password and tracks signup`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            viewModel.onStep(AccountStep.EMAIL)
            viewModel.onEmailModeChanged(EmailMode.REGISTER)
            viewModel.onEmailChanged("thomas@example.com")
            viewModel.onPasswordChanged("short")
            viewModel.onSubmitEmail()
            advanceUntilIdle()
            assertEquals(
                UiText.of(R.string.account_password_too_short, 8),
                viewModel.uiState.value.emailError,
            )
            assertTrue(account.registrations.isEmpty())

            viewModel.onPasswordChanged("longenough")
            viewModel.onSubmitEmail()
            advanceUntilIdle()
            assertEquals(listOf("thomas@example.com"), account.registrations)
            assertTrue(events.contains(AnalyticsEvent.Signup("email", linked = false)))
            assertEquals(UiText.Res(R.string.account_msg_signed_in), viewModel.uiState.value.message)
        }

    @Test
    fun `registered viewer loads the profile and logout returns to guest`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            advanceUntilIdle()
            session.state.value = SessionState.Authenticated("u1", isGuest = false)
            advanceUntilIdle()
            assertTrue(viewModel.uiState.value.isRegistered)
            assertEquals(1, account.profileRefreshes)
            assertEquals(
                "Thomas",
                viewModel.uiState.value.profile
                    ?.displayName,
            )

            viewModel.onLogout()
            advanceUntilIdle()
            assertEquals(1, account.logouts)
            assertEquals(UiText.Res(R.string.account_msg_logged_out), viewModel.uiState.value.message)
            assertTrue(viewModel.uiState.value.isGuest)
            assertNull(viewModel.uiState.value.profile)
        }

    private class FakeWalletRepository : WalletRepository {
        val state = MutableStateFlow<Wallet?>(null)
        var refreshResult: AppResult<Wallet> =
            AppResult.Success(
                Wallet(purchased = 50, bonus = 0, total = 50, autoUnlock = false),
            )
        var autoUnlockResult: AppResult<Unit> = AppResult.Success(Unit)
        val autoUnlockCalls = mutableListOf<Boolean>()
        override val wallet: Flow<Wallet?> = state

        override suspend fun refresh(): AppResult<Wallet> {
            (refreshResult as? AppResult.Success)?.let { state.value = it.value }
            return refreshResult
        }

        override suspend fun transactions(
            page: Int,
            pageSize: Int,
            type: LedgerType?,
        ): AppResult<LedgerPage> = AppResult.Success(LedgerPage(emptyList(), 0, page, pageSize))

        override suspend fun setAutoUnlock(enabled: Boolean): AppResult<Unit> {
            autoUnlockCalls += enabled
            if (autoUnlockResult is AppResult.Success) {
                state.value =
                    (state.value ?: Wallet.EMPTY).copy(autoUnlock = enabled)
            }
            return autoUnlockResult
        }
    }

    private class FakeSessionRepository : SessionRepository {
        override val state = MutableStateFlow<SessionState>(SessionState.Authenticated("guest-1", isGuest = true))

        override suspend fun ensureSession(): AppResult<SessionState.Authenticated> =
            AppResult.Success(state.value as SessionState.Authenticated)

        override suspend fun logout() {
            state.value = SessionState.SignedOut
        }

        override val sessionReplacement: Flow<SessionReplacement?> = MutableStateFlow(null)

        override fun dismissSessionReplacement() = Unit
    }

    private class FakeAccountRepository(
        private val onLogout: () -> Unit,
    ) : AccountRepository {
        val otpRequests = mutableListOf<String>()
        val verifications = mutableListOf<Pair<String, String>>()
        val registrations = mutableListOf<String>()
        var profileRefreshes = 0
        var logouts = 0
        var linked = false
        var failNextWith: AppError? = null
        private val profileFlow = MutableStateFlow<UserProfile?>(null)
        override val profile: Flow<UserProfile?> = profileFlow

        private fun user(
            phone: String? = null,
            email: String? = null,
        ) = UserProfile(
            id = "u1",
            isGuest = false,
            displayName = "Thomas",
            email = email,
            phone = phone,
            country = "TG",
            language = "fr",
            isVip = false,
            vipExpiresAtEpochMs = null,
            providers = listOf(AuthProvider.PHONE),
            createdAtEpochMs = null,
        )

        private fun <T> failOr(block: () -> T): AppResult<T> {
            val error = failNextWith
            if (error != null) {
                failNextWith = null
                return AppResult.Failure(error)
            }
            return AppResult.Success(block())
        }

        override suspend fun refreshProfile(): AppResult<UserProfile> {
            profileRefreshes++
            return failOr { user().also { profileFlow.value = it } }
        }

        override suspend fun signInWithGoogle(idToken: String): AppResult<SignInResult> =
            failOr {
                SignInResult(user(), linked)
            }

        override suspend fun requestOtp(phone: String): AppResult<OtpChallenge> {
            otpRequests += phone
            return failOr { OtpChallenge("req-${otpRequests.size}", 300, 60) }
        }

        override suspend fun verifyOtp(
            requestId: String,
            code: String,
        ): AppResult<SignInResult> {
            verifications += requestId to code
            return failOr { SignInResult(user(phone = otpRequests.last()).also { profileFlow.value = it }, linked) }
        }

        override suspend fun registerWithEmail(
            email: String,
            password: String,
        ): AppResult<SignInResult> {
            registrations += email
            return failOr { SignInResult(user(email = email).also { profileFlow.value = it }, linked) }
        }

        override suspend fun signInWithEmail(
            email: String,
            password: String,
        ): AppResult<SignInResult> = failOr { SignInResult(user(email = email), linked) }

        override suspend fun updateProfile(
            displayName: String?,
            language: String?,
            country: String?,
            notificationPreferences: NotificationPreferences?,
        ): AppResult<UserProfile> = failOr { user().copy(displayName = displayName, language = language) }

        override suspend fun logout(): AppResult<Unit> {
            logouts++
            profileFlow.value = null
            onLogout()
            return AppResult.Success(Unit)
        }

        override suspend fun deleteAccount(): AppResult<AccountDeletion> = failOr { AccountDeletion(null) }
    }
}
