package com.drama.core.ads

import android.app.Activity
import com.drama.domain.model.AdUiHost

/** The Activity the ad network draws its full-screen ad over; screens wrap `LocalActivity` before asking for an ad. */
class ActivityAdHost(
    val activity: Activity,
) : AdUiHost
