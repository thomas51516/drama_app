package com.drama.core.billing

import android.app.Activity
import com.drama.domain.model.BillingUiHost

/** The Activity Google Play draws its purchase sheet over; screens wrap `LocalActivity` before buying. */
class ActivityBillingHost(
    val activity: Activity,
) : BillingUiHost
