package com.drama.domain.model

/** Remote Config values the app reads (M-34). Defaults apply until a fetch succeeds. */
data class RemoteFlags(
    /** `mobile_money_link_enabled`: shows "Recharger par mobile money" in the shop and the wallet. */
    val mobileMoneyLinkEnabled: Boolean = false,
    /** `recharge_url`: the recharge web site opened in a Custom Tab. */
    val rechargeUrl: String = "",
) {
    /** The link is offered only when the flag is on and a usable HTTPS/HTTP URL is configured. */
    val rechargeLink: String?
        get() =
            rechargeUrl
                .trim()
                .takeIf { mobileMoneyLinkEnabled && (it.startsWith("https://") || it.startsWith("http://")) }

    companion object {
        const val KEY_MOBILE_MONEY_LINK_ENABLED = "mobile_money_link_enabled"
        const val KEY_RECHARGE_URL = "recharge_url"
    }
}
