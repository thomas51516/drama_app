package com.drama.app.remoteconfig

import android.content.Context
import com.drama.core.common.logging.Logger
import com.drama.domain.model.RemoteFlags
import com.drama.domain.repository.RemoteConfigRepository
import com.google.firebase.FirebaseApp
import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import com.google.firebase.remoteconfig.FirebaseRemoteConfigSettings
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/** Used when Firebase is not configured: the in-app defaults are the only values (M-34). */
class StaticRemoteConfigRepository(
    defaults: RemoteFlags,
) : RemoteConfigRepository {
    override val flags: Flow<RemoteFlags> = MutableStateFlow(defaults)

    override suspend fun refresh() = Unit
}

/**
 * Firebase Remote Config (S09-A1-03): in-app defaults, then fetch-and-activate at startup. Keys:
 * `mobile_money_link_enabled` (boolean, default false) and `recharge_url` (string). Debug builds fetch on every
 * refresh so a console change shows up at the next launch.
 */
class FirebaseRemoteConfigRepository private constructor(
    private val remoteConfig: FirebaseRemoteConfig,
    private val defaults: RemoteFlags,
    private val logger: Logger,
) : RemoteConfigRepository {
    private val flagsFlow = MutableStateFlow(read())
    override val flags: Flow<RemoteFlags> = flagsFlow.asStateFlow()

    override suspend fun refresh() {
        val activated =
            suspendCancellableCoroutine { continuation ->
                remoteConfig.fetchAndActivate().addOnCompleteListener { task ->
                    if (!task.isSuccessful) logger.w(TAG, "Remote Config fetch failed", task.exception)
                    if (continuation.isActive) continuation.resume(task.isSuccessful)
                }
            }
        flagsFlow.value = read()
        logger.i(TAG, "flags ${if (activated) "fetched" else "unchanged"}: ${flagsFlow.value}")
    }

    private fun read(): RemoteFlags =
        RemoteFlags(
            mobileMoneyLinkEnabled =
                runCatching { remoteConfig.getBoolean(RemoteFlags.KEY_MOBILE_MONEY_LINK_ENABLED) }
                    .getOrDefault(defaults.mobileMoneyLinkEnabled),
            rechargeUrl =
                runCatching { remoteConfig.getString(RemoteFlags.KEY_RECHARGE_URL) }
                    .getOrDefault(defaults.rechargeUrl)
                    .ifBlank { defaults.rechargeUrl },
        )

    companion object {
        const val TAG = "RemoteConfig"
        private const val FETCH_INTERVAL_RELEASE_S = 3_600L

        /** Null when Firebase could not initialise: callers fall back to [StaticRemoteConfigRepository]. */
        fun createIfAvailable(
            context: Context,
            defaults: RemoteFlags,
            debug: Boolean,
            logger: Logger,
        ): FirebaseRemoteConfigRepository? {
            val app = FirebaseApp.getApps(context).firstOrNull() ?: FirebaseApp.initializeApp(context) ?: return null
            val remoteConfig = FirebaseRemoteConfig.getInstance(app)
            remoteConfig.setConfigSettingsAsync(
                FirebaseRemoteConfigSettings
                    .Builder()
                    .setMinimumFetchIntervalInSeconds(if (debug) 0L else FETCH_INTERVAL_RELEASE_S)
                    .build(),
            )
            remoteConfig.setDefaultsAsync(
                mapOf(
                    RemoteFlags.KEY_MOBILE_MONEY_LINK_ENABLED to defaults.mobileMoneyLinkEnabled,
                    RemoteFlags.KEY_RECHARGE_URL to defaults.rechargeUrl,
                ),
            )
            return FirebaseRemoteConfigRepository(remoteConfig, defaults, logger)
        }
    }
}
