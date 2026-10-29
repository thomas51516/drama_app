package com.drama.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Modifier
import androidx.core.util.Consumer
import androidx.navigation.compose.rememberNavController
import com.drama.app.navigation.DramaNavHost
import com.drama.core.ui.theme.DramaTheme
import dagger.hilt.android.AndroidEntryPoint

/** Single activity; every screen is a Navigation Compose destination. */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            DramaTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    val navController = rememberNavController()
                    // singleTask: a deep link received while the app is already running arrives in onNewIntent;
                    // NavHost only handles the launch intent by itself.
                    DisposableEffect(navController) {
                        val listener = Consumer<Intent> { intent -> navController.handleDeepLink(intent) }
                        addOnNewIntentListener(listener)
                        onDispose { removeOnNewIntentListener(listener) }
                    }
                    DramaNavHost(navController = navController)
                }
            }
        }
    }
}
