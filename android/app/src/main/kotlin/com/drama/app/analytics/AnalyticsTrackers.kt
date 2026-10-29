package com.drama.app.analytics

import android.content.Context
import android.os.Bundle
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.logging.Logger
import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.crashlytics.FirebaseCrashlytics

/** Used when Firebase is not configured (no google-services.json): events are visible in Logcat. */
class LogcatAnalyticsTracker(
    private val logger: Logger,
) : AnalyticsTracker {
    override fun track(event: AnalyticsEvent) {
        logger.i(TAG, "${event.name} ${event.params}")
    }

    override fun setUserId(userId: String?) {
        logger.i(TAG, "user_id=${userId ?: "null"}")
    }

    companion object {
        const val TAG = "Analytics"
    }
}

/** Firebase Analytics + Crashlytics user id. Only instantiated when [FirebaseApp] initialised successfully. */
class FirebaseAnalyticsTracker(
    private val analytics: FirebaseAnalytics,
    private val crashlytics: FirebaseCrashlytics,
    private val logger: Logger,
) : AnalyticsTracker {
    override fun track(event: AnalyticsEvent) {
        val bundle =
            Bundle().apply {
                event.params.forEach { (key, value) ->
                    when (value) {
                        is Int -> putInt(key, value)
                        is Long -> putLong(key, value)
                        is Double -> putDouble(key, value)
                        is Boolean -> putString(key, value.toString())
                        else -> putString(key, value.toString())
                    }
                }
            }
        analytics.logEvent(event.name, bundle)
        logger.i(LogcatAnalyticsTracker.TAG, "firebase ${event.name} ${event.params}")
    }

    override fun setUserId(userId: String?) {
        analytics.setUserId(userId)
        crashlytics.setUserId(userId.orEmpty())
    }

    companion object {
        /** Null when Firebase could not initialise (missing config): callers fall back to Logcat. */
        fun createIfAvailable(
            context: Context,
            logger: Logger,
        ): FirebaseAnalyticsTracker? {
            val app = FirebaseApp.getApps(context).firstOrNull() ?: FirebaseApp.initializeApp(context)
            if (app == null) {
                logger.w(LogcatAnalyticsTracker.TAG, "FirebaseApp not initialised: using Logcat tracker")
                return null
            }
            val crashlytics = FirebaseCrashlytics.getInstance()
            crashlytics.isCrashlyticsCollectionEnabled = true
            logger.i(
                LogcatAnalyticsTracker.TAG,
                "Firebase ready (project=${app.options.projectId}), Crashlytics enabled",
            )
            return FirebaseAnalyticsTracker(FirebaseAnalytics.getInstance(context), crashlytics, logger)
        }
    }
}
