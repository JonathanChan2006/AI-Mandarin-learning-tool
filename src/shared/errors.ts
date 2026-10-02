export const ERROR_CODES = [
  'VALIDATION',
  'NO_API_KEY',
  'AUTH',
  'RATE_LIMIT',
  'NETWORK',
  'API',
  'REFUSED',
  'APKG',
  'DB_NOT_EMPTY',
  'ENCRYPTION_UNAVAILABLE',
  'NOT_FOUND',
  'INTERNAL'
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** An error with a stable code the renderer can branch on. */
export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}
