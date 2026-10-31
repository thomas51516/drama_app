package com.drama.feature.account

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.common.locale.AppLanguage
import com.drama.core.ui.component.DramaPrimaryButton
import com.drama.core.ui.text.asString
import com.drama.core.ui.theme.DramaColors
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.AuthProvider
import com.drama.domain.model.SessionState
import com.drama.domain.model.UserProfile
import com.drama.feature.account.google.GoogleSignInOutcome
import com.drama.feature.account.google.requestGoogleIdToken
import kotlinx.coroutines.launch
import java.util.Locale
import com.drama.core.ui.R as CoreR

data class AccountActions(
    val onStep: (AccountStep) -> Unit,
    val onBack: () -> Unit,
    val onGoogle: () -> Unit,
    val onCountrySelected: (Country) -> Unit,
    val onPhoneChanged: (String) -> Unit,
    val onRequestOtp: () -> Unit,
    val onResendOtp: () -> Unit,
    val onOtpChanged: (String) -> Unit,
    val onVerifyOtp: () -> Unit,
    val onEmailModeChanged: (EmailMode) -> Unit,
    val onEmailChanged: (String) -> Unit,
    val onPasswordChanged: (String) -> Unit,
    val onSubmitEmail: () -> Unit,
    val onEditDisplayNameChanged: (String) -> Unit,
    val onSaveProfile: () -> Unit,
    val onLogout: () -> Unit,
    val onDeleteRequested: (Boolean) -> Unit,
    val onDeleteConfirmed: () -> Unit,
    val onOpenHelp: () -> Unit,
    val onOpenNotifications: () -> Unit,
    val onOpenWallet: () -> Unit = {},
    val onOpenShop: () -> Unit = {},
    val onOpenRewards: () -> Unit = {},
)

/**
 * Profil tab: sign-in options for a guest (M-50/M-51), profile card for a registered viewer, and for both the
 * settings (M-52: language, notifications), help (M-53) and notification history (M-54) entries.
 */
@Composable
fun AccountScreen(
    googleWebClientId: String,
    onOpenHelp: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenWallet: () -> Unit,
    onOpenShop: () -> Unit,
    onOpenRewards: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: AccountViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(state.message) {
        val message = state.message ?: return@LaunchedEffect
        snackbar.showSnackbar(message.asString(context))
        viewModel.onMessageShown()
    }
    BackHandler(enabled = state.step != AccountStep.OVERVIEW) { viewModel.onBack() }

    Box(modifier = modifier.fillMaxSize()) {
        AccountContent(
            state = state,
            actions =
                AccountActions(
                    onStep = viewModel::onStep,
                    onBack = viewModel::onBack,
                    onGoogle = {
                        scope.launch {
                            when (val outcome = requestGoogleIdToken(context, googleWebClientId)) {
                                is GoogleSignInOutcome.Token -> viewModel.onGoogleIdToken(outcome.idToken)
                                is GoogleSignInOutcome.Failed -> viewModel.onGoogleFailed(outcome.message)
                                GoogleSignInOutcome.Cancelled -> Unit
                            }
                        }
                    },
                    onCountrySelected = viewModel::onCountrySelected,
                    onPhoneChanged = viewModel::onPhoneChanged,
                    onRequestOtp = viewModel::onRequestOtp,
                    onResendOtp = viewModel::onResendOtp,
                    onOtpChanged = viewModel::onOtpChanged,
                    onVerifyOtp = viewModel::onVerifyOtp,
                    onEmailModeChanged = viewModel::onEmailModeChanged,
                    onEmailChanged = viewModel::onEmailChanged,
                    onPasswordChanged = viewModel::onPasswordChanged,
                    onSubmitEmail = viewModel::onSubmitEmail,
                    onEditDisplayNameChanged = viewModel::onEditDisplayNameChanged,
                    onSaveProfile = viewModel::onSaveProfile,
                    onLogout = viewModel::onLogout,
                    onDeleteRequested = viewModel::onDeleteRequested,
                    onDeleteConfirmed = viewModel::onDeleteConfirmed,
                    onOpenHelp = onOpenHelp,
                    onOpenNotifications = onOpenNotifications,
                    onOpenWallet = onOpenWallet,
                    onOpenShop = onOpenShop,
                    onOpenRewards = onOpenRewards,
                ),
            settings = {
                SettingsStep(onMessage = { text -> scope.launch { snackbar.showSnackbar(text.asString(context)) } })
            },
        )
        SnackbarHost(hostState = snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }
}

@Composable
fun AccountContent(
    state: AccountUiState,
    actions: AccountActions,
    modifier: Modifier = Modifier,
    settings: @Composable () -> Unit = {},
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .statusBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState()),
    ) {
        StepHeader(state = state, onBack = actions.onBack)
        if (state.isBusy) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        Column(modifier = Modifier.padding(horizontal = DramaSpacing.md)) {
            when (state.step) {
                AccountStep.OVERVIEW -> {
                    if (state.isRegistered) ProfileOverview(state, actions) else GuestOverview(state, actions)
                    Spacer(Modifier.height(DramaSpacing.lg))
                    HorizontalDivider()
                    Spacer(Modifier.height(DramaSpacing.sm))
                    WalletLinks(state, actions)
                    Spacer(Modifier.height(DramaSpacing.sm))
                    HorizontalDivider()
                    Spacer(Modifier.height(DramaSpacing.sm))
                    SettingsLinks(actions)
                    if (state.isRegistered) {
                        Spacer(Modifier.height(DramaSpacing.lg))
                        DangerZone(state, actions)
                    }
                }
                AccountStep.PHONE -> PhoneStep(state, actions)
                AccountStep.OTP -> OtpStep(state, actions)
                AccountStep.EMAIL -> EmailStep(state, actions)
                AccountStep.EDIT_PROFILE -> EditProfileStep(state, actions)
                AccountStep.SETTINGS -> settings()
            }
        }
        Spacer(Modifier.height(DramaSpacing.xl))
    }
    if (state.confirmDelete) {
        AlertDialog(
            onDismissRequest = { actions.onDeleteRequested(false) },
            title = { Text(stringResource(R.string.account_delete_title)) },
            text = { Text(stringResource(R.string.account_delete_body)) },
            confirmButton = {
                TextButton(onClick = actions.onDeleteConfirmed) {
                    Text(stringResource(CoreR.string.action_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { actions.onDeleteRequested(false) },
                ) { Text(stringResource(CoreR.string.action_cancel)) }
            },
        )
    }
}

@Composable
private fun StepHeader(
    state: AccountUiState,
    onBack: () -> Unit,
) {
    val title =
        stringResource(
            when (state.step) {
                AccountStep.OVERVIEW -> R.string.account_title
                AccountStep.PHONE -> R.string.account_title_phone
                AccountStep.OTP -> R.string.account_title_otp
                AccountStep.EMAIL ->
                    if (state.emailMode ==
                        EmailMode.REGISTER
                    ) {
                        R.string.account_title_register
                    } else {
                        R.string.account_title_login
                    }
                AccountStep.EDIT_PROFILE -> R.string.account_title_edit_profile
                AccountStep.SETTINGS -> R.string.account_title_settings
            },
        )
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = DramaSpacing.xs, vertical = DramaSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (state.step != AccountStep.OVERVIEW) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(CoreR.string.action_back))
            }
        } else {
            Spacer(Modifier.width(DramaSpacing.sm + DramaSpacing.xs))
        }
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.semantics { heading() },
        )
    }
}

// --- Wallet and shop entries (M-30 / M-32) ---

@Composable
private fun WalletLinks(
    state: AccountUiState,
    actions: AccountActions,
) {
    Text(
        text = stringResource(R.string.wallet_section),
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onBackground,
        modifier =
            Modifier
                .padding(vertical = DramaSpacing.xs)
                .semantics { heading() },
    )
    val balance = state.coinBalance
    SettingsLinkRow(
        title = stringResource(R.string.wallet_entry),
        subtitle =
            if (balance != null) {
                stringResource(
                    R.string.wallet_entry_balance,
                    pluralStringResource(CoreR.plurals.coin_count, balance, balance),
                )
            } else {
                stringResource(R.string.wallet_entry_hint)
            },
        onClick = actions.onOpenWallet,
    )
    SettingsLinkRow(
        title = stringResource(R.string.shop_entry),
        subtitle = stringResource(R.string.shop_entry_hint),
        onClick = actions.onOpenShop,
    )
    SettingsLinkRow(
        title = stringResource(R.string.rewards_entry),
        subtitle = stringResource(R.string.rewards_entry_hint),
        onClick = actions.onOpenRewards,
    )
}

// --- Settings entries (M-52 / M-53 / M-54) ---

@Composable
private fun SettingsLinks(actions: AccountActions) {
    Text(
        text = stringResource(R.string.settings_section),
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onBackground,
        modifier =
            Modifier
                .padding(vertical = DramaSpacing.xs)
                .semantics { heading() },
    )
    val locale = LocalConfiguration.current.locales[0] ?: Locale.ROOT
    val languageName = AppLanguage.fromTagOrDefault(locale.language).nativeName
    SettingsLinkRow(
        title = stringResource(R.string.settings_language) + " · " + stringResource(R.string.settings_notifications),
        subtitle = stringResource(R.string.settings_language_value, languageName),
        onClick = { actions.onStep(AccountStep.SETTINGS) },
    )
    SettingsLinkRow(
        title = stringResource(R.string.settings_my_notifications),
        subtitle = stringResource(R.string.settings_my_notifications_hint),
        onClick = actions.onOpenNotifications,
    )
    SettingsLinkRow(
        title = stringResource(R.string.settings_help),
        subtitle = stringResource(R.string.settings_help_hint),
        onClick = actions.onOpenHelp,
    )
}

// --- Guest ---

@Composable
private fun GuestOverview(
    state: AccountUiState,
    actions: AccountActions,
) {
    Spacer(Modifier.height(DramaSpacing.sm))
    Avatar(initial = "?", contentDescription = stringResource(R.string.account_avatar_guest))
    Spacer(Modifier.height(DramaSpacing.md))
    Text(
        text = stringResource(R.string.account_guest_headline),
        style = MaterialTheme.typography.titleLarge,
        color = MaterialTheme.colorScheme.onBackground,
        modifier = Modifier.semantics { heading() },
    )
    Spacer(Modifier.height(DramaSpacing.xs))
    Text(
        text = stringResource(R.string.account_guest_body),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(DramaSpacing.lg))
    SignInOption(
        icon = Icons.Default.Person,
        title = stringResource(R.string.account_google),
        subtitle = if (state.googleConfigured) null else stringResource(R.string.account_google_unconfigured),
        enabled = state.googleConfigured && !state.isBusy,
        onClick = actions.onGoogle,
    )
    SignInOption(
        icon = Icons.Default.Phone,
        title = stringResource(R.string.account_phone),
        subtitle = stringResource(R.string.account_phone_subtitle),
        enabled = !state.isBusy,
        onClick = { actions.onStep(AccountStep.PHONE) },
    )
    SignInOption(
        icon = Icons.Default.Email,
        title = stringResource(R.string.account_email),
        subtitle = stringResource(R.string.account_email_subtitle),
        enabled = !state.isBusy,
        onClick = { actions.onStep(AccountStep.EMAIL) },
    )
    Spacer(Modifier.height(DramaSpacing.md))
    val id = (state.session as? SessionState.Authenticated)?.userId
    if (id != null) {
        Text(
            text = stringResource(R.string.account_guest_id, id.take(ID_PREVIEW)),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SignInOption(
    icon: ImageVector,
    title: String,
    subtitle: String?,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val alpha = if (enabled) 1f else 0.45f
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(vertical = DramaSpacing.xs)
                .heightIn(min = DramaSizes.touchTarget)
                .background(MaterialTheme.colorScheme.surfaceContainerHigh, MaterialTheme.shapes.medium)
                .clickable(enabled = enabled, onClick = onClick, role = Role.Button)
                .padding(DramaSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary.copy(alpha = alpha))
        Spacer(Modifier.width(DramaSpacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = alpha),
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = alpha),
                )
            }
        }
    }
}

// --- Phone / OTP ---

@Composable
private fun PhoneStep(
    state: AccountUiState,
    actions: AccountActions,
) {
    var pickerOpen by remember { mutableStateOf(false) }
    Text(
        text = stringResource(R.string.account_phone_intro),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(DramaSpacing.md))
    Box {
        val pickerDescription = stringResource(R.string.account_country_picker)
        OutlinedButton(
            onClick = { pickerOpen = true },
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = DramaSizes.touchTarget)
                    .semantics { contentDescription = pickerDescription + ", " + state.country.label },
        ) {
            Text(state.country.label)
        }
        DropdownMenu(expanded = pickerOpen, onDismissRequest = { pickerOpen = false }) {
            state.countries.forEach { country ->
                DropdownMenuItem(
                    text = { Text(country.label) },
                    onClick = {
                        actions.onCountrySelected(country)
                        pickerOpen = false
                    },
                )
            }
        }
    }
    Spacer(Modifier.height(DramaSpacing.sm))
    OutlinedTextField(
        value = state.phoneNumber,
        onValueChange = actions.onPhoneChanged,
        label = { Text(stringResource(R.string.account_phone_label)) },
        prefix = { Text("+${state.country.dialCode} ") },
        placeholder = { Text(stringResource(R.string.account_phone_placeholder)) },
        singleLine = true,
        isError = state.phoneError != null,
        supportingText = state.phoneError?.let { { Text(it.asString()) } },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(DramaSpacing.md))
    DramaPrimaryButton(
        text = stringResource(R.string.account_request_code),
        onClick = actions.onRequestOtp,
        enabled = !state.isBusy && state.phoneNumber.isNotBlank(),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun OtpStep(
    state: AccountUiState,
    actions: AccountActions,
) {
    Text(
        text = stringResource(R.string.account_code_sent_to, state.phoneE164 ?: ""),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(DramaSpacing.md))
    OutlinedTextField(
        value = state.otpCode,
        onValueChange = actions.onOtpChanged,
        label = { Text(stringResource(R.string.account_code_label)) },
        singleLine = true,
        isError = state.otpError != null,
        supportingText = state.otpError?.let { { Text(it.asString()) } },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        textStyle = MaterialTheme.typography.headlineSmall.copy(letterSpacing = 8.sp, textAlign = TextAlign.Center),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(DramaSpacing.md))
    DramaPrimaryButton(
        text = stringResource(R.string.account_validate),
        onClick = actions.onVerifyOtp,
        enabled = state.otpComplete && !state.isBusy,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(DramaSpacing.sm))
    TextButton(
        onClick = actions.onResendOtp,
        enabled = state.canResend,
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = DramaSizes.touchTarget),
    ) {
        Text(
            if (state.resendInSeconds > 0) {
                stringResource(R.string.account_resend_code_in, state.resendInSeconds)
            } else {
                stringResource(R.string.account_resend_code)
            },
        )
    }
}

// --- E-mail ---

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EmailStep(
    state: AccountUiState,
    actions: AccountActions,
) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm)) {
        FilterChip(
            selected = state.emailMode == EmailMode.LOGIN,
            onClick = { actions.onEmailModeChanged(EmailMode.LOGIN) },
            label = { Text(stringResource(R.string.account_have_account)) },
            modifier = Modifier.heightIn(min = DramaSizes.touchTarget),
        )
        FilterChip(
            selected = state.emailMode == EmailMode.REGISTER,
            onClick = { actions.onEmailModeChanged(EmailMode.REGISTER) },
            label = { Text(stringResource(R.string.account_title_register)) },
            modifier = Modifier.heightIn(min = DramaSizes.touchTarget),
        )
    }
    Spacer(Modifier.height(DramaSpacing.md))
    OutlinedTextField(
        value = state.email,
        onValueChange = actions.onEmailChanged,
        label = { Text(stringResource(R.string.account_email_label)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(DramaSpacing.sm))
    OutlinedTextField(
        value = state.password,
        onValueChange = actions.onPasswordChanged,
        label = { Text(stringResource(R.string.account_password_label, AccountUiState.MIN_PASSWORD_LENGTH)) },
        singleLine = true,
        isError = state.emailError != null,
        supportingText = state.emailError?.let { { Text(it.asString()) } },
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(DramaSpacing.md))
    DramaPrimaryButton(
        text =
            if (state.emailMode == EmailMode.REGISTER) {
                stringResource(R.string.account_create_my_account)
            } else {
                stringResource(R.string.account_title_login)
            },
        onClick = actions.onSubmitEmail,
        enabled = !state.isBusy && state.email.isNotBlank() && state.password.isNotEmpty(),
        modifier = Modifier.fillMaxWidth(),
    )
}

// --- Registered ---

@Composable
private fun ProfileOverview(
    state: AccountUiState,
    actions: AccountActions,
) {
    val profile = state.profile
    val locale = LocalConfiguration.current.locales[0] ?: Locale.ROOT
    val label = profile?.label() ?: stringResource(R.string.account_profile_loading)
    Spacer(Modifier.height(DramaSpacing.sm))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Avatar(
            initial = label.take(1).uppercase(),
            contentDescription = stringResource(R.string.account_avatar, label),
        )
        Spacer(Modifier.width(DramaSpacing.md))
        Column {
            Text(
                text = label,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.semantics { heading() },
            )
            if (profile != null) {
                Text(
                    text = profile.providersLabel(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
    Spacer(Modifier.height(DramaSpacing.lg))
    if (profile == null) {
        CircularProgressIndicator(modifier = Modifier.size(24.dp))
        return
    }
    val missing = stringResource(R.string.account_value_missing)
    ProfileRow(stringResource(R.string.account_row_email), profile.email ?: missing)
    ProfileRow(stringResource(R.string.account_row_phone), profile.phone ?: missing)
    ProfileRow(
        stringResource(R.string.account_row_country),
        profile.country?.let {
            Locale
                .Builder()
                .setRegion(it)
                .build()
                .getDisplayCountry(locale)
        }
            ?: missing,
    )
    ProfileRow(
        stringResource(R.string.account_row_status),
        stringResource(if (profile.isVip) R.string.account_status_vip else R.string.account_status_standard),
    )
    Spacer(Modifier.height(DramaSpacing.md))
    DramaPrimaryButton(
        text = stringResource(R.string.account_edit_profile),
        onClick = { actions.onStep(AccountStep.EDIT_PROFILE) },
        enabled = !state.isBusy,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun DangerZone(
    state: AccountUiState,
    actions: AccountActions,
) {
    OutlinedButton(
        onClick = actions.onLogout,
        enabled = !state.isBusy,
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = DramaSizes.touchTarget),
    ) {
        Text(stringResource(R.string.account_logout))
    }
    Spacer(Modifier.height(DramaSpacing.sm))
    TextButton(
        onClick = { actions.onDeleteRequested(true) },
        enabled = !state.isBusy,
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = DramaSizes.touchTarget),
    ) {
        Text(stringResource(R.string.account_delete), color = MaterialTheme.colorScheme.error)
    }
}

@Composable
private fun EditProfileStep(
    state: AccountUiState,
    actions: AccountActions,
) {
    OutlinedTextField(
        value = state.editDisplayName,
        onValueChange = actions.onEditDisplayNameChanged,
        label = { Text(stringResource(R.string.account_display_name)) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(DramaSpacing.lg))
    Button(
        onClick = actions.onSaveProfile,
        enabled = !state.isBusy,
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = DramaSizes.touchTarget),
    ) {
        Text(stringResource(CoreR.string.action_save))
    }
}

@Composable
private fun ProfileRow(
    label: String,
    value: String,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(vertical = DramaSpacing.sm)
                .semantics(mergeDescendants = true) {},
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun Avatar(
    initial: String,
    contentDescription: String,
) {
    Box(
        modifier =
            Modifier
                .size(64.dp)
                .background(DramaColors.EmeraldSoft, CircleShape)
                .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initial,
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
private fun UserProfile.label(): String =
    displayName?.takeIf { it.isNotBlank() } ?: email ?: phone ?: stringResource(R.string.account_default_label)

@Composable
private fun UserProfile.providersLabel(): String =
    providers
        .map {
            stringResource(
                when (it) {
                    AuthProvider.GOOGLE -> R.string.account_provider_google
                    AuthProvider.PHONE -> R.string.account_provider_phone
                    AuthProvider.EMAIL -> R.string.account_provider_email
                },
            )
        }.ifEmpty { listOf(stringResource(R.string.account_provider_none)) }
        .joinToString(" · ")

private const val ID_PREVIEW = 8
