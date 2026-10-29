package com.drama.core.common.result

/**
 * State of data served with a stale-while-revalidate policy: the cached value (if any) is emitted at once,
 * then the refreshed value or the refresh failure. The UI shows [data] whenever it is not null.
 */
sealed interface Resource<out T> {
    val data: T?

    /** A refresh is in flight; [data] is the cached value shown meanwhile. */
    data class Loading<T>(
        override val data: T? = null,
    ) : Resource<T>

    /** [fromCache] is true when the value is a cache hit considered fresh (no network call made). */
    data class Success<T>(
        override val data: T,
        val fromCache: Boolean = false,
    ) : Resource<T>

    /** The refresh failed; [data] is the stale cached value, if any, so the screen stays usable offline. */
    data class Error<T>(
        val error: AppError,
        override val data: T? = null,
    ) : Resource<T>
}
