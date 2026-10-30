package com.drama.core.common.push

/** Current FCM registration token; implemented in :app over Firebase Messaging, null when Firebase is absent. */
interface PushTokenProvider {
    suspend fun currentToken(): String?
}

object NoPushTokenProvider : PushTokenProvider {
    override suspend fun currentToken(): String? = null
}

/** Version string sent with the device registration (`appVersion`). */
interface AppInfoProvider {
    val versionName: String
}
