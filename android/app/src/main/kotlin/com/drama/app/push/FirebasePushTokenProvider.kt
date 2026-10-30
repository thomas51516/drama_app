package com.drama.app.push

import android.content.Context
import com.drama.app.BuildConfig
import com.drama.core.common.logging.Logger
import com.drama.core.common.push.AppInfoProvider
import com.drama.core.common.push.PushTokenProvider
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

/** FCM registration token; null when Firebase is not configured (no google-services.json) or unavailable. */
@Singleton
class FirebasePushTokenProvider
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        private val logger: Logger,
    ) : PushTokenProvider {
        override suspend fun currentToken(): String? {
            if (!BuildConfig.FIREBASE_CONFIGURED) return null
            if (FirebaseApp.getApps(context).isEmpty() && FirebaseApp.initializeApp(context) == null) return null
            return suspendCoroutine { continuation ->
                FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                    if (task.isSuccessful) {
                        continuation.resume(task.result)
                    } else {
                        logger.w(PushNotifier.TAG, "FCM token unavailable", task.exception)
                        continuation.resume(null)
                    }
                }
            }
        }
    }

class BuildConfigAppInfo : AppInfoProvider {
    override val versionName: String = BuildConfig.VERSION_NAME
}
