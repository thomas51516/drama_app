package com.drama.core.common.result

/** Result wrapper shared by every layer. Failures carry a typed [AppError], never raw exceptions in the UI. */
sealed interface AppResult<out T> {
    data class Success<T>(
        val value: T,
    ) : AppResult<T>

    data class Failure(
        val error: AppError,
    ) : AppResult<Nothing>
}

/**
 * Typed failures. HTTP errors are mapped from the backend `ApiErrorDto` (`code` is the stable server code,
 * e.g. `EPISODE_LOCKED`, `SERIES_NOT_FOUND`), so the UI never sees raw status codes or exceptions.
 */
sealed interface AppError {
    /** No connectivity, DNS failure, timeout: the request never got a usable answer. */
    data class Network(
        val cause: Throwable? = null,
    ) : AppError

    /** 401 / invalid or expired session; the session layer has already tried to refresh. */
    data class Unauthenticated(
        val code: String? = null,
    ) : AppError

    /** 403 `EPISODE_LOCKED`: the viewer must unlock the episode (paywall, Sprint 7). */
    data class Locked(
        val episodeId: String?,
        val seriesId: String?,
        val coinCost: Int?,
    ) : AppError

    /** 404: [what] is the server code (`SERIES_NOT_FOUND`) or a local description. */
    data class NotFound(
        val what: String,
    ) : AppError

    /** 5xx: the backend failed; retry later. */
    data class Server(
        val code: Int,
        val serverCode: String? = null,
        val message: String? = null,
    ) : AppError

    /** Any other HTTP status (400 validation, 409 conflict, 429 rate limit, ...). */
    data class Http(
        val code: Int,
        val serverCode: String? = null,
        val message: String? = null,
    ) : AppError

    data class Unknown(
        val cause: Throwable? = null,
    ) : AppError
}

inline fun <T, R> AppResult<T>.map(transform: (T) -> R): AppResult<R> =
    when (this) {
        is AppResult.Success -> AppResult.Success(transform(value))
        is AppResult.Failure -> this
    }

inline fun <T> AppResult<T>.onSuccess(block: (T) -> Unit): AppResult<T> {
    if (this is AppResult.Success) block(value)
    return this
}

inline fun <T> AppResult<T>.onFailure(block: (AppError) -> Unit): AppResult<T> {
    if (this is AppResult.Failure) block(error)
    return this
}

fun <T> AppResult<T>.getOrNull(): T? = (this as? AppResult.Success)?.value

fun <T> AppResult<T>.errorOrNull(): AppError? = (this as? AppResult.Failure)?.error

/** Runs [block] and wraps any non-cancellation exception into [AppError.Unknown]. */
inline fun <T> runCatchingResult(block: () -> T): AppResult<T> =
    try {
        AppResult.Success(block())
    } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
    } catch (
        @Suppress("TooGenericExceptionCaught") e: Exception,
    ) {
        AppResult.Failure(AppError.Unknown(e))
    }
