/**
 * Context passed to metrics callbacks.
 * Contains information about the rate limiting decision.
 */
export interface MetricsContext {
  /** The rate limiting key (e.g., user ID, IP address) */
  readonly key: string;
  /** Number of tokens requested */
  readonly tokens: number;
  /** Current token count in the bucket after the operation */
  readonly currentTokens: number;
  /** Burst capacity of the bucket */
  readonly burst: number;
  /** Whether this was an async (external storage) operation */
  readonly isAsync: boolean;
}

/**
 * Context passed to storage latency callback.
 */
export interface StorageLatencyContext {
  /** The storage operation that was performed */
  readonly operation: 'get' | 'set' | 'delete' | 'clear' | 'compareAndSet';
  /** The rate limiting key (if applicable) */
  readonly key: string | undefined;
  /** Duration of the operation in milliseconds */
  readonly durationMs: number;
  /** Whether the operation succeeded */
  readonly success: boolean;
  /** Error if the operation failed */
  readonly error: Error | undefined;
}

/**
 * Metrics interface for observing rate limiter behavior.
 * Implement this interface to collect metrics about rate limiting decisions
 * and storage operations. All callbacks are optional.
 *
 * @example
 * ```typescript
 * const metrics: RateLimiterMetrics = {
 *   onAllow: (ctx) => {
 *     prometheus.counter('rate_limit_allowed_total').inc({ key: ctx.key });
 *   },
 *   onDeny: (ctx) => {
 *     prometheus.counter('rate_limit_denied_total').inc({ key: ctx.key });
 *   },
 *   onError: (err, ctx) => {
 *     prometheus.counter('rate_limit_errors_total').inc({ type: err.name });
 *   },
 *   onStorageLatency: (ctx) => {
 *     prometheus.histogram('rate_limit_storage_duration_ms').observe(
 *       { operation: ctx.operation },
 *       ctx.durationMs
 *     );
 *   }
 * };
 *
 * const limiter = new RateLimiter({
 *   rate: 100,
 *   metrics
 * });
 * ```
 */
export interface RateLimiterMetrics {
  /**
   * Called when a request is allowed.
   * @param context - Information about the allowed request
   */
  onAllow?(context: MetricsContext): void;

  /**
   * Called when a request is denied (rate limited).
   * @param context - Information about the denied request
   */
  onDeny?(context: MetricsContext): void;

  /**
   * Called when an error occurs during rate limiting.
   * This includes storage errors and validation errors.
   * @param error - The error that occurred
   * @param context - Optional context if available
   */
  onError?(error: Error, context?: Partial<MetricsContext>): void;

  /**
   * Called after each storage operation with latency information.
   * Use this to track storage performance and detect issues.
   * @param context - Information about the storage operation
   */
  onStorageLatency?(context: StorageLatencyContext): void;
}

/**
 * No-op metrics implementation.
 * Use this as a default when no metrics collection is needed.
 */
export const noopMetrics: RateLimiterMetrics = Object.freeze({});
