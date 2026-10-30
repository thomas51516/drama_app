package com.drama.feature.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.locale.AppLanguage
import com.drama.core.common.locale.AppLocaleController
import com.drama.core.common.locale.DeviceLocaleProvider
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.NotificationPreferences
import com.drama.domain.repository.AccountRepository
import com.drama.domain.repository.PushRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.drama.core.ui.R as CoreR

/** Which push preference a switch controls (`PATCH /me notificationPreferences`). */
enum class NotificationPreferenceKind {
    NEW_EPISODES,
    OFFERS,
    CHECKIN_REMINDER,
}

data class SettingsUiState(
    val language: AppLanguage = AppLanguage.DEFAULT,
    val languages: List<AppLanguage> = AppLanguage.entries,
    val preferences: NotificationPreferences = NotificationPreferences(),
    /** False while the profile has not been fetched yet (switches still usable, optimistic). */
    val preferencesLoaded: Boolean = false,
    val isBusy: Boolean = false,
    /** Set by the UI from the system state (API 33+); null when unknown / not applicable. */
    val notificationsAllowed: Boolean? = null,
    /** One-shot: the UI should launch the POST_NOTIFICATIONS request. */
    val requestPermission: Boolean = false,
    /** Hidden until M-17 ships; kept in the state so the switch can be enabled by flag later. */
    val showDataSaver: Boolean = false,
    val message: UiText? = null,
) {
    fun isEnabled(kind: NotificationPreferenceKind): Boolean =
        when (kind) {
            NotificationPreferenceKind.NEW_EPISODES -> preferences.newEpisodes
            NotificationPreferenceKind.OFFERS -> preferences.offers
            NotificationPreferenceKind.CHECKIN_REMINDER -> preferences.checkinReminder
        }
}

/**
 * Settings (M-52, S05-A1-03): language applied immediately through per-app locales and saved with `PATCH /me`,
 * notification preferences saved optimistically with rollback. Works for guests as well as registered viewers.
 */
@HiltViewModel
class SettingsViewModel
    @Inject
    constructor(
        private val account: AccountRepository,
        private val push: PushRepository,
        private val localeController: AppLocaleController,
        deviceLocale: DeviceLocaleProvider,
        private val logger: Logger,
    ) : ViewModel() {
        private val uiStateFlow =
            MutableStateFlow(
                SettingsUiState(
                    language = localeController.appLanguage ?: AppLanguage.fromTagOrDefault(deviceLocale.language),
                ),
            )
        val uiState: StateFlow<SettingsUiState> = uiStateFlow.asStateFlow()

        private var saveGeneration = 0

        init {
            viewModelScope.launch {
                account.profile.collect { profile ->
                    if (profile != null) {
                        uiStateFlow.update {
                            it.copy(
                                preferences = profile.notificationPreferences,
                                preferencesLoaded = true,
                            )
                        }
                    }
                }
            }
            viewModelScope.launch {
                val result = account.refreshProfile()
                if (result is AppResult.Failure) logger.w(TAG, "GET /me failed in settings: ${result.error}")
            }
        }

        /** Applies the language to the app right away (activities are recreated) then persists it server-side. */
        fun onLanguageSelected(language: AppLanguage) {
            if (language == uiStateFlow.value.language) return
            uiStateFlow.update { it.copy(language = language, isBusy = true) }
            localeController.setAppLanguage(language)
            viewModelScope.launch {
                val result = account.updateProfile(language = language.code)
                uiStateFlow.update {
                    it.copy(
                        isBusy = false,
                        message =
                            when (result) {
                                is AppResult.Success -> UiText.Res(R.string.settings_msg_language_saved)
                                is AppResult.Failure -> {
                                    logger.w(TAG, "language not saved server-side: ${result.error}")
                                    UiText.Res(R.string.settings_msg_language_local_only)
                                }
                            },
                    )
                }
            }
        }

        /** Optimistic toggle; the previous value is restored when `PATCH /me` fails. */
        fun onPreferenceChanged(
            kind: NotificationPreferenceKind,
            enabled: Boolean,
        ) {
            val previous = uiStateFlow.value.preferences
            val next =
                when (kind) {
                    NotificationPreferenceKind.NEW_EPISODES -> previous.copy(newEpisodes = enabled)
                    NotificationPreferenceKind.OFFERS -> previous.copy(offers = enabled)
                    NotificationPreferenceKind.CHECKIN_REMINDER -> previous.copy(checkinReminder = enabled)
                }
            if (next == previous) return
            val generation = ++saveGeneration
            uiStateFlow.update {
                it.copy(
                    preferences = next,
                    requestPermission = enabled && it.notificationsAllowed == false,
                )
            }
            viewModelScope.launch {
                when (val result = account.updateProfile(notificationPreferences = next)) {
                    is AppResult.Success ->
                        uiStateFlow.update { it.copy(message = UiText.Res(R.string.settings_msg_prefs_saved)) }
                    is AppResult.Failure -> {
                        logger.w(TAG, "notification preferences not saved: ${result.error}")
                        // Only roll back when no later toggle superseded this one.
                        if (generation == saveGeneration) {
                            uiStateFlow.update {
                                it.copy(preferences = previous, message = result.error.toMessage())
                            }
                        }
                    }
                }
            }
        }

        /** The UI reports the system permission state (API 33+); below that, notifications are always allowed. */
        fun onNotificationsAllowedChanged(allowed: Boolean?) =
            uiStateFlow.update { it.copy(notificationsAllowed = allowed) }

        fun onRequestPermission() = uiStateFlow.update { it.copy(requestPermission = true) }

        fun onPermissionRequested() = uiStateFlow.update { it.copy(requestPermission = false) }

        fun onPermissionResult(granted: Boolean) {
            uiStateFlow.update { it.copy(notificationsAllowed = granted, requestPermission = false) }
            viewModelScope.launch { push.markPermissionPromptShown() }
        }

        fun onMessageShown() = uiStateFlow.update { it.copy(message = null) }

        private fun AppError.toMessage(): UiText =
            when (this) {
                is AppError.Network -> UiText.Res(CoreR.string.error_network_short)
                is AppError.Server -> UiText.of(CoreR.string.error_server_short, code)
                else -> UiText.Res(R.string.settings_msg_prefs_failed)
            }

        private companion object {
            const val TAG = "Settings"
        }
    }
