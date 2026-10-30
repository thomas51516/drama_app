package com.drama.data.repository

import com.drama.domain.model.RewardedAdRequest
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Query of the simulated SSV callback (debug builds, backend `AD_PROVIDER=fake`). Same parameters as AdMob's
 * callback; the `fake` verifier checks `signature` = base64url(HMAC-SHA256(secret, query without signature/key_id)),
 * the query being the parameters in alphabetical order, URL-encoded. Pure JVM so the format is unit-tested.
 */
object FakeAdSsv {
    const val KEY_ID = "fake"
    const val AD_NETWORK = "fake"

    fun params(
        request: RewardedAdRequest,
        nowEpochMs: Long,
        transactionId: String,
    ): Map<String, String> =
        buildMap {
            put("ad_network", AD_NETWORK)
            put("ad_unit", request.adUnitId)
            put("custom_data", request.customData)
            put("reward_amount", "1")
            put("reward_item", "unlock")
            put("timestamp", nowEpochMs.toString())
            put("transaction_id", transactionId)
            request.userId?.let { put("user_id", it) }
        }

    /** Signature and key id to append to [params]. */
    fun signature(
        params: Map<String, String>,
        secret: String,
    ): Map<String, String> {
        val payload = canonicalQuery(params)
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val signature = Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(payload.toByteArray()))
        return mapOf("signature" to signature, "key_id" to KEY_ID)
    }

    /** `k=v&k=v` in key order, URL-encoded like the network's own callback; signature and key_id excluded. */
    fun canonicalQuery(params: Map<String, String>): String =
        params
            .filterKeys { it != "signature" && it != "key_id" }
            .toSortedMap()
            .entries
            .joinToString("&") { (key, value) -> "$key=${encode(value)}" }

    private fun encode(value: String): String =
        java.net.URLEncoder
            .encode(value, Charsets.UTF_8.name())
            .replace("+", "%20")
}
