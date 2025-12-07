import { z } from 'zod';

/** Maximum reasonable token count (1 billion) */
const MAX_TOKENS = 1_000_000_000;

/** Maximum reasonable timestamp (year 2100 in ms) */
const MAX_TIMESTAMP = 4_102_444_800_000;

/**
 * Zod schema for validating bucket state from external storage.
 * Use this to validate data retrieved from untrusted storage sources.
 * Includes bounds checking to prevent malicious or corrupted data.
 */
export const bucketStateSchema = z.object({
  tokens: z.number().nonnegative().max(MAX_TOKENS),
  lastRefill: z.number().int().nonnegative().max(MAX_TIMESTAMP),
});

/**
 * State of a rate limit bucket for external storage.
 * Contains all data needed to reconstruct bucket state across invocations.
 */
export interface BucketState {
  /** Current number of tokens in the bucket */
  readonly tokens: number;
  /** Timestamp (ms since epoch) of last token refill */
  readonly lastRefill: number;
}

/**
 * Validates bucket state from external storage.
 * Returns the validated state or null if invalid.
 *
 * @param data - Raw data from storage
 * @returns Validated BucketState or null if invalid
 *
 * @example
 * ```typescript
 * const data = await redis.get(key);
 * const state = validateBucketState(JSON.parse(data));
 * if (state === null) {
 *   // Invalid data, treat as new bucket
 * }
 * ```
 */
export function validateBucketState(data: unknown): BucketState | null {
  const result = bucketStateSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Result of a compare-and-set operation.
 */
export interface CompareAndSetResult {
  /** Whether the update was successful */
  readonly success: boolean;
  /** The current state (after operation) */
  readonly currentState: BucketState | null;
}

/** Maximum key length after sanitization */
const MAX_KEY_LENGTH = 256;

/** Pre-compiled regex for control characters (for performance) */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\x00-\x1f\x7f]/g;

/** Pre-compiled regex for path separators (for performance) */
const PATH_SEPARATORS_REGEX = /[/\\]/g;

/**
 * Sanitizes a storage key to prevent injection attacks.
 * Removes or encodes potentially dangerous characters.
 *
 * Optimization: Truncates before regex processing to limit work on long strings.
 *
 * @param key - Raw key from user input
 * @returns Sanitized key safe for storage operations
 *
 * @example
 * ```typescript
 * const safeKey = sanitizeStorageKey(userProvidedKey);
 * await storage.get(safeKey);
 * ```
 */
export function sanitizeStorageKey(key: string): string {
  // Truncate first to limit regex work on long strings
  const truncated = key.length > MAX_KEY_LENGTH ? key.slice(0, MAX_KEY_LENGTH) : key;

  // Replace control characters, null bytes, and path separators
  // Keep alphanumeric, dash, underscore, dot, colon, at
  return truncated
    .replace(CONTROL_CHARS_REGEX, '') // Remove control characters
    .replace(PATH_SEPARATORS_REGEX, '_'); // Replace path separators
}

/**
 * Storage adapter interface for rate limiting.
 *
 * Implement this interface to persist rate limit state across serverless
 * invocations or distributed systems. The storage adapter enables rate
 * limiting in environments where in-memory state doesn't persist.
 *
 * ## Concurrency Warning
 *
 * **Important:** The basic get/set interface has inherent TOCTOU (time-of-check
 * to time-of-use) race conditions in distributed systems. Between reading the
 * bucket state and writing the updated state, another process may have modified
 * the bucket. This can result in rate limits being slightly over or under the
 * configured limit.
 *
 * For precise rate limiting in high-concurrency distributed environments,
 * implement the optional `compareAndSet` method with atomic operations:
 *
 * - **Redis**: Use Lua scripts with WATCH/MULTI/EXEC
 * - **DynamoDB**: Use conditional writes with version checks
 * - **Forge Storage**: Accepts eventual consistency
 *
 * For most use cases, the slight inaccuracy from race conditions is acceptable.
 * The rate limiter still provides effective protection against abuse.
 *
 * @example Redis implementation with atomic operations
 * ```typescript
 * const redisStorage: RateLimitStorage = {
 *   async get(key) {
 *     const data = await redis.get(`ratelimit:${key}`);
 *     if (!data) return null;
 *     return validateBucketState(JSON.parse(data));
 *   },
 *   async set(key, state, ttlMs) {
 *     const value = JSON.stringify(state);
 *     if (ttlMs) {
 *       await redis.set(`ratelimit:${key}`, value, 'PX', ttlMs);
 *     } else {
 *       await redis.set(`ratelimit:${key}`, value);
 *     }
 *   },
 *   async compareAndSet(key, expected, newState, ttlMs) {
 *     // Use Lua script for atomic compare-and-set
 *     const script = `
 *       local current = redis.call('GET', KEYS[1])
 *       if current == ARGV[1] or (current == false and ARGV[1] == 'null') then
 *         if ARGV[3] then
 *           redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
 *         else
 *           redis.call('SET', KEYS[1], ARGV[2])
 *         end
 *         return {1, ARGV[2]}
 *       end
 *       return {0, current or 'null'}
 *     `;
 *     const expectedStr = expected ? JSON.stringify(expected) : 'null';
 *     const [success, currentStr] = await redis.eval(script, 1,
 *       `ratelimit:${key}`, expectedStr, JSON.stringify(newState), ttlMs?.toString()
 *     );
 *     return {
 *       success: success === 1,
 *       currentState: currentStr === 'null' ? null : validateBucketState(JSON.parse(currentStr))
 *     };
 *   },
 *   async delete(key) {
 *     await redis.del(`ratelimit:${key}`);
 *   },
 *   async clear() {
 *     const keys = await redis.keys('ratelimit:*');
 *     if (keys.length > 0) {
 *       await redis.del(...keys);
 *     }
 *   }
 * };
 * ```
 *
 * @example Forge Storage implementation (accepts eventual consistency)
 * ```typescript
 * import { storage } from '@forge/api';
 *
 * const forgeStorage: RateLimitStorage = {
 *   async get(key) {
 *     const data = await storage.get(`ratelimit:${key}`);
 *     return validateBucketState(data);
 *   },
 *   async set(key, state) {
 *     await storage.set(`ratelimit:${key}`, state);
 *   },
 *   async delete(key) {
 *     await storage.delete(`ratelimit:${key}`);
 *   }
 * };
 * ```
 */
export interface RateLimitStorage {
  /**
   * Retrieve bucket state for a key.
   *
   * @param key - The rate limiting key (already sanitized)
   * @returns The bucket state, or null if not found
   */
  get(key: string): Promise<BucketState | null>;

  /**
   * Store bucket state for a key.
   *
   * @param key - The rate limiting key (already sanitized)
   * @param state - The bucket state to store
   * @param ttlMs - Optional TTL in milliseconds for automatic cleanup.
   *                Recommended: set to interval * (burst / rate) * 2 to auto-expire
   *                stale buckets while keeping active ones alive.
   */
  set(key: string, state: BucketState, ttlMs?: number): Promise<void>;

  /**
   * Atomically compare and set bucket state.
   * Optional - implement for precise rate limiting in distributed systems.
   *
   * This method should atomically:
   * 1. Check if the current state matches `expected`
   * 2. If it matches, update to `newState` and return success
   * 3. If it doesn't match, return failure with the current state
   *
   * @param key - The rate limiting key (already sanitized)
   * @param expected - The expected current state (null if expecting no entry)
   * @param newState - The new state to set if expected matches
   * @param ttlMs - Optional TTL in milliseconds
   * @returns Result indicating success and current state
   */
  compareAndSet?(
    key: string,
    expected: BucketState | null,
    newState: BucketState,
    ttlMs?: number
  ): Promise<CompareAndSetResult>;

  /**
   * Delete bucket state for a key.
   * Optional - if not implemented, reset operations on individual keys
   * will not be supported.
   *
   * @param key - The rate limiting key (already sanitized)
   */
  delete?(key: string): Promise<void>;

  /**
   * Clear all bucket states.
   * Optional - if not implemented, full reset operations will not clear storage.
   */
  clear?(): Promise<void>;
}

/**
 * In-memory storage implementation using Map.
 * This is the default storage used when no external storage is provided.
 *
 * Features:
 * - LRU eviction when maxEntries is exceeded
 * - Synchronous operations (async interface for compatibility)
 * - No persistence across process restarts
 * - No race conditions (single-threaded JavaScript)
 *
 * @example
 * ```typescript
 * const storage = new MemoryStorage({ maxEntries: 10000 });
 * const limiter = new RateLimiter({ rate: 100, storage });
 * ```
 */
export class MemoryStorage implements RateLimitStorage {
  /** Cached resolved promise for void returns to avoid allocation */
  private static readonly RESOLVED_VOID = Promise.resolve();

  /** Cached resolved promise for null returns to avoid allocation */
  private static readonly RESOLVED_NULL: Promise<BucketState | null> = Promise.resolve(null);

  private readonly entries = new Map<string, BucketState>();
  private readonly maxEntries: number;
  private evictionCount = 0;

  /**
   * Create a new in-memory storage.
   *
   * @param options - Storage options
   * @param options.maxEntries - Maximum entries before LRU eviction (0 = unlimited, default: 10000)
   */
  constructor(options?: { readonly maxEntries?: number }) {
    this.maxEntries = options?.maxEntries ?? 10000;
  }

  get(key: string): Promise<BucketState | null> {
    const state = this.getSync(key);
    return state === null ? MemoryStorage.RESOLVED_NULL : Promise.resolve(state);
  }

  set(key: string, state: BucketState): Promise<void> {
    this.setSync(key, state);
    return MemoryStorage.RESOLVED_VOID;
  }

  compareAndSet(
    key: string,
    expected: BucketState | null,
    newState: BucketState
  ): Promise<CompareAndSetResult> {
    const current = this.entries.get(key) ?? null;

    // Check if current matches expected
    const matches =
      current === expected ||
      (current !== null &&
        expected !== null &&
        current.tokens === expected.tokens &&
        current.lastRefill === expected.lastRefill);

    if (matches) {
      this.setSync(key, newState);
      return Promise.resolve({ success: true, currentState: newState });
    }

    return Promise.resolve({ success: false, currentState: current });
  }

  delete(key: string): Promise<void> {
    this.deleteSync(key);
    return MemoryStorage.RESOLVED_VOID;
  }

  clear(): Promise<void> {
    this.clearSync();
    return MemoryStorage.RESOLVED_VOID;
  }

  /**
   * Get the current number of entries.
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * Get the total number of evictions since creation.
   */
  getEvictionCount(): number {
    return this.evictionCount;
  }

  /**
   * Synchronous get for backward compatibility with sync rate limiter methods.
   * @internal
   */
  getSync(key: string): BucketState | null {
    const state = this.entries.get(key);
    if (state) {
      // LRU touch: move to end
      this.entries.delete(key);
      this.entries.set(key, state);
    }
    return state ?? null;
  }

  /**
   * Synchronous set for backward compatibility with sync rate limiter methods.
   * @internal
   */
  setSync(key: string, state: BucketState): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.maxEntries > 0 && this.entries.size >= this.maxEntries) {
      const firstKey = this.entries.keys().next().value;
      if (firstKey !== undefined) {
        this.entries.delete(firstKey);
        this.evictionCount++;
      }
    }
    this.entries.set(key, state);
  }

  /**
   * Synchronous delete for backward compatibility.
   * @internal
   */
  deleteSync(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Synchronous clear for backward compatibility.
   * @internal
   */
  clearSync(): void {
    this.entries.clear();
  }
}
