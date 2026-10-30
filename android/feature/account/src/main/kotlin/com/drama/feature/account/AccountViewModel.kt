package com.drama.feature.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.auth.AuthConfig
import com.drama.core.common.locale.DeviceLocaleProvider
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.AuthProvider
import com.drama.domain.model.OtpChallenge
import com.drama.domain.model.SessionState
import com.drama.domain.model.SignInResult
import com.drama.domain.model.UserProfile
import com.drama.domain.repository.AccountRepository
import com.drama.domain.repository.SessionRepository
import com.drama.domain.repository.WalletRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.drama.core.ui.R as CoreR

/** Which screen of the account flow is shown. */
enum class AccountStep {
    OVERVIEW,
    PHONE,
    OTP,
    EMAIL,
    EDIT_PROFILE,
    SETTINGS,
}

enum class EmailMode {
    LOGIN,
    REGISTER,
}

data class AccountUiState(
    val session: SessionState = SessionState.Unknown,
    val profile: UserProfile? = null,
    val step: AccountStep = AccountStep.OVERVIEW,
    val isBusy: Boolean = false,
    val googleConfigured: Boolean = false,
    // Phone
    val countries: List<Country> = Country.ALL,
    val country: Country = Country.DEFAULT,
    val phoneNumber: String = "",
    val phoneError: UiText? = null,
    // OTP
    val phoneE164: String? = null,
    val challenge: OtpChallenge? = null,
    val otpCode: String = "",
    val otpError: UiText? = null,
    /** Seconds before "Renvoyer le code" becomes available (from `resendAfter`). */
    val resendInSeconds: Int = 0,
    // E-mail
    val emailMode: EmailMode = EmailMode.LOGIN,
    val email: String = "",
    val password: String = "",
    val emailError: UiText? = null,
    // Profile edit
    val editDisplayName: String = "",
    val confirmDelete: Boolean = false,
    /** One-shot snackbar text. */
    val message: UiText? = null,
    /** Coin balance shown under "Mon portefeuille" (M-32); null until fetched. */
    val coinBalance: Int? = null,
) {
    val isGuest: Boolean get() = (session as? SessionState.Authenticated)?.isGuest != false
    val isRegistered: Boolean get() = (session as? SessionState.Authenticated)?.isGuest == false
    val canResend: Boolean get() = resendInSeconds == 0 && !isBusy
    val otpComplete: Boolean get() = otpCode.length == OTP_LENGTH

    companion object {
        const val OTP_LENGTH = 6
        const val MIN_PASSWORD_LENGTH = 8
    }
}

/**
 * Account tab (M-50/M-51/M-52, S05-A2-01/02). A guest sees the three sign-in options; a registered viewer the
 * profile card. Every successful sign-in replaces the session in place (history kept) and shows
 * "Compte rattaché, votre historique est conservé" when the server reports `linked = true`.
 * Texts are [UiText] so the view model stays free of Android resources (S05-A2-03); language and notification
 * preferences live in [SettingsViewModel].
 */
@HiltViewModel
class AccountViewModel
    @Inject
    constructor(
        private val account: AccountRepository,
        private val sessionRepository: SessionRepository,
        private val analytics: AnalyticsTracker,
        private val authConfig: AuthConfig,
        deviceLocale: DeviceLocaleProvider,
        private val logger: Logger,
        private val wallet: WalletRepository,
    ) : ViewModel() {
        private val uiStateFlow =
            MutableStateFlow(
                AccountUiState(
                    googleConfigured = authConfig.isGoogleConfigured,
                    country = Country.forIso(deviceLocale.country),
                ),
            )
        val uiState: StateFlow<AccountUiState> = uiStateFlow.asStateFlow()

        private var resendTimer: Job? = null

        init {
            viewModelScope.launch {
                sessionRepository.state.collect { state ->
                    val wasRegistered = uiStateFlow.value.isRegistered
                    uiStateFlow.update { it.copy(session = state) }
                    if (state is SessionState.Authenticated && !state.isGuest && !wasRegistered) refreshProfile()
                }
            }
            viewModelScope.launch {
                account.profile.collect { profile ->
                    uiStateFlow.update {
                        it.copy(
                            profile = profile,
                            editDisplayName = profile?.displayName ?: it.editDisplayName,
                        )
                    }
                }
            }
            viewModelScope.launch {
                wallet.wallet.collect { w -> uiStateFlow.update { it.copy(coinBalance = w?.total ?: it.coinBalance) } }
            }
            viewModelScope.launch {
                val result = wallet.refresh()
                if (result is AppResult.Failure) logger.w(TAG, "GET /wallet failed in profile: ${result.error}")
            }
        }

        private fun refreshProfile() {
            viewModelScope.launch {
                val result = account.refreshProfile()
                if (result is AppResult.Failure) logger.w(TAG, "GET /me failed: ${result.error}")
            }
        }

        // --- navigation inside the tab ---

        fun onStep(step: AccountStep) {
            uiStateFlow.update { it.copy(step = step, phoneError = null, otpError = null, emailError = null) }
        }

        fun onBack() {
            val target =
                when (uiStateFlow.value.step) {
                    AccountStep.OTP -> AccountStep.PHONE
                    else -> AccountStep.OVERVIEW
                }
            onStep(target)
        }

        fun onMessageShown() = uiStateFlow.update { it.copy(message = null) }

        // --- Google (M-51) ---

        /** Called with the Credential Manager ID token; the server verifies it against `GOOGLE_CLIENT_IDS`. */
        fun onGoogleIdToken(idToken: String) {
            if (!authConfig.isGoogleConfigured) return
            signIn(AuthProvider.GOOGLE, signup = false) { account.signInWithGoogle(idToken) }
        }

        fun onGoogleFailed(message: String?) {
            uiStateFlow.update {
                it.copy(
                    isBusy = false,
                    message =
                        message?.let(UiText::Raw) ?: UiText.Res(R.string.account_msg_google_failed),
                )
            }
        }

        // --- Phone + OTP (M-51) ---

        fun onCountrySelected(country: Country) = uiStateFlow.update { it.copy(country = country, phoneError = null) }

        fun onPhoneChanged(value: String) = uiStateFlow.update { it.copy(phoneNumber = value, phoneError = null) }

        fun onRequestOtp() {
            val state = uiStateFlow.value
            val e164 = Country.toE164(state.country, state.phoneNumber)
            if (e164 == null) {
                uiStateFlow.update { it.copy(phoneError = UiText.Res(R.string.account_phone_invalid)) }
                return
            }
            uiStateFlow.update { it.copy(isBusy = true, phoneError = null) }
            viewModelScope.launch {
                when (val result = account.requestOtp(e164)) {
                    is AppResult.Success -> {
                        uiStateFlow.update {
                            it.copy(
                                isBusy = false,
                                phoneE164 = e164,
                                challenge = result.value,
                                otpCode = "",
                                otpError = null,
                                step = AccountStep.OTP,
                            )
                        }
                        startResendTimer(result.value.resendAfterSeconds)
                    }
                    is AppResult.Failure ->
                        uiStateFlow.update {
                            it.copy(
                                isBusy = false,
                                phoneError = result.error.toMessage(R.string.account_otp_send_failed),
                            )
                        }
                }
            }
        }

        fun onResendOtp() {
            if (!uiStateFlow.value.canResend) return
            onRequestOtp()
        }

        fun onOtpChanged(value: String) {
            val digits = value.filter(Char::isDigit).take(AccountUiState.OTP_LENGTH)
            uiStateFlow.update { it.copy(otpCode = digits, otpError = null) }
            if (digits.length == AccountUiState.OTP_LENGTH) onVerifyOtp()
        }

        fun onVerifyOtp() {
            val state = uiStateFlow.value
            val challenge = state.challenge ?: return
            if (!state.otpComplete || state.isBusy) return
            signIn(AuthProvider.PHONE, signup = false, errorField = ErrorField.OTP) {
                account.verifyOtp(challenge.requestId, state.otpCode)
            }
        }

        private fun startResendTimer(seconds: Int) {
            resendTimer?.cancel()
            uiStateFlow.update { it.copy(resendInSeconds = seconds.coerceAtLeast(0)) }
            resendTimer =
                viewModelScope.launch {
                    while (uiStateFlow.value.resendInSeconds > 0) {
                        delay(1_000L)
                        uiStateFlow.update { it.copy(resendInSeconds = (it.resendInSeconds - 1).coerceAtLeast(0)) }
                    }
                }
        }

        // --- E-mail (M-51) ---

        fun onEmailModeChanged(mode: EmailMode) = uiStateFlow.update { it.copy(emailMode = mode, emailError = null) }

        fun onEmailChanged(value: String) = uiStateFlow.update { it.copy(email = value, emailError = null) }

        fun onPasswordChanged(value: String) = uiStateFlow.update { it.copy(password = value, emailError = null) }

        fun onSubmitEmail() {
            val state = uiStateFlow.value
            val email = state.email.trim()
            when {
                !EMAIL.matches(email) ->
                    uiStateFlow.update { it.copy(emailError = UiText.Res(R.string.account_email_invalid)) }
                state.password.length < AccountUiState.MIN_PASSWORD_LENGTH ->
                    uiStateFlow.update {
                        it.copy(
                            emailError =
                                UiText.of(R.string.account_password_too_short, AccountUiState.MIN_PASSWORD_LENGTH),
                        )
                    }
                state.emailMode == EmailMode.REGISTER ->
                    signIn(AuthProvider.EMAIL, signup = true, errorField = ErrorField.EMAIL) {
                        account.registerWithEmail(email, state.password)
                    }
                else ->
                    signIn(AuthProvider.EMAIL, signup = false, errorField = ErrorField.EMAIL) {
                        account.signInWithEmail(email, state.password)
                    }
            }
        }

        // --- Profile (M-52) ---

        fun onEditDisplayNameChanged(value: String) =
            uiStateFlow.update { it.copy(editDisplayName = value.take(MAX_NAME)) }

        /** Display name only: the language moved to the settings screen (S05-A1-03). */
        fun onSaveProfile() {
            val state = uiStateFlow.value
            uiStateFlow.update { it.copy(isBusy = true) }
            viewModelScope.launch {
                val result = account.updateProfile(displayName = state.editDisplayName.trim())
                uiStateFlow.update {
                    when (result) {
                        is AppResult.Success ->
                            it.copy(
                                isBusy = false,
                                step = AccountStep.OVERVIEW,
                                message = UiText.Res(R.string.account_msg_profile_updated),
                            )
                        is AppResult.Failure ->
                            it.copy(
                                isBusy = false,
                                message = result.error.toMessage(R.string.account_msg_update_failed),
                            )
                    }
                }
            }
        }

        fun onLogout() {
            uiStateFlow.update { it.copy(isBusy = true) }
            viewModelScope.launch {
                val result = account.logout()
                uiStateFlow.update {
                    it.copy(
                        isBusy = false,
                        step = AccountStep.OVERVIEW,
                        message =
                            when (result) {
                                is AppResult.Success -> UiText.Res(R.string.account_msg_logged_out)
                                is AppResult.Failure -> result.error.toMessage(R.string.account_msg_logout_incomplete)
                            },
                    )
                }
            }
        }

        fun onDeleteRequested(confirm: Boolean) = uiStateFlow.update { it.copy(confirmDelete = confirm) }

        fun onDeleteConfirmed() {
            uiStateFlow.update { it.copy(isBusy = true, confirmDelete = false) }
            viewModelScope.launch {
                val result = account.deleteAccount()
                uiStateFlow.update {
                    it.copy(
                        isBusy = false,
                        step = AccountStep.OVERVIEW,
                        message =
                            when (result) {
                                is AppResult.Success -> UiText.Res(R.string.account_msg_deleted)
                                is AppResult.Failure -> result.error.toMessage(R.string.account_msg_delete_failed)
                            },
                    )
                }
            }
        }

        // --- shared sign-in path ---

        private enum class ErrorField { NONE, OTP, EMAIL }

        private fun signIn(
            provider: AuthProvider,
            signup: Boolean,
            errorField: ErrorField = ErrorField.NONE,
            call: suspend () -> AppResult<SignInResult>,
        ) {
            if (uiStateFlow.value.isBusy) return
            uiStateFlow.update { it.copy(isBusy = true) }
            viewModelScope.launch {
                when (val result = call()) {
                    is AppResult.Success -> onSignedIn(provider, signup, result.value)
                    is AppResult.Failure -> {
                        val message = result.error.toMessage(R.string.account_msg_sign_in_failed)
                        logger.w(TAG, "sign-in failed provider=$provider: ${result.error}")
                        uiStateFlow.update {
                            when (errorField) {
                                ErrorField.OTP -> it.copy(isBusy = false, otpError = message, otpCode = "")
                                ErrorField.EMAIL -> it.copy(isBusy = false, emailError = message)
                                ErrorField.NONE -> it.copy(isBusy = false, message = message)
                            }
                        }
                    }
                }
            }
        }

        private fun onSignedIn(
            provider: AuthProvider,
            signup: Boolean,
            result: SignInResult,
        ) {
            resendTimer?.cancel()
            val event =
                if (signup) {
                    AnalyticsEvent.Signup(provider.wireName, result.linked)
                } else {
                    AnalyticsEvent.Login(provider.wireName, result.linked)
                }
            analytics.track(event)
            analytics.setUserId(result.user.id)
            uiStateFlow.update {
                it.copy(
                    isBusy = false,
                    step = AccountStep.OVERVIEW,
                    profile = result.user,
                    password = "",
                    otpCode = "",
                    challenge = null,
                    message = if (result.linked) LINKED_MESSAGE else UiText.Res(R.string.account_msg_signed_in),
                )
            }
        }

        private fun AppError.toMessage(fallback: Int): UiText =
            when (this) {
                is AppError.Network -> UiText.Res(CoreR.string.error_network_short)
                is AppError.Unauthenticated -> UiText.Res(R.string.account_err_invalid_credentials)
                is AppError.Http ->
                    when (serverCode) {
                        "INVALID_CREDENTIALS" -> UiText.Res(R.string.account_err_invalid_credentials)
                        "EMAIL_TAKEN" -> UiText.Res(R.string.account_err_email_taken)
                        "OTP_INVALID", "INVALID_OTP", "OTP_EXPIRED" -> UiText.Res(R.string.account_err_otp_invalid)
                        "OTP_TOO_MANY_ATTEMPTS" -> UiText.Res(R.string.account_err_otp_attempts)
                        "GOOGLE_AUTH_DISABLED" -> UiText.Res(R.string.account_err_google_disabled)
                        "RATE_LIMITED" -> UiText.Res(CoreR.string.error_rate_limited)
                        else -> {
                            val serverMessage = message
                            when {
                                code == HTTP_NOT_IMPLEMENTED -> UiText.Res(CoreR.string.state_coming_soon)
                                serverMessage != null -> UiText.Raw(serverMessage)
                                else -> UiText.Res(fallback)
                            }
                        }
                    }
                is AppError.Server -> UiText.of(CoreR.string.error_server_short, code)
                else -> UiText.Res(fallback)
            }

        companion object {
            private const val TAG = "Account"
            private const val MAX_NAME = 80
            private const val HTTP_NOT_IMPLEMENTED = 501
            val LINKED_MESSAGE: UiText = UiText.Res(R.string.account_msg_linked)
            private val EMAIL = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
        }
    }
