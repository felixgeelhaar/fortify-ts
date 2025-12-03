/**
 * Represents an async operation that can be executed with cancellation support.
 * The signal parameter allows the operation to be cancelled via AbortController.
 *
 * @template T - The return type of the operation
 */
export type Operation<T> = (signal: AbortSignal) => Promise<T>;

/**
 * Callback for state changes in stateful patterns (e.g., circuit breaker).
 *
 * @template S - The state type
 */
export type StateChangeCallback<S> = (from: S, to: S) => void;

/**
 * Callback for error events.
 */
export type ErrorCallback = (error: Error) => void;

/**
 * Simple void callback.
 */
export type VoidCallback = () => void;

/**
 * Callback for retry events.
 */
export type RetryCallback = (attempt: number, error: Error) => void;

/**
 * Callback for rate limit events.
 */
export type RateLimitCallback = (key: string) => void;

/**
 * Logger interface for structured logging across all patterns.
 * Compatible with pino, winston, console, and custom implementations.
 */
export interface FortifyLogger {
  debug(msg: string, context?: Record<string, unknown>): void;
  info(msg: string, context?: Record<string, unknown>): void;
  warn(msg: string, context?: Record<string, unknown>): void;
  error(msg: string, context?: Record<string, unknown>): void;
}

/**
 * No-operation logger that discards all log messages.
 * Useful for testing or when logging is not needed.
 */
export const noopLogger: FortifyLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * Console-based logger implementation.
 * Browser-friendly and works in all environments.
 */
export const consoleLogger: FortifyLogger = {
  debug: (msg, context) => {
    if (context) {
      console.debug(`[fortify] ${msg}`, context);
    } else {
      console.debug(`[fortify] ${msg}`);
    }
  },
  info: (msg, context) => {
    if (context) {
      console.info(`[fortify] ${msg}`, context);
    } else {
      console.info(`[fortify] ${msg}`);
    }
  },
  warn: (msg, context) => {
    if (context) {
      console.warn(`[fortify] ${msg}`, context);
    } else {
      console.warn(`[fortify] ${msg}`);
    }
  },
  error: (msg, context) => {
    if (context) {
      console.error(`[fortify] ${msg}`, context);
    } else {
      console.error(`[fortify] ${msg}`);
    }
  },
};

/**
 * Generic pattern interface that all resilience patterns implement.
 *
 * @template T - The return type of the operation
 */
export interface Pattern<T> {
  /**
   * Execute an operation with the pattern's resilience logic.
   *
   * @param operation - The async operation to execute
   * @param signal - Optional AbortSignal for cancellation
   * @returns Promise resolving to the operation result
   */
  execute(operation: Operation<T>, signal?: AbortSignal): Promise<T>;
}

/**
 * Interface for patterns that support closing/cleanup.
 */
export interface Closeable {
  /**
   * Close the pattern and release resources.
   * May wait for in-flight operations to complete.
   */
  close(): Promise<void>;
}

/**
 * Interface for patterns that support resetting state.
 */
export interface Resettable {
  /**
   * Reset the pattern to its initial state.
   */
  reset(): void;
}
