package com.drama.core.common.time

/** Wall clock, injected so token expiry and cache TTL logic can be unit-tested. */
fun interface Clock {
    fun nowEpochMs(): Long
}

object SystemClock : Clock {
    override fun nowEpochMs(): Long = System.currentTimeMillis()
}
