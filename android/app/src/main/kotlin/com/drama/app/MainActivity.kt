package com.drama.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Modifier
import androidx.core.util.Consumer
import androidx.navigation.compose.rememberNavController
import com.drama.app.navigation.DramaNavHost
import com.drama.app.push.ForegroundPushBus
import com.drama.app.push.PushOpenHandler
import com.drama.core.ui.theme.DramaTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Single activity; every screen is a Navigation Compose destination. AppCompat so that the per-app language
 * chosen in the settings applies on every API level (S05-A1-03).
 */
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {
    @Inject
    lateinit var pushOpenHandler: PushOpenHandler

    @Inject
    lateinit var foregroundPush: ForegroundPushBus

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
                        val listener =
                            Consumer<Intent> { intent ->
                                pushOpenHandler.onIntent(intent)
                                navController.handleDeepLink(intent)
                            }
                        addOnNewIntentListener(listener)
                        onDispose { removeOnNewIntentListener(listener) }
                    }
                    DisposableEffect(Unit) {
                        pushOpenHandler.onIntent(intent)
                        onDispose { }
                    }
                    DramaNavHost(navController = navController, foregroundPush = foregroundPush)
                }
            }
        }
    }
}
