/**
 * Normalised error thrown by `useApi()` in both real and mock modes.
 * `status` is 0 when the request never reached the server (network failure).
 */
export class ApiError extends Error {
  readonly status: number
  readonly data: unknown

  constructor(status: number, message: string, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }

  static is(error: unknown): error is ApiError {
    return error instanceof ApiError
  }
}
