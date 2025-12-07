import { z } from 'zod';
import { type FortifyLogger, type RateLimitStorage } from '@fortify-ts/core';

/**
 * Behavior when external storage operations fail.
 *
 * - `fail-open`: Allow the request (permissive, may over-allow)
 * - `fail-closed`: Deny the request (strict, may over-deny)
 * - `throw`: Throw the storage error (explicit handling required)
 */
export type StorageFailureMode = 'fail-open' | 'fail-closed' | 'throw';

/** Maximum reasonable rate limit (1 billion tokens) */
const MAX_TOKENS = 1_000_000_000;

/** Maximum reasonable interval (1 day in ms) */
const MAX_INTERVAL_MS = 86_400_000;

/** Maximum buckets limit (10 million) */
const MAX_BUCKETS = 10_000_000;

/** Default storage timeout (5 seconds) */
const DEFAULT_STORAGE_TIMEOUT_MS = 5000;

/** Minimum storage timeout (100ms) */
const MIN_STORAGE_TIMEOUT_MS = 100;

/** Maximum storage timeout (5 minutes) */
const MAX_STORAGE_TIMEOUT_MS = 300_000;

/** Maximum storage TTL (1 week) */
const MAX_STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Zod schema for RateLimiter configuration.
 */
export const rateLimitConfigSchema = z.object({
  /** Number of tokens added per interval (default: 100, max: 1 billion) */
  rate: z.number().int().positive().max(MAX_TOKENS).default(100),
  /** Maximum tokens in the bucket / burst capacity (default: rate value, max: 1 billion) */
  burst: z.number().int().positive().max(MAX_TOKENS).optional(),
  /** Time interval in milliseconds for rate replenishment (default: 1000ms, max: 1 day) */
  interval: z.number().int().positive().max(MAX_INTERVAL_MS).default(1000),
  /** Maximum number of buckets to keep in memory (default: 10000, 0 = unlimited, max: 10 million) */
  maxBuckets: z.number().int().nonnegative().max(MAX_BUCKETS).default(10000),
});

/**
 * Raw config input type (before defaults are applied).
 */
export type RateLimitConfigInput = z.input<typeof rateLimitConfigSchema>;

/**
 * Parsed config type (after defaults are applied).
 */
export type RateLimitConfigParsed = z.output<typeof rateLimitConfigSchema>;

/**
 * Full configuration type including callbacks and logger.
 */
export interface RateLimitConfig extends Omit<RateLimitConfigParsed, 'burst'> {
  /** Maximum tokens in the bucket (defaults to rate if not specified) */
  readonly burst: number;
  /** Maximum number of buckets to keep in memory (0 = unlimited) */
  readonly maxBuckets: number;
  /** Callback when rate limit is exceeded */
  readonly onLimit: ((key: string) => void) | undefined;
  /** Logger instance for structured logging */
  readonly logger: FortifyLogger | undefined;
  /**
   * External storage adapter for distributed/serverless environments.
   * When provided, enables async methods (allowAsync, takeAsync, etc.)
   * for use with external persistence like Redis, Forge Storage, or DynamoDB.
   */
  readonly storage: RateLimitStorage | undefined;
  /**
   * TTL in milliseconds for bucket entries in external storage.
   * Recommended for automatic cleanup of stale buckets.
   * Default: interval * (burst / rate) * 2 (time to refill bucket twice)
   */
  readonly storageTtlMs: number;
  /**
   * Behavior when external storage operations fail.
   * - `fail-open`: Allow the request (permissive, may over-allow during outages)
   * - `fail-closed`: Deny the request (strict, may over-deny during outages)
   * - `throw`: Throw the storage error (explicit handling required)
   * Default: `fail-open`
   */
  readonly storageFailureMode: StorageFailureMode;
  /**
   * Whether to sanitize storage keys to prevent injection attacks.
   * When enabled, keys are sanitized to remove control characters and path separators.
   * Default: true
   */
  readonly sanitizeKeys: boolean;
  /**
   * Timeout in milliseconds for storage operations.
   * If a storage operation takes longer than this, it will be treated as a failure.
   * Default: 5000ms (5 seconds)
   */
  readonly storageTimeoutMs: number;
}

/**
 * Input config type for constructor.
 */
export interface RateLimitConfigInputFull extends RateLimitConfigInput {
  /** Maximum number of buckets to keep in memory (default: 10000, 0 = unlimited) */
  maxBuckets?: number;
  onLimit?: (key: string) => void;
  logger?: FortifyLogger;
  /**
   * External storage adapter for distributed/serverless environments.
   * When provided, enables async methods (allowAsync, takeAsync, etc.)
   * for use with external persistence like Redis, Forge Storage, or DynamoDB.
   *
   * @example
   * ```typescript
   * // Redis adapter
   * const limiter = new RateLimiter({
   *   rate: 100,
   *   storage: {
   *     async get(key) {
   *       const data = await redis.get(`rl:${key}`);
   *       return data ? JSON.parse(data) : null;
   *     },
   *     async set(key, state, ttlMs) {
   *       await redis.set(`rl:${key}`, JSON.stringify(state), 'PX', ttlMs);
   *     }
   *   }
   * });
   *
   * // Use async methods for external storage
   * if (await limiter.allowAsync('user-123')) {
   *   // Process request
   * }
   * ```
   */
  storage?: RateLimitStorage;
  /**
   * TTL in milliseconds for bucket entries in external storage.
   * If not specified, defaults to: interval * (burst / rate) * 2
   */
  storageTtlMs?: number;
  /**
   * Behavior when external storage operations fail.
   * - `fail-open`: Allow the request (permissive, may over-allow during outages)
   * - `fail-closed`: Deny the request (strict, may over-deny during outages)
   * - `throw`: Throw the storage error (explicit handling required)
   * Default: `fail-open`
   */
  storageFailureMode?: StorageFailureMode;
  /**
   * Whether to sanitize storage keys to prevent injection attacks.
   * When enabled, keys are sanitized to remove control characters and path separators.
   * Default: true
   */
  sanitizeKeys?: boolean;
  /**
   * Timeout in milliseconds for storage operations.
   * If a storage operation takes longer than this, it will be treated as a failure.
   * Default: 5000ms (5 seconds)
   */
  storageTimeoutMs?: number;
}

/**
 * Parse and validate rate limit configuration.
 *
 * @param config - Raw configuration input
 * @returns Validated configuration with defaults applied
 * @throws {Error} If storageTimeoutMs or storageTtlMs are out of bounds
 */
export function parseRateLimitConfig(config?: RateLimitConfigInputFull): RateLimitConfig {
  const parsed = rateLimitConfigSchema.parse(config ?? {});
  const burst = parsed.burst ?? parsed.rate;

  // Calculate default TTL: time to refill bucket twice
  // This ensures active buckets stay alive while stale ones expire
  // Cap at MAX_STORAGE_TTL_MS to avoid overflow
  const defaultTtlMs = Math.min(
    parsed.interval * (burst / parsed.rate) * 2,
    MAX_STORAGE_TTL_MS
  );

  // Validate storageTimeoutMs if provided
  let storageTimeoutMs: number | undefined;
  if (config?.storageTimeoutMs !== undefined) {
    if (
      !Number.isFinite(config.storageTimeoutMs) ||
      config.storageTimeoutMs < MIN_STORAGE_TIMEOUT_MS ||
      config.storageTimeoutMs > MAX_STORAGE_TIMEOUT_MS
    ) {
      throw new Error(
        `storageTimeoutMs must be between ${String(MIN_STORAGE_TIMEOUT_MS)}ms and ${String(MAX_STORAGE_TIMEOUT_MS)}ms, got ${String(config.storageTimeoutMs)}`
      );
    }
    storageTimeoutMs = config.storageTimeoutMs;
  } else {
    storageTimeoutMs = DEFAULT_STORAGE_TIMEOUT_MS;
  }

  // Validate storageTtlMs if provided
  const storageTtlMs = config?.storageTtlMs ?? defaultTtlMs;
  if (
    !Number.isFinite(storageTtlMs) ||
    storageTtlMs < 0 ||
    storageTtlMs > MAX_STORAGE_TTL_MS
  ) {
    throw new Error(
      `storageTtlMs must be between 0 and ${String(MAX_STORAGE_TTL_MS)}ms (1 week), got ${String(config?.storageTtlMs)}`
    );
  }

  return {
    ...parsed,
    burst,
    onLimit: config?.onLimit,
    logger: config?.logger,
    storage: config?.storage,
    storageTtlMs,
    storageFailureMode: config?.storageFailureMode ?? 'fail-open',
    sanitizeKeys: config?.sanitizeKeys ?? true,
    storageTimeoutMs,
  };
}
