import { z } from 'zod';
import { type FortifyLogger } from '@fortify-ts/core';

/**
 * Zod schema for RateLimiter configuration.
 */
export const rateLimitConfigSchema = z.object({
  /** Number of tokens added per interval (default: 100) */
  rate: z.number().int().positive().default(100),
  /** Maximum tokens in the bucket / burst capacity (default: rate value) */
  burst: z.number().int().positive().optional(),
  /** Time interval in milliseconds for rate replenishment (default: 1000ms) */
  interval: z.number().int().positive().default(1000),
  /** Maximum number of buckets to keep in memory (default: 10000, 0 = unlimited) */
  maxBuckets: z.number().int().nonnegative().default(10000),
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
  burst: number;
  /** Maximum number of buckets to keep in memory (0 = unlimited) */
  maxBuckets: number;
  /** Callback when rate limit is exceeded */
  onLimit: ((key: string) => void) | undefined;
  /** Logger instance for structured logging */
  logger: FortifyLogger | undefined;
}

/**
 * Input config type for constructor.
 */
export interface RateLimitConfigInputFull extends RateLimitConfigInput {
  /** Maximum number of buckets to keep in memory (default: 10000, 0 = unlimited) */
  maxBuckets?: number;
  onLimit?: (key: string) => void;
  logger?: FortifyLogger;
}

/**
 * Parse and validate rate limit configuration.
 *
 * @param config - Raw configuration input
 * @returns Validated configuration with defaults applied
 */
export function parseRateLimitConfig(config?: RateLimitConfigInputFull): RateLimitConfig {
  const parsed = rateLimitConfigSchema.parse(config ?? {});
  return {
    ...parsed,
    burst: parsed.burst ?? parsed.rate,
    onLimit: config?.onLimit,
    logger: config?.logger,
  };
}
