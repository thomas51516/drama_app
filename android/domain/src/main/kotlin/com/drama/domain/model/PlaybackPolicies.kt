package com.drama.domain.model

/** Data saver (M-17): on a metered network the rendition is capped at [CAP] whatever the manual choice. */
object DataSaverRules {
    val CAP: VideoQuality = VideoQuality.P540

    /**
     * Quality to apply to the engine. [preferred] is the viewer's manual choice; the cap only lowers it
     * (a manual 360p stays 360p) and only when the data saver is on and the network is metered.
     */
    fun effectiveQuality(
        preferred: VideoQuality,
        dataSaverEnabled: Boolean,
        metered: Boolean,
    ): VideoQuality {
        if (!dataSaverEnabled || !metered) return preferred
        return if (preferred == VideoQuality.AUTO || preferred.maxHeight > CAP.maxHeight) CAP else preferred
    }

    fun isCapping(
        preferred: VideoQuality,
        dataSaverEnabled: Boolean,
        metered: Boolean,
    ): Boolean = effectiveQuality(preferred, dataSaverEnabled, metered) != preferred
}

/** Capture protection (M-18): `FLAG_SECURE` whenever the episode on screen is not free. */
object SecureScreenRules {
    fun shouldSecure(access: EpisodeAccess?): Boolean = access != null && access != EpisodeAccess.FREE
}
