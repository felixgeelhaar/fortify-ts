// Errors
export {
  FortifyError,
  CircuitOpenError,
  RateLimitExceededError,
  BulkheadFullError,
  BulkheadClosedError,
  TimeoutError,
  MaxAttemptsReachedError,
  RetryableErrorWrapper,
  asRetryable,
  asNonRetryable,
  isRetryable,
  isRetryableError,
  type RetryableError,
} from './errors.js';

// Types
export {
  type Operation,
  type StateChangeCallback,
  type ErrorCallback,
  type VoidCallback,
  type RetryCallback,
  type RateLimitCallback,
  type FortifyLogger,
  type Pattern,
  type Closeable,
  type Resettable,
  noopLogger,
  consoleLogger,
} from './types.js';

// Utilities
export {
  sleep,
  withTimeout,
  executeWithTimeout,
  combineSignals,
  isAbortError,
  throwIfAborted,
  safeCallback,
  addJitter,
  clamp,
  now,
} from './utils.js';

// Schemas
export {
  loggerSchema,
  timeoutConfigSchema,
  type TimeoutConfig,
  backoffPolicySchema,
  type BackoffPolicy,
  retryConfigSchema,
  type RetryConfig,
  circuitBreakerStateSchema,
  type CircuitBreakerState,
  circuitBreakerCountsSchema,
  type CircuitBreakerCounts,
  circuitBreakerConfigSchema,
  type CircuitBreakerConfig,
  rateLimitConfigSchema,
  type RateLimitConfig,
  bulkheadConfigSchema,
  type BulkheadConfig,
  fallbackConfigSchema,
  type FallbackConfig,
} from './schemas.js';

// Storage
export {
  bucketStateSchema,
  type BucketState,
  validateBucketState,
  type CompareAndSetResult,
  sanitizeStorageKey,
  type RateLimitStorage,
  MemoryStorage,
} from './storage.js';
