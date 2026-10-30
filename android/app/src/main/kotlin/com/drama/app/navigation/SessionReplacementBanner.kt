package com.drama.app.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.app.R
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.SessionReplacement
import com.drama.domain.repository.SessionRepository
import com.drama.core.ui.R as CoreR

/**
 * DEF-006: when a rejected refresh forced a new guest session, tell the viewer instead of swapping accounts
 * silently. Dismissible; "Se reconnecter" opens the Profil tab. The previous user id stays in Logcat (`Session`).
 */
@Composable
fun SessionReplacementBanner(
    sessionRepository: SessionRepository,
    onSignIn: () -> Unit,
) {
    val replacement by sessionRepository.sessionReplacement.collectAsStateWithLifecycle(initialValue = null)
    val current = replacement ?: return
    SessionReplacementBannerContent(
        replacement = current,
        onSignIn = {
            sessionRepository.dismissSessionReplacement()
            onSignIn()
        },
        onDismiss = sessionRepository::dismissSessionReplacement,
    )
}

@Composable
fun SessionReplacementBannerContent(
    replacement: SessionReplacement,
    onSignIn: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                .statusBarsPadding()
                .padding(start = DramaSpacing.md, end = DramaSpacing.xs, top = DramaSpacing.xs)
                .semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Text(
                text =
                    stringResource(
                        if (replacement.previousWasGuest) {
                            R.string.session_replaced_guest
                        } else {
                            R.string.session_replaced_account
                        },
                    ),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.weight(1f).padding(top = DramaSpacing.sm),
            )
            IconButton(onClick = onDismiss) {
                Icon(Icons.Default.Close, contentDescription = stringResource(CoreR.string.action_close))
            }
        }
        TextButton(onClick = onSignIn, modifier = Modifier.heightIn(min = DramaSizes.touchTarget)) {
            Text(stringResource(R.string.session_replaced_sign_in))
        }
    }
}
