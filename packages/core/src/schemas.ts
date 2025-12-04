import { z } from 'zod';

/**
 * Schema for a function type (Zod 4 compatible).
 * Uses z.function() which validates that the value is a function.
 */
const functionSchema = z.function();

/**
 * Base schema for logger configuration.
 * Validates that the logger has the required methods.
 */
export const loggerSchema = z.object({
  debug: functionSchema,
  info: functionSchema,
  warn: functionSchema,
  error: functionSchema,
}).optional();

/**
 * Schema for timeout configuration.
 */
export const timeoutConfigSchema = z.object({
  /** Default timeout in milliseconds (default: 30000) */
  defaultTimeout: z.number().int().positive().default(30000),
  /** Callback when timeout occurs */
  onTimeout: functionSchema.optional(),
  /** Logger instance */
  logger: loggerSchema,
});

export type TimeoutConfig = z.infer<typeof timeoutConfigSchema>;

/**
 * Schema for retry backoff policy.
 */
export const backoffPolicySchema = z.enum(['exponential', 'linear', 'constant']);

export type BackoffPolicy = z.infer<typeof backoffPolicySchema>;

/**
 * Schema for retry configuration.
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
  /** Custom function to determine if error is retryable */
  isRetryable: functionSchema.optional(),
  /** Callback on each retry attempt */
  onRetry: functionSchema.optional(),
  /** Logger instance */
  logger: loggerSchema,
});

export type RetryConfig = z.infer<typeof retryConfigSchema>;

/**
 * Schema for circuit breaker state.
 */
export const circuitBreakerStateSchema = z.enum(['closed', 'open', 'half-open']);

export type CircuitBreakerState = z.infer<typeof circuitBreakerStateSchema>;

/**
 * Schema for circuit breaker counts/metrics.
 */
export const circuitBreakerCountsSchema = z.object({
  requests: z.number().int().nonnegative(),
  totalSuccesses: z.number().int().nonnegative(),
  totalFailures: z.number().int().nonnegative(),
  consecutiveSuccesses: z.number().int().nonnegative(),
  consecutiveFailures: z.number().int().nonnegative(),
});

export type CircuitBreakerCounts = z.infer<typeof circuitBreakerCountsSchema>;

/**
 * Schema for circuit breaker configuration.
 */
export const circuitBreakerConfigSchema = z.object({
  /** Maximum consecutive failures before opening (default: 5) */
  maxFailures: z.number().int().positive().default(5),
  /** Duration in open state before transitioning to half-open in milliseconds (default: 60000) */
  timeout: z.number().int().positive().default(60000),
  /** Maximum requests allowed in half-open state (default: 1) */
  halfOpenMaxRequests: z.number().int().positive().default(1),
  /** Period to clear counts when closed, 0 means never (default: 0) */
  interval: z.number().int().nonnegative().default(0),
  /** Custom function to determine when to trip the breaker */
  readyToTrip: functionSchema.optional(),
  /** Custom function to determine if result is successful */
  isSuccessful: functionSchema.optional(),
  /** Callback on state change */
  onStateChange: functionSchema.optional(),
  /** Logger instance */
  logger: loggerSchema,
});

export type CircuitBreakerConfig = z.infer<typeof circuitBreakerConfigSchema>;

/**
 * Schema for rate limiter configuration.
 */
export const rateLimitConfigSchema = z.object({
  /** Number of tokens added per interval (default: 100) */
  rate: z.number().int().positive().default(100),
  /** Maximum bucket capacity (defaults to rate) */
  burst: z.number().int().positive().optional(),
  /** Interval for token refill in milliseconds (default: 1000) */
  interval: z.number().int().positive().default(1000),
  /** Callback when rate limit is hit */
  onLimit: functionSchema.optional(),
  /** Logger instance */
  logger: loggerSchema,
});

export type RateLimitConfig = z.infer<typeof rateLimitConfigSchema>;

/**
 * Schema for bulkhead configuration.
 */
export const bulkheadConfigSchema = z.object({
  /** Maximum concurrent executions (default: 10) */
  maxConcurrent: z.number().int().positive().default(10),
  /** Maximum queued requests, 0 means no queueing (default: 0) */
  maxQueue: z.number().int().nonnegative().default(0),
  /** Maximum time to wait in queue in milliseconds */
  queueTimeout: z.number().int().positive().optional(),
  /** Callback when request is rejected */
  onRejected: functionSchema.optional(),
  /** Logger instance */
  logger: loggerSchema,
});

export type BulkheadConfig = z.infer<typeof bulkheadConfigSchema>;

/**
 * Schema for fallback configuration.
 */
export const fallbackConfigSchema = z.object({
  /** Fallback function to execute when primary fails */
  fallback: functionSchema,
  /** Custom function to determine if fallback should be used */
  shouldFallback: functionSchema.optional(),
  /** Callback when fallback is triggered */
  onFallback: functionSchema.optional(),
  /** Callback when primary succeeds */
  onSuccess: functionSchema.optional(),
  /** Logger instance */
  logger: loggerSchema,
});

export type FallbackConfig = z.infer<typeof fallbackConfigSchema>;
