/**
 * Base error class for all Fortify errors.
 */
export class FortifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FortifyError';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    // Use typeof check to avoid unnecessary-condition lint error
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when circuit breaker is in open state and rejecting requests.
 */
export class CircuitOpenError extends FortifyError {
  constructor(message = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Error thrown when rate limit is exceeded.
 */
export class RateLimitExceededError extends FortifyError {
  public readonly key: string | undefined;

  constructor(message = 'Rate limit exceeded', key?: string) {
    super(message);
    this.name = 'RateLimitExceededError';
    this.key = key;
  }
}

/**
 * Error thrown when bulkhead is at capacity.
 */
export class BulkheadFullError extends FortifyError {
  public readonly activeCount: number;
  public readonly queuedCount: number;

  constructor(
    message = 'Bulkhead is full',
    activeCount = 0,
    queuedCount = 0
  ) {
    super(message);
    this.name = 'BulkheadFullError';
    this.activeCount = activeCount;
    this.queuedCount = queuedCount;
  }
}

/**
 * Error thrown when operation times out.
 */
export class TimeoutError extends FortifyError {
  public readonly timeoutMs: number;

  constructor(message = 'Operation timed out', timeoutMs = 0) {
    super(message);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when maximum retry attempts are reached.
 */
export class MaxAttemptsReachedError extends FortifyError {
  public readonly attempts: number;
  public readonly lastError: Error | undefined;

  constructor(
    message = 'Maximum retry attempts reached',
    attempts = 0,
    lastError?: Error
  ) {
    super(message);
    this.name = 'MaxAttemptsReachedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Error thrown when bulkhead is closed and no new operations accepted.
 */
export class BulkheadClosedError extends FortifyError {
  constructor(message = 'Bulkhead is closed') {
    super(message);
    this.name = 'BulkheadClosedError';
  }
}

/**
 * Interface for errors that can indicate whether they are retryable.
 */
export interface RetryableError {
  retryable: boolean;
}

/**
 * Type guard to check if an error implements RetryableError interface.
 */
export function isRetryableError(error: unknown): error is Error & RetryableError {
  return (
    error instanceof Error &&
    'retryable' in error &&
    typeof (error as RetryableError).retryable === 'boolean'
  );
}

/**
 * Wrapper class to mark an error as retryable.
 */
export class RetryableErrorWrapper extends Error implements RetryableError {
  public readonly retryable: boolean;
  public override readonly cause: Error;

  constructor(error: Error, retryable: boolean) {
    super(error.message, { cause: error });
    this.name = 'RetryableErrorWrapper';
    this.retryable = retryable;
    this.cause = error;
    if (error.stack) {
      this.stack = error.stack;
    }
  }
}

/**
 * Wrap an error as retryable.
 */
export function asRetryable(error: Error, retryable = true): RetryableErrorWrapper {
  return new RetryableErrorWrapper(error, retryable);
}

/**
 * Wrap an error as non-retryable.
 */
export function asNonRetryable(error: Error): RetryableErrorWrapper {
  return new RetryableErrorWrapper(error, false);
}

/**
 * Check if an error is retryable.
 * Returns true if the error implements RetryableError and retryable is true.
 * Returns undefined if the error doesn't implement RetryableError (let caller decide).
 */
export function isRetryable(error: unknown): boolean | undefined {
  if (isRetryableError(error)) {
    return error.retryable;
  }
  return undefined;
}
