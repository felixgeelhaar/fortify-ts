import { type FortifyLogger } from '@fortify-ts/core';

/**
 * Configuration for the Fallback pattern.
 *
 * @template T - The return type of operations
 */
export interface FallbackConfig<T> {
  /**
   * The fallback function to execute when the primary operation fails.
   * Receives the AbortSignal and the error from the primary operation.
   * Required.
   */
  fallback: (signal: AbortSignal, error: Error) => Promise<T> | T;

  /**
   * Determines whether to execute the fallback function for a given error.
   * If not provided or returns true, fallback is always executed on primary failure.
   * Optional.
   */
  shouldFallback?: (error: Error) => boolean;

  /**
   * Called when the fallback function is triggered.
   * Receives the error from the primary operation.
   * Optional.
   */
  onFallback?: (error: Error) => void;

  /**
   * Called when the primary operation succeeds.
   * Optional.
   */
  onSuccess?: () => void;

  /**
   * Logger instance for structured logging.
   * Optional.
   */
  logger?: FortifyLogger;
}

/**
 * Validate and return the fallback configuration.
 *
 * @param config - Fallback configuration
 * @returns Validated configuration
 * @throws {Error} When fallback function is not provided
 */
export function validateFallbackConfig<T>(config: FallbackConfig<T>): FallbackConfig<T> {
  if (!config.fallback) {
    throw new Error('Fallback function is required');
  }
  return config;
}
