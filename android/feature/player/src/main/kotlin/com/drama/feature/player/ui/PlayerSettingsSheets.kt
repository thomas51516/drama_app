package com.drama.feature.player.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.drama.core.player.engine.TrackSelectionMapper
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.PlayerSettings
import com.drama.domain.model.Subtitle
import com.drama.domain.model.SubtitleMode
import com.drama.domain.model.VideoQuality
import com.drama.feature.player.PlayerUiState
import com.drama.feature.player.R

/** Which bottom sheet is open over the player. */
enum class PlayerSheet {
    SETTINGS,
    SPEED,
    QUALITY,
    SUBTITLES,
}

data class SettingsActions(
    val onSpeedSelected: (Float) -> Unit,
    val onQualitySelected: (VideoQuality) -> Unit,
    val onSubtitleSelected: (SubtitleMode) -> Unit,
)

/** Localised quality label: the manual cap (`540p`) or `player_quality_auto` plus the live rendition when known. */
@Composable
internal fun PlayerUiState.qualityText(): String =
    manualQualityLabel
        ?: playingShortSide?.let { stringResource(R.string.player_quality_auto_live, it) }
        ?: stringResource(R.string.player_quality_auto)

/** Localised subtitle label: the active language code (`FR`) or `player_subtitles_off`. */
@Composable
internal fun PlayerUiState.subtitleText(): String = subtitleCode ?: stringResource(R.string.player_subtitles_off)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayerSettingsSheet(
    sheet: PlayerSheet,
    state: PlayerUiState,
    actions: SettingsActions,
    onNavigate: (PlayerSheet) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(bottom = DramaSpacing.md),
        ) {
            when (sheet) {
                PlayerSheet.SETTINGS -> SettingsMenu(state = state, onNavigate = onNavigate)
                PlayerSheet.SPEED ->
                    OptionList(
                        title = stringResource(R.string.player_speed_title),
                        options = PlayerSettings.SPEEDS,
                        selected = state.settings.speed,
                        label = TrackSelectionMapper::speedLabel,
                        onSelect = {
                            actions.onSpeedSelected(it)
                            onDismiss()
                        },
                    )
                PlayerSheet.QUALITY -> {
                    val autoLabel = stringResource(R.string.player_quality_auto)
                    OptionList(
                        title = stringResource(R.string.player_quality_title),
                        options = state.qualityOptions,
                        selected = state.settings.quality,
                        label = { if (it == VideoQuality.AUTO) autoLabel else TrackSelectionMapper.qualityLabel(it) },
                        onSelect = {
                            actions.onQualitySelected(it)
                            onDismiss()
                        },
                    )
                }
                PlayerSheet.SUBTITLES ->
                    SubtitleList(
                        options = state.subtitleOptions,
                        mode = state.settings.subtitles,
                        active = state.activeSubtitleLanguage,
                        onSelect = {
                            actions.onSubtitleSelected(it)
                            onDismiss()
                        },
                    )
            }
        }
    }
}

@Composable
private fun SettingsMenu(
    state: PlayerUiState,
    onNavigate: (PlayerSheet) -> Unit,
) {
    SheetTitle(stringResource(R.string.player_settings_title))
    MenuRow(title = stringResource(R.string.player_subtitles), value = state.subtitleText()) {
        onNavigate(PlayerSheet.SUBTITLES)
    }
    MenuRow(title = stringResource(R.string.player_speed), value = state.speedLabel) { onNavigate(PlayerSheet.SPEED) }
    MenuRow(title = stringResource(R.string.player_quality), value = state.qualityText()) {
        onNavigate(PlayerSheet.QUALITY)
    }
}

@Composable
private fun <T> OptionList(
    title: String,
    options: List<T>,
    selected: T,
    label: (T) -> String,
    onSelect: (T) -> Unit,
) {
    SheetTitle(title)
    Column(Modifier.selectableGroup()) {
        options.forEach { option ->
            OptionRow(text = label(option), selected = option == selected, onClick = { onSelect(option) })
        }
    }
}

@Composable
private fun SubtitleList(
    options: List<Subtitle>,
    mode: SubtitleMode,
    active: String?,
    onSelect: (SubtitleMode) -> Unit,
) {
    SheetTitle(stringResource(R.string.player_subtitles_title))
    Column(Modifier.selectableGroup()) {
        OptionRow(
            text = stringResource(R.string.player_subtitles_off),
            selected =
                mode == SubtitleMode.Off || (active == null && mode !is SubtitleMode.Language),
            onClick = {
                onSelect(SubtitleMode.Off)
            },
        )
        options.forEach { subtitle ->
            OptionRow(
                text =
                    stringResource(
                        R.string.player_subtitle_option,
                        subtitle.label.ifBlank { subtitle.language }.replaceFirstChar(Char::titlecase),
                        subtitle.language.uppercase(),
                    ),
                selected = active == subtitle.language,
                onClick = { onSelect(SubtitleMode.Language(subtitle.language)) },
            )
        }
    }
    if (options.isEmpty()) {
        Text(
            text = stringResource(R.string.player_subtitles_none),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = DramaSpacing.lg, vertical = DramaSpacing.sm),
        )
    }
}

@Composable
private fun SheetTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
        modifier =
            Modifier
                .padding(horizontal = DramaSpacing.lg, vertical = DramaSpacing.sm)
                .semantics { heading() },
    )
    Spacer(Modifier.height(DramaSpacing.xs))
}

@Composable
private fun MenuRow(
    title: String,
    value: String,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = DramaSizes.touchTarget)
                .clickable(onClick = onClick, role = Role.Button)
                .padding(horizontal = DramaSpacing.lg, vertical = DramaSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        Text(text = value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
    }
}

/** One choice in a list: announced as a radio button, so the check icon is decorative. */
@Composable
private fun OptionRow(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = DramaSizes.touchTarget)
                .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
                .padding(horizontal = DramaSpacing.lg, vertical = DramaSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge,
            color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        if (selected) {
            Icon(
                Icons.Default.Check,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
