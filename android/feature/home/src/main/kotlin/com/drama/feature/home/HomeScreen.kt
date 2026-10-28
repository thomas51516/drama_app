package com.drama.feature.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import com.drama.core.ui.component.DramaPrimaryButton
import com.drama.core.ui.theme.DramaSpacing
import com.drama.core.ui.theme.DramaTheme

/** Sprint 1 placeholder for the home feed (M-01..M-09 arrive in Sprint 3). */
@Composable
fun HomeScreen(
    onPlayTestSeries: (seriesId: String) -> Unit,
    onOpenSeries: (seriesId: String) -> Unit,
    onOpenAccount: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .padding(DramaSpacing.lg),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = "DRAMA", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(DramaSpacing.sm))
        Text(
            text = "Micro-séries verticales — socle Sprint 1",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(DramaSpacing.xl))
        DramaPrimaryButton(
            text = "Lire la série de test",
            onClick = { onPlayTestSeries(TEST_SERIES_ID) },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(DramaSpacing.md))
        TextButton(onClick = { onOpenSeries(TEST_SERIES_ID) }) {
            Text("Fiche série (maquette)")
        }
        TextButton(onClick = onOpenAccount) {
            Text("Mon compte (maquette)")
        }
    }
}

private const val TEST_SERIES_ID = "test-series"

@Preview(showBackground = true)
@Composable
private fun HomeScreenPreview() {
    DramaTheme {
        HomeScreen(onPlayTestSeries = {}, onOpenSeries = {}, onOpenAccount = {})
    }
}
