import { z } from 'zod';
import { type FortifyLogger } from '@fortify-ts/core';

/**
 * Backoff policy enum.
 */
export const backoffPolicySchema = z.enum(['exponential', 'linear', 'constant']);
export type BackoffPolicy = z.infer<typeof backoffPolicySchema>;

/**
 * Zod schema for Retry configuration.
 */
export const retryConfigSchema = z.object({
  /** Maximum number of attempts including the first (default: 3) */
  maxAttempts: z.number().int().positive().default(3),
  /** Initial delay before first retry in milliseconds (default: 100) */
  initialDelay: z.number().int().positive().default(100),
  /** Maximum delay between retries in milliseconds */
  maxDelay: z.number().int().positive().optional(),
  /** Backoff strategy (default: 'exponential') */
  backoffPolicy: backoffPolicySchema.default('exponential'),
  /** Multiplier for exponential backoff (default: 2.0) */
  multiplier: z.number().positive().default(2.0),
  /** Add random jitter to delays (default: false) */
  jitter: z.boolean().default(false),
});

/**
 * Raw config input type (before defaults are applied).
 */
export type RetryConfigInput = z.input<typeof retryConfigSchema>;

/**
 * Parsed config type (after defaults are applied).
 */
export type RetryConfigParsed = z.output<typeof retryConfigSchema>;

/**
 * Full configuration type including callbacks and logger.
 */
export interface RetryConfig extends RetryConfigParsed {
  /** Custom function to determine if error is retryable */
  isRetryable: ((error: Error) => boolean) | undefined;
  /** Callback on each retry attempt */
  onRetry: ((attempt: number, error: Error) => void) | undefined;
  /** Logger instance for structured logging */
  logger: FortifyLogger | undefined;
}

/**
 * Input config type for constructor.
 */
export interface RetryConfigInputFull extends RetryConfigInput {
  isRetryable?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
  logger?: FortifyLogger;
}

/**
 * Parse and validate retry configuration.
 *
 * @param config - Raw configuration input
 * @returns Validated configuration with defaults applied
 */
export function parseRetryConfig(config?: RetryConfigInputFull): RetryConfig {
  const parsed = retryConfigSchema.parse(config ?? {});
  return {
    ...parsed,
    isRetryable: config?.isRetryable,
    onRetry: config?.onRetry,
    logger: config?.logger,
  };
}
