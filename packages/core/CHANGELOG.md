# @fortify-ts/core

## 0.3.0

### Minor Changes

- ## Comprehensive Resilience Library Improvements

  ### Security & Validation
  - Add upper bounds on all config values to prevent DoS attacks
  - Add Zod schema validation for runtime type safety
  - RateLimitExceededError.toJSON() excludes sensitive keys by default
  - Safe callback execution with try-catch wrappers

  ### Error Handling
  - Add toJSON() to FortifyError base class for structured logging
  - Non-Error throws are now wrapped for consistent error handling
  - Add BulkheadClosedError for closed state distinction
  - Add JitterMode type ('full', 'equal', 'decorrelated')

  ### Performance
  - NEVER_ABORTED_SIGNAL optimization avoids allocations in hot paths
  - Optimized middleware chain execution
  - Add length getter and isEmpty() to Chain class

  ### Testing
  - 823 tests across all packages
  - Property-based tests with fast-check
  - Improved branch coverage across packages

  ### Configuration Changes
  - Retry: jitter now defaults to true
  - CircuitBreaker: timeoutJitter now defaults to 0.1
  - New equal jitter mode (50-100% of delay)

## 0.2.0

### Minor Changes

- f45e66f: feat(rate-limit): add storage adapter support for distributed rate limiting

  ### New Features
  - **External Storage Support**: Add `RateLimitStorage` interface for persisting rate limit state to Redis, DynamoDB, Forge Storage, or other backends
  - **MemoryStorage**: Built-in in-memory storage with LRU eviction and `compareAndSet` for atomic operations
  - **Async Methods**: New `allowAsync`, `takeAsync`, `waitAsync`, and `executeAsync` methods for external storage
  - **Storage Failure Modes**: Configure behavior on storage failures (`fail-open`, `fail-closed`, `throw`)
  - **BucketState Validation**: Zod schema for validating bucket state from untrusted storage

  ### Performance Improvements
  - Exponential backoff in `waitAsync` fail-closed mode to prevent thundering herd
  - LRU cache for sanitized storage keys to avoid repeated regex operations
  - Cached fulfilled promises in MemoryStorage to reduce allocation overhead
  - Pre-compiled regex patterns for key sanitization

  ### Bug Fixes
  - Include rate limit key in `RateLimitExceededError` for better debugging

  ### Testing
  - Added comprehensive tests for zero config defaults, concurrent operations, clock skew handling, and storage failure scenarios
