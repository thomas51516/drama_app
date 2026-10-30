package com.drama.feature.account

import com.drama.core.common.locale.AppLanguage
import com.drama.core.common.locale.AppLocaleController
import com.drama.core.common.locale.FixedDeviceLocale
import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.AccountDeletion
import com.drama.domain.model.NotificationPreferences
import com.drama.domain.model.OtpChallenge
import com.drama.domain.model.PlayerSettings
import com.drama.domain.model.SignInResult
import com.drama.domain.model.SubtitleMode
import com.drama.domain.model.UserProfile
import com.drama.domain.model.VideoQuality
import com.drama.domain.repository.AccountRepository
import com.drama.domain.repository.PlayerSettingsRepository
import com.drama.domain.repository.PushRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val account = FakeAccountRepository()
    private val push = FakePush()
    private val locale = FakeLocaleController()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(deviceLanguage: String = "fr") =
        SettingsViewModel(
            account = account,
            push = push,
            localeController = locale,
            deviceLocale = FixedDeviceLocale(deviceLanguage, "CI"),
            logger = NoOpLogger,
            restorePurchases = { AppResult.Success(emptyList()) },
            playerSettings = FakePlayerSettingsRepository(),
        )

    @Test
    fun `initial language is the forced app language, else the device language mapped to a supported one`() =
        runTest(dispatcher) {
            assertEquals(AppLanguage.FRENCH, viewModel(deviceLanguage = "de").uiState.value.language)
            assertEquals(AppLanguage.PORTUGUESE, viewModel(deviceLanguage = "pt").uiState.value.language)
            locale.current = AppLanguage.SPANISH
            assertEquals(AppLanguage.SPANISH, viewModel(deviceLanguage = "en").uiState.value.language)
        }

    @Test
    fun `preferences come from the profile fetched at start`() =
        runTest(dispatcher) {
            account.profilePrefs = NotificationPreferences(newEpisodes = true, offers = false, checkinReminder = true)
            val viewModel = viewModel()
            advanceUntilIdle()
            assertEquals(1, account.profileRefreshes)
            assertTrue(viewModel.uiState.value.preferencesLoaded)
            assertFalse(viewModel.uiState.value.isEnabled(NotificationPreferenceKind.OFFERS))
            assertTrue(viewModel.uiState.value.isEnabled(NotificationPreferenceKind.NEW_EPISODES))
        }

    @Test
    fun `selecting a language applies it immediately and saves it server-side`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            viewModel.onLanguageSelected(AppLanguage.ENGLISH)
            assertEquals(AppLanguage.ENGLISH, locale.current) // applied before the network call
            assertEquals(AppLanguage.ENGLISH, viewModel.uiState.value.language)
            advanceUntilIdle()
            assertEquals(listOf("en"), account.languages)
            assertEquals(UiText.Res(R.string.settings_msg_language_saved), viewModel.uiState.value.message)

            // Same language again: nothing happens.
            viewModel.onLanguageSelected(AppLanguage.ENGLISH)
            advanceUntilIdle()
            assertEquals(1, account.languages.size)
        }

    @Test
    fun `language stays applied locally when the server is unreachable`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            advanceUntilIdle() // initial GET /me done
            account.failNextWith = AppError.Network()
            viewModel.onLanguageSelected(AppLanguage.SPANISH)
            advanceUntilIdle()
            assertEquals(AppLanguage.SPANISH, locale.current)
            assertEquals(AppLanguage.SPANISH, viewModel.uiState.value.language)
            assertEquals(UiText.Res(R.string.settings_msg_language_local_only), viewModel.uiState.value.message)
        }

    @Test
    fun `preference toggle is optimistic and sends the three flags`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            advanceUntilIdle()
            viewModel.onPreferenceChanged(NotificationPreferenceKind.OFFERS, false)
            assertFalse(viewModel.uiState.value.isEnabled(NotificationPreferenceKind.OFFERS))
            advanceUntilIdle()
            assertEquals(
                listOf(NotificationPreferences(newEpisodes = true, offers = false, checkinReminder = true)),
                account.preferenceUpdates,
            )
            assertEquals(UiText.Res(R.string.settings_msg_prefs_saved), viewModel.uiState.value.message)
        }

    @Test
    fun `failed preference update rolls back and reports`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            advanceUntilIdle()
            account.failNextWith = AppError.Server(503)
            viewModel.onPreferenceChanged(NotificationPreferenceKind.CHECKIN_REMINDER, false)
            assertFalse(viewModel.uiState.value.isEnabled(NotificationPreferenceKind.CHECKIN_REMINDER))
            advanceUntilIdle()
            assertTrue(viewModel.uiState.value.isEnabled(NotificationPreferenceKind.CHECKIN_REMINDER))
            assertEquals(UiText.of(com.drama.core.ui.R.string.error_server_short, 503), viewModel.uiState.value.message)
        }

    @Test
    fun `enabling a preference while the system permission is denied asks for it once`() =
        runTest(dispatcher) {
            val viewModel = viewModel()
            viewModel.onNotificationsAllowedChanged(false)
            viewModel.onPreferenceChanged(NotificationPreferenceKind.OFFERS, false)
            runCurrent()
            assertFalse(viewModel.uiState.value.requestPermission) // turning off never prompts
            viewModel.onPreferenceChanged(NotificationPreferenceKind.OFFERS, true)
            assertTrue(viewModel.uiState.value.requestPermission)
            viewModel.onPermissionRequested()
            assertFalse(viewModel.uiState.value.requestPermission)
            viewModel.onPermissionResult(true)
            advanceUntilIdle()
            assertEquals(true, viewModel.uiState.value.notificationsAllowed)
            assertEquals(1, push.promptsMarked)
        }

    private class FakeLocaleController : AppLocaleController {
        var current: AppLanguage? = null
        override val appLanguage: AppLanguage? get() = current

        override fun setAppLanguage(language: AppLanguage) {
            current = language
        }
    }

    private class FakePush : PushRepository {
        var promptsMarked = 0
        override val permissionPromptShown: Flow<Boolean> = MutableStateFlow(false)

        override suspend fun markPermissionPromptShown() {
            promptsMarked++
        }

        override suspend fun syncToken(force: Boolean): AppResult<Unit> = AppResult.Success(Unit)

        override suspend fun onNewToken(token: String): AppResult<Unit> = AppResult.Success(Unit)

        override suspend fun unregister(): AppResult<Unit> = AppResult.Success(Unit)
    }

    private class FakeAccountRepository : AccountRepository {
        var profileRefreshes = 0
        var profilePrefs = NotificationPreferences()
        var failNextWith: AppError? = null
        val languages = mutableListOf<String>()
        val preferenceUpdates = mutableListOf<NotificationPreferences>()
        private val profileFlow = MutableStateFlow<UserProfile?>(null)
        override val profile: Flow<UserProfile?> = profileFlow

        private fun user(prefs: NotificationPreferences = profilePrefs) =
            UserProfile(
                id = "g1",
                isGuest = true,
                displayName = null,
                email = null,
                phone = null,
                country = "CI",
                language = "fr",
                isVip = false,
                vipExpiresAtEpochMs = null,
                providers = emptyList(),
                createdAtEpochMs = null,
                notificationPreferences = prefs,
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

        override suspend fun signInWithGoogle(idToken: String): AppResult<SignInResult> = error("unused")

        override suspend fun requestOtp(phone: String): AppResult<OtpChallenge> = error("unused")

        override suspend fun verifyOtp(
            requestId: String,
            code: String,
        ): AppResult<SignInResult> = error("unused")

        override suspend fun registerWithEmail(
            email: String,
            password: String,
        ): AppResult<SignInResult> = error("unused")

        override suspend fun signInWithEmail(
            email: String,
            password: String,
        ): AppResult<SignInResult> = error("unused")

        override suspend fun updateProfile(
            displayName: String?,
            language: String?,
            country: String?,
            notificationPreferences: NotificationPreferences?,
        ): AppResult<UserProfile> {
            language?.let { languages += it }
            notificationPreferences?.let { preferenceUpdates += it }
            return failOr {
                val next = notificationPreferences ?: profilePrefs
                profilePrefs = next
                user(next).also { profileFlow.value = it }
            }
        }

        override suspend fun logout(): AppResult<Unit> = AppResult.Success(Unit)

        override suspend fun deleteAccount(): AppResult<AccountDeletion> = error("unused")
    }
}

private class FakePlayerSettingsRepository : PlayerSettingsRepository {
    override val settings: Flow<PlayerSettings> = MutableStateFlow(PlayerSettings())
    override val dataSaver: Flow<Boolean> = MutableStateFlow(false)

    override suspend fun setSpeed(speed: Float) = Unit

    override suspend fun setQuality(quality: VideoQuality) = Unit

    override suspend fun setSubtitles(mode: SubtitleMode) = Unit

    override suspend fun setDataSaver(enabled: Boolean) = Unit
}
