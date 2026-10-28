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

sealed interface AppError {
    data class Network(
        val cause: Throwable? = null,
    ) : AppError

    data class Http(
        val code: Int,
        val message: String? = null,
    ) : AppError

    data class NotFound(
        val what: String,
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
