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

/** Empty shell for account & settings (M-40..). Login, profile and settings arrive in sprint 5 (M-50..M-52), wallet and VIP in sprint 7. */
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
        Text("Connexion, profil et paramètres arrivent au sprint 5 ; portefeuille et VIP au sprint 7.")
    }
}
