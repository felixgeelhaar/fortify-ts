import {
  type Resettable,
  RateLimitExceededError,
  type FortifyLogger,
  type BucketState,
  type RateLimitStorage,
  MemoryStorage,
  noopLogger,
  sleep,
  sanitizeStorageKey,
  validateBucketState,
} from '@fortify-ts/core';
import {
  type RateLimitConfig,
  type RateLimitConfigInputFull,
  parseRateLimitConfig,
} from './config.js';

/**
 * Result of a token check operation.
 * @internal
 */
interface TokenCheckResult {
  readonly allowed: boolean;
  readonly newState: BucketState;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum elapsed time to consider for token refill (1 hour) */
const MAX_ELAPSED_MS = 60 * 60 * 1000;

/** Maximum wait time before giving up (24 hours) */
const MAX_WAIT_MS = 24 * 60 * 60 * 1000;

/** Maximum clock skew tolerance for bucket validation (5 seconds) */
const MAX_CLOCK_SKEW_MS = 5000;

/** Initial backoff delay for storage retries in fail-closed mode (100ms) */
const INITIAL_BACKOFF_MS = 100;

/** Maximum backoff delay for storage retries (5 seconds) */
const MAX_BACKOFF_MS = 5000;

/** Maximum size of the key sanitization cache */
const SANITIZATION_CACHE_SIZE = 1000;

/**
 * Token bucket rate limiter for controlling request rates.
 *
 * Uses the token bucket algorithm where tokens are added at a constant rate
 * up to a maximum burst capacity. Each request consumes one or more tokens.
 * When the bucket is empty, requests are either rejected (allow) or wait
 * for tokens to become available (wait).
 *
 * Supports two modes:
 * 1. **In-memory (default)**: Uses synchronous methods (allow, take, wait, execute).
 *    Fast, zero-latency, but state doesn't persist across process restarts.
 *
 * 2. **External storage**: Uses async methods (allowAsync, takeAsync, waitAsync, executeAsync).
 *    Enables rate limiting in serverless/distributed environments by persisting
 *    state to Redis, Forge Storage, DynamoDB, etc.
 *
 * ## Storage Error Handling
 *
 * When using external storage, you can configure how storage failures are handled:
 * - `fail-open` (default): Allow the request if storage fails (permissive)
 * - `fail-closed`: Deny the request if storage fails (strict)
 * - `throw`: Re-throw the storage error for explicit handling
 *
 * @example In-memory usage (default)
 * ```typescript
 * const limiter = new RateLimiter({
 *   rate: 100,
 *   burst: 150,
 *   interval: 1000, // 1 second
 * });
 *
 * if (limiter.allow('user-123')) {
 *   // Process request
 * } else {
 *   // Return 429 Too Many Requests
 * }
 * ```
 *
 * @example External storage (serverless/distributed)
 * ```typescript
 * import { storage } from '@forge/api';
 *
 * const limiter = new RateLimiter({
 *   rate: 100,
 *   burst: 150,
 *   storageFailureMode: 'fail-open',
 *   storage: {
 *     async get(key) {
 *       return await storage.get(`ratelimit:${key}`);
 *     },
 *     async set(key, state, ttlMs) {
 *       await storage.set(`ratelimit:${key}`, state);
 *     }
 *   }
 * });
 *
 * // Use async methods with external storage
 * if (await limiter.allowAsync('user-123')) {
 *   // Process request
 * }
 * ```
 */
export class RateLimiter implements Resettable {
  private readonly config: RateLimitConfig;
  private readonly logger: FortifyLogger;
  private readonly memoryStorage: MemoryStorage;
  private readonly externalStorage: RateLimitStorage | undefined;

  /** Pre-calculated tokens per millisecond for performance */
  private readonly tokensPerMs: number;

  /** LRU cache for sanitized keys to avoid repeated regex operations */
  private readonly sanitizedKeyCache = new Map<string, string>();

  /** Reusable AbortSignal for operations without explicit signal */
  private static readonly defaultSignal = new AbortController().signal;

  /**
   * Create a new RateLimiter instance.
   *
   * @param config - Rate limiter configuration
   */
  constructor(config?: RateLimitConfigInputFull) {
    this.config = parseRateLimitConfig(config);
    this.logger = this.config.logger ?? noopLogger;
    this.memoryStorage = new MemoryStorage({ maxEntries: this.config.maxBuckets });
    this.externalStorage = this.config.storage;

    // Pre-calculate tokens per millisecond for performance
    this.tokensPerMs =
      this.config.interval > 0 ? this.config.rate / this.config.interval : 0;
  }

  // ============================================================================
  // Synchronous methods (in-memory only)
  // ============================================================================

  /**
   * Check if a request should be allowed based on rate limits.
   * Uses in-memory storage only (synchronous).
   *
   * @param key - Rate limiting key (e.g., user ID, IP address)
   * @returns true if the request is allowed, false if rate limited
   */
  allow(key = ''): boolean {
    const sanitizedKey = this.sanitizeKey(key);
    const state = this.getBucketSync(sanitizedKey);
    const now = Date.now();
    const result = this.checkAndConsumeTokens(state, now, 1);

    this.memoryStorage.setSync(sanitizedKey, result.newState);

    if (!result.allowed) {
      this.onRateLimited(key);
    }

    return result.allowed;
  }

  /**
   * Attempt to take n tokens from the bucket.
   * Uses in-memory storage only (synchronous).
   *
   * @param key - Rate limiting key
   * @param tokens - Number of tokens to take
   * @returns true if n tokens were available, false otherwise
   */
  take(key: string, tokens: number): boolean {
    if (tokens <= 0) {
      return false;
    }

    const sanitizedKey = this.sanitizeKey(key);
    const state = this.getBucketSync(sanitizedKey);
    const now = Date.now();
    const result = this.checkAndConsumeTokens(state, now, tokens);

    this.memoryStorage.setSync(sanitizedKey, result.newState);

    if (!result.allowed) {
      this.onRateLimited(key);
    }

    return result.allowed;
  }

  /**
   * Wait until a token is available or the signal is aborted.
   * Uses in-memory storage only (synchronous bucket access).
   *
   * @param key - Rate limiting key
   * @param signal - Optional AbortSignal for cancellation
   * @throws {DOMException} When cancelled via signal (AbortError)
   */
  async wait(key = '', signal?: AbortSignal): Promise<void> {
    this.throwIfAborted(signal);

    const sanitizedKey = this.sanitizeKey(key);

    for (;;) {
      this.throwIfAborted(signal);

      const state = this.getBucketSync(sanitizedKey);
      const now = Date.now();
      const result = this.checkAndConsumeTokens(state, now, 1);

      this.memoryStorage.setSync(sanitizedKey, result.newState);

      if (result.allowed) {
        return;
      }

      const waitDuration = this.calculateWaitTime(result.newState);
      await sleep(waitDuration, signal);
    }
  }

  /**
   * Execute an operation if rate limit allows.
   * Uses in-memory storage only (synchronous).
   *
   * @param operation - The async operation to execute
   * @param key - Rate limiting key
   * @param signal - Optional AbortSignal for cancellation
   * @returns Promise resolving to the operation result
   * @throws {RateLimitExceededError} When rate limit is exceeded
   */
  async execute<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    key = '',
    signal?: AbortSignal
  ): Promise<T> {
    this.throwIfAborted(signal);

    if (!this.allow(key)) {
      throw new RateLimitExceededError('Rate limit exceeded', key);
    }

    return operation(signal ?? RateLimiter.defaultSignal);
  }

  // ============================================================================
  // Async methods (external storage support)
  // ============================================================================

  /**
   * Check if a request should be allowed based on rate limits.
   * Uses external storage adapter for persistence across invocations.
   *
   * @param key - Rate limiting key (e.g., user ID, IP address)
   * @returns Promise resolving to true if allowed, false if rate limited
   */
  async allowAsync(key = ''): Promise<boolean> {
    const sanitizedKey = this.sanitizeKey(key);

    // Fast path: use memory storage if no external storage
    if (!this.externalStorage) {
      return this.allow(key);
    }

    try {
      const state = await this.getBucketAsync(sanitizedKey, this.externalStorage);
      const now = Date.now();
      const result = this.checkAndConsumeTokens(state, now, 1);

      await this.withStorageTimeout(
        this.externalStorage.set(sanitizedKey, result.newState, this.config.storageTtlMs),
        'set'
      );

      if (!result.allowed) {
        this.onRateLimited(key);
      }

      return result.allowed;
    } catch (error) {
      return this.handleStorageError(error, key, 'allowAsync');
    }
  }

  /**
   * Attempt to take n tokens from the bucket.
   * Uses external storage adapter for persistence.
   *
   * @param key - Rate limiting key
   * @param tokens - Number of tokens to take
   * @returns Promise resolving to true if tokens were available
   */
  async takeAsync(key: string, tokens: number): Promise<boolean> {
    if (tokens <= 0) {
      return false;
    }

    const sanitizedKey = this.sanitizeKey(key);

    // Fast path: use memory storage if no external storage
    if (!this.externalStorage) {
      return this.take(key, tokens);
    }

    try {
      const state = await this.getBucketAsync(sanitizedKey, this.externalStorage);
      const now = Date.now();
      const result = this.checkAndConsumeTokens(state, now, tokens);

      await this.withStorageTimeout(
        this.externalStorage.set(sanitizedKey, result.newState, this.config.storageTtlMs),
        'set'
      );

      if (!result.allowed) {
        this.onRateLimited(key);
      }

      return result.allowed;
    } catch (error) {
      return this.handleStorageError(error, key, 'takeAsync');
    }
  }

  /**
   * Wait until a token is available or the signal is aborted.
   * Uses external storage adapter for persistence.
   *
   * @param key - Rate limiting key
   * @param signal - Optional AbortSignal for cancellation
   * @throws {DOMException} When cancelled via signal (AbortError)
   */
  async waitAsync(key = '', signal?: AbortSignal): Promise<void> {
    this.throwIfAborted(signal);

    const sanitizedKey = this.sanitizeKey(key);

    // Fast path: use memory storage if no external storage
    if (!this.externalStorage) {
      return this.wait(key, signal);
    }

    let backoffMs = INITIAL_BACKOFF_MS;

    for (;;) {
      this.throwIfAborted(signal);

      try {
        const state = await this.getBucketAsync(sanitizedKey, this.externalStorage);
        const now = Date.now();
        const result = this.checkAndConsumeTokens(state, now, 1);

        await this.withStorageTimeout(
          this.externalStorage.set(sanitizedKey, result.newState, this.config.storageTtlMs),
          'set'
        );

        // Reset backoff on successful storage operation
        backoffMs = INITIAL_BACKOFF_MS;

        if (result.allowed) {
          return;
        }

        const waitDuration = this.calculateWaitTime(result.newState);
        await sleep(waitDuration, signal);
      } catch (error) {
        // Handle storage errors according to failure mode for consistency
        // For 'throw' mode, re-throw the error
        // For 'fail-open', allow the request (return without consuming)
        // For 'fail-closed', wait with exponential backoff to prevent thundering herd
        this.logger.error('Storage error in waitAsync', {
          key,
          error: error instanceof Error ? error.message : String(error),
          failureMode: this.config.storageFailureMode,
          backoffMs,
        });

        switch (this.config.storageFailureMode) {
          case 'fail-open':
            return; // Allow the request
          case 'fail-closed':
            // Exponential backoff to prevent thundering herd on storage failures
            await sleep(backoffMs, signal);
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
            continue;
          case 'throw':
            throw error;
          default: {
            const _exhaustive: never = this.config.storageFailureMode;
            return _exhaustive;
          }
        }
      }
    }
  }

  /**
   * Execute an operation if rate limit allows.
   * Uses external storage adapter for persistence.
   *
   * @param operation - The async operation to execute
   * @param key - Rate limiting key
   * @param signal - Optional AbortSignal for cancellation
   * @returns Promise resolving to the operation result
   * @throws {RateLimitExceededError} When rate limit is exceeded
   */
  async executeAsync<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    key = '',
    signal?: AbortSignal
  ): Promise<T> {
    this.throwIfAborted(signal);

    const allowed = await this.allowAsync(key);
    if (!allowed) {
      throw new RateLimitExceededError('Rate limit exceeded', key);
    }

    return operation(signal ?? RateLimiter.defaultSignal);
  }

  // ============================================================================
  // Utility methods
  // ============================================================================

  /**
   * Reset the rate limiter, clearing all buckets.
   * Clears both in-memory and external storage (if available).
   */
  reset(): void {
    this.memoryStorage.clearSync();

    if (this.externalStorage?.clear) {
      // Fire and forget - don't block on external storage clear
      this.externalStorage.clear().catch((error: unknown) => {
        this.logger.error('Failed to clear external storage', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    this.logger.info('Rate limiter reset');
  }

  /**
   * Reset the rate limiter asynchronously, waiting for external storage clear.
   */
  async resetAsync(): Promise<void> {
    this.memoryStorage.clearSync();

    if (this.externalStorage?.clear) {
      await this.externalStorage.clear();
    }

    this.logger.info('Rate limiter reset');
  }

  /**
   * Get the number of active buckets in memory.
   */
  bucketCount(): number {
    return this.memoryStorage.size();
  }

  /**
   * Get the total number of evictions from in-memory storage since creation.
   */
  getEvictionCount(): number {
    return this.memoryStorage.getEvictionCount();
  }

  /**
   * Check if external storage is configured.
   */
  hasExternalStorage(): boolean {
    return this.externalStorage !== undefined;
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  /**
   * Throw if the abort signal is already aborted.
   */
  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
  }

  /**
   * Sanitize storage key if configured.
   * Uses an LRU cache to avoid repeated regex operations for the same keys.
   */
  private sanitizeKey(key: string): string {
    if (!this.config.sanitizeKeys) {
      return key;
    }

    // Check cache first
    const cached = this.sanitizedKeyCache.get(key);
    if (cached !== undefined) {
      // LRU touch: move to end
      this.sanitizedKeyCache.delete(key);
      this.sanitizedKeyCache.set(key, cached);
      return cached;
    }

    // Sanitize and cache
    const sanitized = sanitizeStorageKey(key);

    // Evict oldest entry if cache is full
    if (this.sanitizedKeyCache.size >= SANITIZATION_CACHE_SIZE) {
      const firstKey = this.sanitizedKeyCache.keys().next().value;
      if (firstKey !== undefined) {
        this.sanitizedKeyCache.delete(firstKey);
      }
    }

    this.sanitizedKeyCache.set(key, sanitized);
    return sanitized;
  }

  /**
   * Handle storage errors according to configured failure mode.
   * @returns boolean for fail-open/fail-closed, never returns for throw mode
   */
  private handleStorageError(error: unknown, key: string, operation: string): boolean {
    this.logger.error(`Storage error in ${operation}`, {
      key,
      error: error instanceof Error ? error.message : String(error),
      failureMode: this.config.storageFailureMode,
      timestamp: Date.now(),
    });

    switch (this.config.storageFailureMode) {
      case 'fail-open':
        return true; // Allow the request
      case 'fail-closed':
        return false; // Deny the request
      case 'throw':
        throw error;
      default: {
        // Exhaustiveness check - ensures all cases are handled
        const _exhaustive: never = this.config.storageFailureMode;
        return _exhaustive;
      }
    }
  }

  /**
   * Get or create a bucket state synchronously (in-memory only).
   */
  private getBucketSync(key: string): BucketState {
    const state = this.memoryStorage.getSync(key);
    if (state) {
      return state;
    }

    // Create new bucket with full tokens
    return {
      tokens: this.config.burst,
      lastRefill: Date.now(),
    };
  }

  /**
   * Wrap a storage operation with a timeout.
   * Ensures timers are properly cleaned up to prevent memory leaks.
   */
  private async withStorageTimeout<T>(
    operation: Promise<T>,
    operationName: string
  ): Promise<T> {
    const timeoutMs = this.config.storageTimeoutMs;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            `Storage operation '${operationName}' timed out after ${String(timeoutMs)}ms`
          )
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation, timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Get or create a bucket state asynchronously from storage.
   * Validates data from external storage to prevent malicious or corrupted data.
   */
  private async getBucketAsync(
    key: string,
    storage: RateLimitStorage
  ): Promise<BucketState> {
    const state = await this.withStorageTimeout(storage.get(key), 'get');

    if (state) {
      // Validate data from untrusted external storage
      const validated = validateBucketState(state);
      if (!validated) {
        this.logger.warn('Invalid bucket state from storage, creating new bucket', {
          key,
          receivedState: state,
        });
        return this.createNewBucket();
      }

      // Sanity check: lastRefill shouldn't be too far in the future
      const now = Date.now();
      if (validated.lastRefill > now + MAX_CLOCK_SKEW_MS) {
        this.logger.warn('Bucket lastRefill is in future, resetting', {
          key,
          lastRefill: validated.lastRefill,
          now,
        });
        return this.createNewBucket();
      }

      // Normalize tokens to not exceed burst (in case of corrupted data)
      if (validated.tokens > this.config.burst) {
        return {
          tokens: this.config.burst,
          lastRefill: validated.lastRefill,
        };
      }

      return validated;
    }

    return this.createNewBucket();
  }

  /**
   * Create a new bucket with full tokens.
   */
  private createNewBucket(): BucketState {
    return {
      tokens: this.config.burst,
      lastRefill: Date.now(),
    };
  }

  /**
   * Check if tokens are available and consume them if so.
   * Returns the result and the new state (refilled, with tokens consumed if allowed).
   * This is the core rate limiting logic shared between sync and async methods.
   */
  private checkAndConsumeTokens(
    state: BucketState,
    now: number,
    tokensNeeded: number
  ): TokenCheckResult {
    const refilled = this.refill(state, now);

    if (refilled.tokens >= tokensNeeded) {
      return {
        allowed: true,
        newState: {
          tokens: refilled.tokens - tokensNeeded,
          lastRefill: refilled.lastRefill,
        },
      };
    }

    return {
      allowed: false,
      newState: refilled,
    };
  }

  /**
   * Refill tokens based on time elapsed since last refill.
   * Returns a new state object (immutable).
   */
  private refill(state: BucketState, now: number): BucketState {
    const elapsed = now - state.lastRefill;

    // Handle clock skew (negative elapsed time)
    if (elapsed <= 0) {
      return elapsed < 0 ? { tokens: state.tokens, lastRefill: now } : state;
    }

    // Cap elapsed time to prevent overflow from clock skew or system sleep
    const cappedElapsed = Math.min(elapsed, MAX_ELAPSED_MS);

    // Calculate tokens to add
    const tokensToAdd = cappedElapsed * this.tokensPerMs;
    const newTokens = Math.min(state.tokens + tokensToAdd, this.config.burst);

    return {
      tokens: newTokens,
      lastRefill: now,
    };
  }

  /**
   * Calculate wait time for at least 1 token to become available.
   */
  private calculateWaitTime(state: BucketState): number {
    if (state.tokens >= 1) {
      return 0;
    }

    const tokensNeeded = 1 - state.tokens;
    if (tokensNeeded <= 0 || this.tokensPerMs <= 0) {
      return this.tokensPerMs <= 0 ? MAX_WAIT_MS : 0;
    }

    const msToWait = tokensNeeded / this.tokensPerMs;
    return Math.min(Math.max(msToWait, 0), MAX_WAIT_MS);
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
