package com.drama.feature.series

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
import com.drama.core.ui.component.DramaPrimaryButton
import com.drama.core.ui.theme.DramaSpacing

/** Empty shell for the series sheet (M-10). Real content lands in Sprint 3 (S03-A2-*). */
@Composable
fun SeriesScreen(
    seriesId: String,
    onPlay: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .padding(DramaSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(DramaSpacing.md, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Fiche série", style = MaterialTheme.typography.headlineMedium)
        Text("Identifiant : $seriesId", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Affiche, synopsis et grille des épisodes : Sprint 3.")
        DramaPrimaryButton(text = "Lire", onClick = onPlay)
    }
}
