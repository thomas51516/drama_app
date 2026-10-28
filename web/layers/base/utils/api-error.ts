import type { ApiErrorBody } from '../types/api'

/**
 * Normalised error thrown by `useApi()` in both real and mock modes.
 * `status` is 0 when the request never reached the server (network failure).
 * `code` is the stable `ApiErrorDto.code` of the backend when present.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly data: unknown

  constructor(status: number, message: string, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
    const body = data as Partial<ApiErrorBody> | undefined
    this.code = typeof body?.code === 'string' ? body.code : null
  }

  static is(error: unknown): error is ApiError {
    return error instanceof ApiError
  }

  /** Build an error carrying a backend-shaped body (used by the mock API). */
  static fromBody(status: number, code: string, message: string, path = ''): ApiError {
    const body: ApiErrorBody = {
      statusCode: status,
      code,
      message,
      path,
      timestamp: new Date().toISOString(),
    }
    return new ApiError(status, message, body)
  }
}
