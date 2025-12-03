import {
  type Resettable,
  RateLimitExceededError,
  type FortifyLogger,
  noopLogger,
  sleep,
} from '@fortify-ts/core';
import {
  type RateLimitConfig,
  type RateLimitConfigInputFull,
  parseRateLimitConfig,
} from './config.js';
import { TokenBucket } from './token-bucket.js';

/**
 * Token bucket rate limiter for controlling request rates.
 *
 * Uses the token bucket algorithm where tokens are added at a constant rate
 * up to a maximum burst capacity. Each request consumes one or more tokens.
 * When the bucket is empty, requests are either rejected (allow) or wait
 * for tokens to become available (wait).
 *
 * Includes LRU eviction to prevent unbounded memory growth when using many keys.
 * Configure maxBuckets to control maximum memory usage (default: 10000, 0 = unlimited).
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({
 *   rate: 100,
 *   burst: 150,
 *   interval: 1000, // 1 second
 *   maxBuckets: 10000, // LRU eviction after 10k unique keys
 *   onLimit: (key) => console.log(`Rate limited: ${key}`),
 * });
 *
 * if (limiter.allow('user-123')) {
 *   // Process request
 * } else {
 *   // Return 429 Too Many Requests
 * }
 * ```
 */
export class RateLimiter implements Resettable {
  private readonly config: RateLimitConfig;
  private readonly logger: FortifyLogger;
  private readonly buckets = new Map<string, TokenBucket>();
  private evictionCount = 0;

  /**
   * Create a new RateLimiter instance.
   *
   * @param config - Rate limiter configuration
   */
  constructor(config?: RateLimitConfigInputFull) {
    this.config = parseRateLimitConfig(config);
    this.logger = this.config.logger ?? noopLogger;
  }

  /**
   * Check if a request should be allowed based on rate limits.
   *
   * @param key - Rate limiting key (e.g., user ID, IP address)
   * @returns true if the request is allowed, false if rate limited
   */
  allow(key: string = ''): boolean {
    const bucket = this.getBucket(key);
    const allowed = bucket.allow();

    if (!allowed) {
      this.onRateLimited(key);
    }

    return allowed;
  }

  /**
   * Wait until a token is available or the signal is aborted.
   *
   * @param key - Rate limiting key
   * @param signal - Optional AbortSignal for cancellation
   * @throws {DOMException} When cancelled via signal (AbortError)
   */
  async wait(key: string = '', signal?: AbortSignal): Promise<void> {
    // Check if cancelled
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }

    const bucket = this.getBucket(key);

    while (true) {
      // Check if cancelled
      if (signal?.aborted) {
        throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      }

      // Try to take a token
      if (bucket.allow()) {
        return;
      }

      // Calculate wait time
      const waitDuration = bucket.waitTime();

      // Wait with cancellation support
      await sleep(waitDuration, signal);
    }
  }

  /**
   * Attempt to take n tokens from the bucket.
   *
   * @param key - Rate limiting key
   * @param tokens - Number of tokens to take
   * @returns true if n tokens were available, false otherwise
   */
  take(key: string, tokens: number): boolean {
    if (tokens <= 0) {
      return false;
    }

    const bucket = this.getBucket(key);
    const taken = bucket.take(tokens);

    if (!taken) {
      this.onRateLimited(key);
    }

    return taken;
  }

  /**
   * Execute an operation if rate limit allows.
   *
   * @param operation - The async operation to execute
   * @param key - Rate limiting key
   * @param signal - Optional AbortSignal for cancellation
   * @returns Promise resolving to the operation result
   * @throws {RateLimitExceededError} When rate limit is exceeded
   */
  async execute<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    key: string = '',
    signal?: AbortSignal
  ): Promise<T> {
    // Check if cancelled
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }

    if (!this.allow(key)) {
      throw new RateLimitExceededError();
    }

    return operation(signal ?? new AbortController().signal);
  }

  /**
   * Reset the rate limiter, clearing all buckets.
   */
  reset(): void {
    this.buckets.clear();
    this.logger.info('Rate limiter reset');
  }

  /**
   * Get or create a token bucket for the given key.
   * Implements LRU eviction when maxBuckets is exceeded.
   */
  private getBucket(key: string): TokenBucket {
    let bucket = this.buckets.get(key);

    if (bucket) {
      // LRU touch: move to end by deleting and re-adding
      // This keeps most recently used items at the end
      this.buckets.delete(key);
      this.buckets.set(key, bucket);
      return bucket;
    }

    // Create new bucket
    bucket = new TokenBucket(
      this.config.rate,
      this.config.burst,
      this.config.interval
    );

    // Evict oldest entries if we've exceeded maxBuckets (0 = unlimited)
    if (this.config.maxBuckets > 0 && this.buckets.size >= this.config.maxBuckets) {
      this.evictOldest();
    }

    this.buckets.set(key, bucket);
    return bucket;
  }

  /**
   * Evict the oldest (least recently used) bucket.
   */
  private evictOldest(): void {
    // Map iterator returns entries in insertion order
    // First entry is the oldest (least recently used)
    const firstKey = this.buckets.keys().next().value;
    if (firstKey !== undefined) {
      this.buckets.delete(firstKey);
      this.evictionCount++;
      this.logger.debug('Evicted LRU bucket', { key: firstKey, evictionCount: this.evictionCount });
    }
  }

  /**
   * Get the number of active buckets.
   */
  bucketCount(): number {
    return this.buckets.size;
  }

  /**
   * Get the total number of evictions since creation.
   */
  getEvictionCount(): number {
    return this.evictionCount;
  }

  /**
   * Handle rate limiting event.
   */
  private onRateLimited(key: string): void {
    this.logger.warn('Rate limit exceeded', {
      key,
      rate: this.config.rate,
      burst: this.config.burst,
    });

    if (this.config.onLimit) {
      try {
        this.config.onLimit(key);
      } catch (error) {
        this.logger.error('onLimit callback threw an error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
