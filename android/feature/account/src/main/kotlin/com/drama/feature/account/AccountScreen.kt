package com.drama.feature.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.drama.core.ui.theme.DramaSpacing

/** Empty shell for account & settings (M-40..). Guest auth arrives in Sprint 2, login in Sprint 5. */
@Composable
fun AccountScreen(modifier: Modifier = Modifier) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .padding(DramaSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(DramaSpacing.md, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Mon compte", style = MaterialTheme.typography.headlineMedium)
        Text("Connexion, portefeuille et paramètres : à partir du Sprint 2.")
    }
}
