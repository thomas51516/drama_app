package com.drama.core.common.share

/** Links shared from the app (M-16): an HTTPS App Link plus the custom-scheme fallback. */
data class ShareLink(
    /** `https://<host>/s/{seriesId}`: opens the app when App Links are verified, a web page otherwise. */
    val webUrl: String,
    /** `drama://series/{seriesId}`: always opens the app when installed. */
    val appUri: String,
) {
    /** Text put on the share sheet: the title (when known) and the web link. */
    fun shareText(title: String?): String =
        buildString {
            if (!title.isNullOrBlank()) append("Regarde « $title » sur DRAMA : ")
            append(webUrl)
        }
}

/** Builds share links from the configured App Links host; bound in :app from `BuildConfig.APP_LINKS_HOST`. */
fun interface ShareLinkProvider {
    fun seriesLink(seriesId: String): ShareLink
}

class HostShareLinkProvider(
    private val host: String,
) : ShareLinkProvider {
    override fun seriesLink(seriesId: String): ShareLink =
        ShareLink(
            webUrl = "https://$host/$SERIES_PATH/$seriesId",
            appUri = "$APP_SCHEME://series/$seriesId",
        )

    companion object {
        const val SERIES_PATH = "s"
        const val APP_SCHEME = "drama"
    }
}
