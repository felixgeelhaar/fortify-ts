# @fortify-ts/retry

## 0.2.0

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

### Patch Changes

- Updated dependencies
  - @fortify-ts/core@0.3.0

## 0.1.5

### Patch Changes

- Updated dependencies [f45e66f]
  - @fortify-ts/core@0.2.0
