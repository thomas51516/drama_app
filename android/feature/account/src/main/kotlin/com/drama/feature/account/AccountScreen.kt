package com.drama.feature.account

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.ui.component.DramaPrimaryButton
import com.drama.core.ui.theme.DramaColors
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.AuthProvider
import com.drama.domain.model.UserProfile
import com.drama.feature.account.google.GoogleSignInOutcome
import com.drama.feature.account.google.requestGoogleIdToken
import kotlinx.coroutines.launch

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
    val onEditLanguageChanged: (String) -> Unit,
    val onSaveProfile: () -> Unit,
    val onLogout: () -> Unit,
    val onDeleteRequested: (Boolean) -> Unit,
    val onDeleteConfirmed: () -> Unit,
)

/** Profil tab: sign-in options for a guest (M-50/M-51), profile card and settings for a registered viewer (M-52). */
@Composable
fun AccountScreen(
    googleWebClientId: String,
    modifier: Modifier = Modifier,
    viewModel: AccountViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(state.message) {
        val message = state.message ?: return@LaunchedEffect
        snackbar.showSnackbar(message)
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
                    onEditLanguageChanged = viewModel::onEditLanguageChanged,
                    onSaveProfile = viewModel::onSaveProfile,
                    onLogout = viewModel::onLogout,
                    onDeleteRequested = viewModel::onDeleteRequested,
                    onDeleteConfirmed = viewModel::onDeleteConfirmed,
                ),
        )
        SnackbarHost(hostState = snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }
}

@Composable
fun AccountContent(
    state: AccountUiState,
    actions: AccountActions,
    modifier: Modifier = Modifier,
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
                AccountStep.OVERVIEW ->
                    if (state.isRegistered) {
                        ProfileOverview(
                            state,
                            actions,
                        )
                    } else {
                        GuestOverview(state, actions)
                    }
                AccountStep.PHONE -> PhoneStep(state, actions)
                AccountStep.OTP -> OtpStep(state, actions)
                AccountStep.EMAIL -> EmailStep(state, actions)
                AccountStep.EDIT_PROFILE -> EditProfileStep(state, actions)
            }
        }
        Spacer(Modifier.height(DramaSpacing.xl))
    }
    if (state.confirmDelete) {
        AlertDialog(
            onDismissRequest = { actions.onDeleteRequested(false) },
            title = { Text("Supprimer mon compte ?") },
            text = {
                Text(
                    "Votre compte sera désactivé immédiatement et vos données effacées sous 30 jours. " +
                        "Votre historique, vos favoris et vos pièces seront perdus.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = actions.onDeleteConfirmed,
                ) { Text("Supprimer", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { actions.onDeleteRequested(false) }) { Text("Annuler") } },
        )
    }
}

@Composable
private fun StepHeader(
    state: AccountUiState,
    onBack: () -> Unit,
) {
    val title =
        when (state.step) {
            AccountStep.OVERVIEW -> "Profil"
            AccountStep.PHONE -> "Téléphone"
            AccountStep.OTP -> "Code de vérification"
            AccountStep.EMAIL -> if (state.emailMode == EmailMode.REGISTER) "Créer un compte" else "Se connecter"
            AccountStep.EDIT_PROFILE -> "Modifier le profil"
        }
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = DramaSpacing.xs, vertical = DramaSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (state.step != AccountStep.OVERVIEW) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour") }
        } else {
            Spacer(Modifier.width(DramaSpacing.sm + DramaSpacing.xs))
        }
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
        )
    }
}

// --- Guest ---

@Composable
private fun GuestOverview(
    state: AccountUiState,
    actions: AccountActions,
) {
    Spacer(Modifier.height(DramaSpacing.sm))
    Avatar(initial = "?")
    Spacer(Modifier.height(DramaSpacing.md))
    Text(
        text = "Créer un compte ou se connecter",
        style = MaterialTheme.typography.titleLarge,
        color = MaterialTheme.colorScheme.onBackground,
    )
    Spacer(Modifier.height(DramaSpacing.xs))
    Text(
        text =
            "Vous regardez en invité. Rattachez un compte pour retrouver votre historique, vos favoris et vos pièces " +
                "sur tous vos appareils.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(DramaSpacing.lg))
    SignInOption(
        icon = Icons.Default.Person,
        title = "Continuer avec Google",
        subtitle = if (state.googleConfigured) null else "Non configuré",
        enabled = state.googleConfigured && !state.isBusy,
        onClick = actions.onGoogle,
    )
    SignInOption(
        icon = Icons.Default.Phone,
        title = "Continuer avec mon numéro de téléphone",
        subtitle = "Code à 6 chiffres par SMS",
        enabled = !state.isBusy,
        onClick = { actions.onStep(AccountStep.PHONE) },
    )
    SignInOption(
        icon = Icons.Default.Email,
        title = "Continuer avec mon e-mail",
        subtitle = "Inscription ou connexion par mot de passe",
        enabled = !state.isBusy,
        onClick = { actions.onStep(AccountStep.EMAIL) },
    )
    Spacer(Modifier.height(DramaSpacing.lg))
    val id = (state.session as? com.drama.domain.model.SessionState.Authenticated)?.userId
    if (id != null) {
        Text(
            text = "Identifiant invité : ${id.take(ID_PREVIEW)}…",
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
                .background(MaterialTheme.colorScheme.surfaceContainerHigh, MaterialTheme.shapes.medium)
                .clickable(enabled = enabled, onClick = onClick)
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
        text = "Nous vous enverrons un code à 6 chiffres par SMS.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(DramaSpacing.md))
    Box {
        OutlinedButton(onClick = { pickerOpen = true }, modifier = Modifier.fillMaxWidth()) {
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
        label = { Text("Numéro de téléphone") },
        prefix = { Text("+${state.country.dialCode} ") },
        placeholder = { Text("90 00 00 00") },
        singleLine = true,
        isError = state.phoneError != null,
        supportingText = state.phoneError?.let { { Text(it) } },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(DramaSpacing.md))
    DramaPrimaryButton(
        text = "Recevoir le code",
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
        text = "Code envoyé au ${state.phoneE164 ?: ""}",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(DramaSpacing.md))
    OutlinedTextField(
        value = state.otpCode,
        onValueChange = actions.onOtpChanged,
        label = { Text("Code à 6 chiffres") },
        singleLine = true,
        isError = state.otpError != null,
        supportingText = state.otpError?.let { { Text(it) } },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        textStyle = MaterialTheme.typography.headlineSmall.copy(letterSpacing = 8.sp, textAlign = TextAlign.Center),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(DramaSpacing.md))
    DramaPrimaryButton(
        text = "Valider",
        onClick = actions.onVerifyOtp,
        enabled = state.otpComplete && !state.isBusy,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(DramaSpacing.sm))
    TextButton(onClick = actions.onResendOtp, enabled = state.canResend, modifier = Modifier.fillMaxWidth()) {
        Text(if (state.resendInSeconds > 0) "Renvoyer le code dans ${state.resendInSeconds} s" else "Renvoyer le code")
    }
}

// --- E-mail ---

@Composable
private fun EmailStep(
    state: AccountUiState,
    actions: AccountActions,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm)) {
        FilterChip(
            selected = state.emailMode == EmailMode.LOGIN,
            onClick = { actions.onEmailModeChanged(EmailMode.LOGIN) },
            label = { Text("J'ai déjà un compte") },
        )
        FilterChip(
            selected = state.emailMode == EmailMode.REGISTER,
            onClick = { actions.onEmailModeChanged(EmailMode.REGISTER) },
            label = { Text("Créer un compte") },
        )
    }
    Spacer(Modifier.height(DramaSpacing.md))
    OutlinedTextField(
        value = state.email,
        onValueChange = actions.onEmailChanged,
        label = { Text("Adresse e-mail") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(DramaSpacing.sm))
    OutlinedTextField(
        value = state.password,
        onValueChange = actions.onPasswordChanged,
        label = { Text("Mot de passe (8 caractères minimum)") },
        singleLine = true,
        isError = state.emailError != null,
        supportingText = state.emailError?.let { { Text(it) } },
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(DramaSpacing.md))
    DramaPrimaryButton(
        text = if (state.emailMode == EmailMode.REGISTER) "Créer mon compte" else "Se connecter",
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
    Spacer(Modifier.height(DramaSpacing.sm))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Avatar(initial = (profile?.label ?: "?").take(1).uppercase())
        Spacer(Modifier.width(DramaSpacing.md))
        Column {
            Text(
                text = profile?.label ?: "Chargement…",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
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
    ProfileRow("E-mail", profile.email ?: "—")
    ProfileRow("Téléphone", profile.phone ?: "—")
    ProfileRow("Pays", profile.country ?: "—")
    ProfileRow(
        "Langue",
        AccountUiState.LANGUAGES.firstOrNull { it.first == profile.language }?.second ?: profile.language ?: "—",
    )
    ProfileRow("Statut", if (profile.isVip) "VIP" else "Standard")
    Spacer(Modifier.height(DramaSpacing.lg))
    DramaPrimaryButton(
        text = "Modifier le nom ou la langue",
        onClick = { actions.onStep(AccountStep.EDIT_PROFILE) },
        enabled = !state.isBusy,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(DramaSpacing.sm))
    OutlinedButton(onClick = actions.onLogout, enabled = !state.isBusy, modifier = Modifier.fillMaxWidth()) {
        Text("Se déconnecter")
    }
    Spacer(Modifier.height(DramaSpacing.lg))
    TextButton(
        onClick = { actions.onDeleteRequested(true) },
        enabled = !state.isBusy,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text("Supprimer mon compte", color = MaterialTheme.colorScheme.error)
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
        label = { Text("Nom affiché") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(DramaSpacing.md))
    Text("Langue", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onBackground)
    Spacer(Modifier.height(DramaSpacing.xs))
    Row(horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm)) {
        AccountUiState.LANGUAGES.forEach { (code, label) ->
            FilterChip(
                selected = state.editLanguage == code,
                onClick = { actions.onEditLanguageChanged(code) },
                label = { Text(label) },
            )
        }
    }
    Spacer(Modifier.height(DramaSpacing.lg))
    Button(onClick = actions.onSaveProfile, enabled = !state.isBusy, modifier = Modifier.fillMaxWidth()) {
        Text("Enregistrer")
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
                .padding(vertical = DramaSpacing.sm),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(text = value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onBackground)
    }
}

@Composable
private fun Avatar(initial: String) {
    Box(
        modifier =
            Modifier
                .size(64.dp)
                .background(DramaColors.CrimsonSoft, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initial,
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

private fun UserProfile.providersLabel(): String =
    providers
        .map {
            when (it) {
                AuthProvider.GOOGLE -> "Google"
                AuthProvider.PHONE -> "Téléphone"
                AuthProvider.EMAIL -> "E-mail"
            }
        }.ifEmpty { listOf("Compte") }
        .joinToString(" · ")

private const val ID_PREVIEW = 8
