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
import com.drama.domain.model.AuthProvider
import com.drama.domain.model.OtpChallenge
import com.drama.domain.model.SessionState
import com.drama.domain.model.SignInResult
import com.drama.domain.model.UserProfile
import com.drama.domain.repository.AccountRepository
import com.drama.domain.repository.SessionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Which screen of the account flow is shown. */
enum class AccountStep {
    OVERVIEW,
    PHONE,
    OTP,
    EMAIL,
    EDIT_PROFILE,
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
    val phoneError: String? = null,
    // OTP
    val phoneE164: String? = null,
    val challenge: OtpChallenge? = null,
    val otpCode: String = "",
    val otpError: String? = null,
    /** Seconds before "Renvoyer le code" becomes available (from `resendAfter`). */
    val resendInSeconds: Int = 0,
    // E-mail
    val emailMode: EmailMode = EmailMode.LOGIN,
    val email: String = "",
    val password: String = "",
    val emailError: String? = null,
    // Profile edit
    val editDisplayName: String = "",
    val editLanguage: String = "fr",
    val confirmDelete: Boolean = false,
    /** One-shot snackbar text. */
    val message: String? = null,
) {
    val isGuest: Boolean get() = (session as? SessionState.Authenticated)?.isGuest != false
    val isRegistered: Boolean get() = (session as? SessionState.Authenticated)?.isGuest == false
    val canResend: Boolean get() = resendInSeconds == 0 && !isBusy
    val otpComplete: Boolean get() = otpCode.length == OTP_LENGTH

    companion object {
        const val OTP_LENGTH = 6
        const val MIN_PASSWORD_LENGTH = 8
        val LANGUAGES: List<Pair<String, String>> =
            listOf(
                "fr" to "Français",
                "en" to "English",
                "es" to "Español",
                "pt" to "Português",
            )
    }
}

/**
 * Account tab (M-50/M-51/M-52, S05-A2-01/02). A guest sees the three sign-in options; a registered viewer the
 * profile card. Every successful sign-in replaces the session in place (history kept) and shows
 * "Compte rattaché, votre historique est conservé" when the server reports `linked = true`.
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
    ) : ViewModel() {
        private val uiStateFlow =
            MutableStateFlow(
                AccountUiState(
                    googleConfigured = authConfig.isGoogleConfigured,
                    country = Country.forIso(deviceLocale.country),
                    editLanguage = deviceLocale.language,
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
                            editLanguage = profile?.language ?: it.editLanguage,
                        )
                    }
                }
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
            uiStateFlow.update { it.copy(isBusy = false, message = message ?: "Connexion Google impossible") }
        }

        // --- Phone + OTP (M-51) ---

        fun onCountrySelected(country: Country) = uiStateFlow.update { it.copy(country = country, phoneError = null) }

        fun onPhoneChanged(value: String) = uiStateFlow.update { it.copy(phoneNumber = value, phoneError = null) }

        fun onRequestOtp() {
            val state = uiStateFlow.value
            val e164 = Country.toE164(state.country, state.phoneNumber)
            if (e164 == null) {
                uiStateFlow.update { it.copy(phoneError = "Numéro invalide") }
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
                                phoneError = result.error.toMessage("Envoi du code impossible"),
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
                !EMAIL.matches(email) -> uiStateFlow.update { it.copy(emailError = "Adresse e-mail invalide") }
                state.password.length < AccountUiState.MIN_PASSWORD_LENGTH ->
                    uiStateFlow.update {
                        it.copy(
                            emailError = "Mot de passe : ${AccountUiState.MIN_PASSWORD_LENGTH} caractères minimum",
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

        fun onEditLanguageChanged(value: String) = uiStateFlow.update { it.copy(editLanguage = value) }

        fun onSaveProfile() {
            val state = uiStateFlow.value
            uiStateFlow.update { it.copy(isBusy = true) }
            viewModelScope.launch {
                val result =
                    account.updateProfile(
                        displayName = state.editDisplayName.trim(),
                        language = state.editLanguage,
                    )
                uiStateFlow.update {
                    when (result) {
                        is AppResult.Success ->
                            it.copy(
                                isBusy = false,
                                step = AccountStep.OVERVIEW,
                                message = "Profil mis à jour",
                            )
                        is AppResult.Failure ->
                            it.copy(
                                isBusy = false,
                                message = result.error.toMessage("Mise à jour impossible"),
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
                                is AppResult.Success -> "Déconnecté. Vous continuez en invité."
                                is AppResult.Failure -> result.error.toMessage("Déconnexion incomplète")
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
                                is AppResult.Success -> "Compte supprimé : vos données seront effacées sous 30 jours."
                                is AppResult.Failure -> result.error.toMessage("Suppression impossible")
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
                        val message = result.error.toMessage("Connexion impossible")
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
                    message = if (result.linked) LINKED_MESSAGE else "Connecté",
                )
            }
        }

        private fun AppError.toMessage(fallback: String): String =
            when (this) {
                is AppError.Network -> "Pas de connexion"
                is AppError.Unauthenticated -> "Identifiants incorrects"
                is AppError.Http ->
                    when (serverCode) {
                        "INVALID_CREDENTIALS" -> "Identifiants incorrects"
                        "EMAIL_TAKEN" -> "Cette adresse e-mail est déjà utilisée"
                        "OTP_INVALID", "INVALID_OTP", "OTP_EXPIRED" -> "Code incorrect ou expiré"
                        "OTP_TOO_MANY_ATTEMPTS" -> "Trop d'essais, demandez un nouveau code"
                        "GOOGLE_AUTH_DISABLED" -> "Connexion Google non configurée"
                        "RATE_LIMITED" -> "Trop de demandes, réessayez dans quelques minutes"
                        else -> if (code == HTTP_NOT_IMPLEMENTED) "Bientôt disponible" else message ?: fallback
                    }
                is AppError.Server -> "Service indisponible ($code)"
                else -> fallback
            }

        companion object {
            private const val TAG = "Account"
            private const val MAX_NAME = 80
            private const val HTTP_NOT_IMPLEMENTED = 501
            const val LINKED_MESSAGE = "Compte rattaché, votre historique est conservé"
            private val EMAIL = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
        }
    }
