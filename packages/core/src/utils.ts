import { TimeoutError } from './errors.js';

/**
 * A static never-aborted AbortSignal for use when no signal is provided.
 * Avoids allocating a new AbortController on every operation call.
 *
 * This is a performance optimization for hot paths where signal is optional
 * but the operation signature requires AbortSignal.
 */
export const NEVER_ABORTED_SIGNAL: AbortSignal = new AbortController().signal;

/**
 * Sleep for a specified duration with optional cancellation support.
 *
 * @param ms - Duration in milliseconds
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise that resolves after the delay or rejects if cancelled
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(ensureError(signal.reason));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeoutId);
        reject(ensureError(signal.reason));
      },
      { once: true }
    );
  });
}

/**
 * Ensure a value is an Error instance.
 * @param reason - The reason to convert to an Error
 * @returns An Error instance
 */
function ensureError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }
  if (typeof reason === 'string') {
    return new Error(reason);
  }
  if (reason !== undefined && reason !== null) {
    // Handle objects and other types safely
    try {
      return new Error(JSON.stringify(reason));
    } catch {
      return new Error('Unknown error');
    }
  }
  return new DOMException('Aborted', 'AbortError');
}

/**
 * Wrap a promise with a timeout.
 *
 * @template T - The promise return type
 * @param promise - The promise to wrap
 * @param ms - Timeout duration in milliseconds
 * @param signal - Optional external AbortSignal for cancellation
 * @returns Promise that resolves with the result or rejects with TimeoutError
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  signal?: AbortSignal
): Promise<T> {
  // Check if already aborted
  if (signal?.aborted) {
    throw ensureError(signal.reason);
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`Operation timed out after ${String(ms)}ms`, ms));
    }, ms);
  });

  // Handle external signal
  const abortPromise = signal
    ? new Promise<never>((_, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(ensureError(signal.reason)),
          { once: true }
        );
      })
    : null;

  try {
    const racers: Promise<T>[] = [promise, timeoutPromise];
    if (abortPromise) {
      racers.push(abortPromise);
    }
    return await Promise.race(racers);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Execute an operation with a timeout, passing the combined signal to the operation.
 *
 * @template T - The operation return type
 * @param operation - The operation to execute
 * @param ms - Timeout duration in milliseconds
 * @param signal - Optional external AbortSignal for cancellation
 * @returns Promise that resolves with the result or rejects with TimeoutError
 */
export async function executeWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  ms: number,
  signal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();

  // Combine signals
  const combinedSignal = combineSignals(signal, controller.signal);

  const timeoutId = setTimeout(() => {
    controller.abort(new TimeoutError(`Operation timed out after ${String(ms)}ms`, ms));
  }, ms);

  try {
    return await operation(combinedSignal);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Combine multiple AbortSignals into one.
 * Returns a signal that aborts when any of the input signals abort.
 *
 * Uses AbortSignal.any() when available (Node 20+, modern browsers).
 * Falls back to a manual implementation that properly cleans up event listeners.
 *
 * @param signals - AbortSignals to combine (undefined values are filtered out)
 * @returns Combined AbortSignal
 */
export function combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const validSignals = signals.filter((s): s is AbortSignal => s !== undefined);

  if (validSignals.length === 0) {
    return NEVER_ABORTED_SIGNAL;
  }

  const firstSignal = validSignals[0];
  if (validSignals.length === 1 && firstSignal) {
    return firstSignal;
  }

  // Use AbortSignal.any if available (Node 20+, modern browsers)
  if ('any' in AbortSignal) {
    return AbortSignal.any(validSignals);
  }

  // Fallback: create a new controller and link it to all signals
  // Track listeners so we can clean them up to prevent memory leaks
  const controller = new AbortController();
  const listeners: { signal: AbortSignal; listener: () => void }[] = [];

  // Cleanup function to remove all listeners
  const cleanup = () => {
    for (const { signal, listener } of listeners) {
      signal.removeEventListener('abort', listener);
    }
    listeners.length = 0;
  };

  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }

    const listener = () => {
      cleanup(); // Clean up all listeners when any signal aborts
      controller.abort(signal.reason);
    };

    listeners.push({ signal, listener });
    signal.addEventListener('abort', listener, { once: true });
  }

  return controller.signal;
}

/**
 * Check if an error is an abort error (from AbortController).
 *
 * @param error - Error to check
 * @returns True if the error is an AbortError
 */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === 'AbortError'
  );
}

/**
 * Throw if the given signal is aborted.
 * Useful for checking signal state early in operations to avoid unnecessary work.
 *
 * @param signal - AbortSignal to check
 * @throws {DOMException} If signal is aborted (AbortError)
 */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  }
}

/**
 * Safely execute a callback, catching and logging any errors.
 * Used for user-provided callbacks to prevent them from breaking the pattern.
 *
 * @param callback - Callback to execute
 * @param onError - Optional error handler
 */
export function safeCallback<T extends (...args: unknown[]) => unknown>(
  callback: T | undefined,
  onError?: (error: Error) => void
): T | undefined {
  if (!callback) return undefined;

  return ((...args: Parameters<T>): ReturnType<T> | undefined => {
    try {
      return callback(...args) as ReturnType<T>;
    } catch (error) {
      if (onError && error instanceof Error) {
        onError(error);
      }
      return undefined;
    }
  }) as T;
}

/**
 * Jitter mode for delay randomization.
 *
 * - `full`: Random delay from 0 to base delay (aggressive, best for thundering herd)
 * - `equal`: Random delay from 50% to 100% of base delay (balanced)
 * - `decorrelated`: Each sleep is random between base and previous sleep * 3 (AWS-style)
 */
export type JitterMode = 'full' | 'equal' | 'decorrelated';

/**
 * Calculate jittered delay to prevent thundering herd.
 *
 * Uses "equal jitter" by default: random value between 50-100% of the delay.
 * This provides good dispersion while maintaining reasonable minimum delays.
 *
 * For more aggressive jitter, use mode='full' (0-100% of delay).
 * For AWS-style decorrelated jitter, use mode='decorrelated' with previousDelay.
 *
 * @param delay - Base delay in milliseconds
 * @param mode - Jitter mode: 'full', 'equal', or 'decorrelated' (default: 'equal')
 * @param previousDelay - Previous delay for decorrelated mode (default: delay)
 * @returns Jittered delay
 *
 * @example
 * ```typescript
 * // Equal jitter (default): 50-100% of delay
 * addJitter(1000); // Returns 500-1000ms
 *
 * // Full jitter: 0-100% of delay
 * addJitter(1000, 'full'); // Returns 0-1000ms
 *
 * // Decorrelated jitter (AWS-style)
 * let sleep = initialDelay;
 * sleep = addJitter(baseDelay, 'decorrelated', sleep);
 * ```
 */
export function addJitter(
  delay: number,
  mode: JitterMode = 'equal',
  previousDelay?: number
): number {
  switch (mode) {
    case 'full':
      // Full jitter: random(0, delay)
      return Math.floor(Math.random() * delay);

    case 'decorrelated': {
      // Decorrelated jitter: random(base, previous * 3)
      // Capped at delay to prevent unbounded growth
      const prev = previousDelay ?? delay;
      const min = delay;
      const max = Math.min(prev * 3, delay * 10); // Cap at 10x base
      return Math.floor(min + Math.random() * (max - min));
    }

    case 'equal':
    default:
      // Equal jitter: delay/2 + random(0, delay/2)
      // Results in 50-100% of original delay
      return Math.floor(delay * 0.5 + Math.random() * delay * 0.5);
  }
}

/**
 * Clamp a number between min and max values.
 *
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Get current timestamp in milliseconds.
 * Uses performance.now() if available for higher precision.
 *
 * @returns Current timestamp in milliseconds
 */
export function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
