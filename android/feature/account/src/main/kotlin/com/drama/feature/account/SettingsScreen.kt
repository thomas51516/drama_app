package com.drama.feature.account

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.core.app.NotificationManagerCompat
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.common.locale.AppLanguage
import com.drama.core.ui.text.UiText
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing

data class SettingsActions(
    val onLanguageSelected: (AppLanguage) -> Unit,
    val onPreferenceChanged: (NotificationPreferenceKind, Boolean) -> Unit,
    val onRequestPermission: () -> Unit,
    val onOpenSystemSettings: () -> Unit,
    val onRestorePurchases: () -> Unit = {},
    val onDataSaverChanged: (Boolean) -> Unit = {},
)

/** Settings step of the Profil tab (M-52): language, notification preferences, system permission. */
@Composable
fun SettingsStep(
    onMessage: (UiText) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    val permissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            viewModel.onPermissionResult(granted)
        }
    // Refresh the system state when coming back from the phone settings.
    LifecycleResumeEffect(Unit) {
        viewModel.onNotificationsAllowedChanged(NotificationManagerCompat.from(context).areNotificationsEnabled())
        onPauseOrDispose { }
    }
    LaunchedEffect(state.requestPermission) {
        if (!state.requestPermission) return@LaunchedEffect
        viewModel.onPermissionRequested()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            context.openNotificationSettings()
        }
    }
    LaunchedEffect(state.message) {
        val message = state.message ?: return@LaunchedEffect
        onMessage(message)
        viewModel.onMessageShown()
    }

    SettingsContent(
        state = state,
        actions =
            SettingsActions(
                onLanguageSelected = viewModel::onLanguageSelected,
                onPreferenceChanged = viewModel::onPreferenceChanged,
                onRequestPermission = viewModel::onRequestPermission,
                onOpenSystemSettings = { context.openNotificationSettings() },
                onRestorePurchases = viewModel::onRestorePurchases,
                onDataSaverChanged = viewModel::onDataSaverChanged,
            ),
        modifier = modifier,
    )
}

@Composable
fun SettingsContent(
    state: SettingsUiState,
    actions: SettingsActions,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        SectionTitle(stringResource(R.string.settings_language))
        Hint(stringResource(R.string.settings_language_hint))
        Spacer(Modifier.height(DramaSpacing.xs))
        Column(Modifier.selectableGroup()) {
            state.languages.forEach { language ->
                val selected = language == state.language
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = DramaSizes.touchTarget)
                            .selectable(
                                selected = selected,
                                enabled = !state.isBusy,
                                role = Role.RadioButton,
                                onClick = { actions.onLanguageSelected(language) },
                            ).padding(horizontal = DramaSpacing.xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = selected, onClick = null)
                    Spacer(Modifier.width(DramaSpacing.sm))
                    Text(
                        text = language.nativeName,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                }
            }
        }

        Spacer(Modifier.height(DramaSpacing.lg))
        SectionTitle(stringResource(R.string.settings_notifications))
        Hint(stringResource(R.string.settings_notifications_hint))
        Spacer(Modifier.height(DramaSpacing.xs))
        if (state.notificationsAllowed == false) {
            Text(
                text = stringResource(R.string.settings_notif_permission_off),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.padding(vertical = DramaSpacing.xs),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm)) {
                OutlinedButton(
                    onClick = actions.onRequestPermission,
                    modifier = Modifier.heightIn(min = DramaSizes.touchTarget),
                ) { Text(stringResource(R.string.settings_notif_permission_allow)) }
                OutlinedButton(
                    onClick = actions.onOpenSystemSettings,
                    modifier = Modifier.heightIn(min = DramaSizes.touchTarget),
                ) { Text(stringResource(R.string.settings_notif_permission_system)) }
            }
            Spacer(Modifier.height(DramaSpacing.sm))
        }
        PreferenceSwitch(
            title = stringResource(R.string.settings_notif_new_episodes),
            hint = stringResource(R.string.settings_notif_new_episodes_hint),
            checked = state.isEnabled(NotificationPreferenceKind.NEW_EPISODES),
            onCheckedChange = { actions.onPreferenceChanged(NotificationPreferenceKind.NEW_EPISODES, it) },
        )
        PreferenceSwitch(
            title = stringResource(R.string.settings_notif_offers),
            hint = stringResource(R.string.settings_notif_offers_hint),
            checked = state.isEnabled(NotificationPreferenceKind.OFFERS),
            onCheckedChange = { actions.onPreferenceChanged(NotificationPreferenceKind.OFFERS, it) },
        )
        PreferenceSwitch(
            title = stringResource(R.string.settings_notif_checkin),
            hint = stringResource(R.string.settings_notif_checkin_hint),
            checked = state.isEnabled(NotificationPreferenceKind.CHECKIN_REMINDER),
            onCheckedChange = { actions.onPreferenceChanged(NotificationPreferenceKind.CHECKIN_REMINDER, it) },
        )
        Spacer(Modifier.height(DramaSpacing.lg))
        SectionTitle(stringResource(R.string.settings_purchases))
        Hint(stringResource(R.string.settings_purchases_hint))
        Spacer(Modifier.height(DramaSpacing.xs))
        OutlinedButton(
            onClick = actions.onRestorePurchases,
            enabled = !state.isRestoring,
            modifier = Modifier.heightIn(min = DramaSizes.touchTarget),
        ) {
            Text(
                stringResource(
                    if (state.isRestoring) R.string.settings_restoring else R.string.settings_restore_purchases,
                ),
            )
        }
        if (state.showDataSaver) {
            Spacer(Modifier.height(DramaSpacing.lg))
            SectionTitle(stringResource(R.string.settings_playback))
            Spacer(Modifier.height(DramaSpacing.xs))
            // M-17: capped at 540p on mobile data; Wi-Fi is never capped.
            PreferenceSwitch(
                title = stringResource(R.string.settings_data_saver),
                hint = stringResource(R.string.settings_data_saver_hint),
                checked = state.dataSaverEnabled,
                onCheckedChange = actions.onDataSaverChanged,
            )
        }
    }
}

/** Switch row: the whole row toggles, one TalkBack node with state (S06-A1-03). */
@Composable
private fun PreferenceSwitch(
    title: String,
    hint: String?,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = DramaSizes.touchTarget)
                .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = onCheckedChange)
                .padding(vertical = DramaSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
            if (hint != null) {
                Text(
                    text = hint,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.width(DramaSpacing.md))
        Switch(checked = checked, onCheckedChange = null, enabled = enabled)
    }
}

/** Navigation row of the profile overview (settings, help, notifications). */
@Composable
fun SettingsLinkRow(
    title: String,
    subtitle: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .heightIn(min = DramaSizes.touchTarget)
                .clickable(onClick = onClick, role = Role.Button)
                .padding(vertical = DramaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        color = MaterialTheme.colorScheme.onBackground,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
private fun Hint(text: String) {
    Text(text = text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

private fun android.content.Context.openNotificationSettings() {
    val intent =
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { startActivity(intent) }.onFailure {
        startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, "package:$packageName".toUri())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
