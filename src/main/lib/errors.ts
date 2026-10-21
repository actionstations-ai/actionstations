export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'NOT_IMPLEMENTED'
  | 'CONFLICT'
  | 'PATH_ESCAPE'
  | 'FORBIDDEN'
  | 'PROVIDER'
  | 'CANCELLED'
  | 'INTERNAL'

/** Error type that crosses the IPC boundary with a stable code. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (err instanceof Error) {
    if (err.name === 'AbortError') return new AppError('CANCELLED', 'Cancelled')
    return new AppError('INTERNAL', err.message)
  }
  return new AppError('INTERNAL', String(err))
}
