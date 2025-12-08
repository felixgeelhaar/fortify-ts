import { describe, it, expect } from 'vitest';
import {
  loggerSchema,
  timeoutConfigSchema,
  backoffPolicySchema,
  retryConfigSchema,
  circuitBreakerStateSchema,
  circuitBreakerCountsSchema,
  circuitBreakerConfigSchema,
  rateLimitConfigSchema,
  bulkheadConfigSchema,
  fallbackConfigSchema,
} from '../src/schemas.js';

describe('loggerSchema', () => {
  it('should accept valid logger object', () => {
    const logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    const result = loggerSchema.safeParse(logger);
    expect(result.success).toBe(true);
  });

  it('should accept undefined', () => {
    const result = loggerSchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it('should reject logger missing required methods', () => {
    const invalidLogger = {
      debug: () => {},
      info: () => {},
      // missing warn and error
    };
    const result = loggerSchema.safeParse(invalidLogger);
    expect(result.success).toBe(false);
  });

  it('should reject non-function values for logger methods', () => {
    const invalidLogger = {
      debug: 'not a function',
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    const result = loggerSchema.safeParse(invalidLogger);
    expect(result.success).toBe(false);
  });
});

describe('timeoutConfigSchema', () => {
  it('should apply default timeout', () => {
    const result = timeoutConfigSchema.parse({});
    expect(result.defaultTimeout).toBe(30000);
  });

  it('should accept custom timeout', () => {
    const result = timeoutConfigSchema.parse({ defaultTimeout: 5000 });
    expect(result.defaultTimeout).toBe(5000);
  });

  it('should reject negative timeout', () => {
    const result = timeoutConfigSchema.safeParse({ defaultTimeout: -1 });
    expect(result.success).toBe(false);
  });

  it('should reject zero timeout', () => {
    const result = timeoutConfigSchema.safeParse({ defaultTimeout: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer timeout', () => {
    const result = timeoutConfigSchema.safeParse({ defaultTimeout: 1.5 });
    expect(result.success).toBe(false);
  });

  it('should accept onTimeout callback', () => {
    const result = timeoutConfigSchema.parse({
      onTimeout: () => {},
    });
    expect(result.onTimeout).toBeTypeOf('function');
  });
});

describe('backoffPolicySchema', () => {
  it('should accept exponential', () => {
    const result = backoffPolicySchema.parse('exponential');
    expect(result).toBe('exponential');
  });

  it('should accept linear', () => {
    const result = backoffPolicySchema.parse('linear');
    expect(result).toBe('linear');
  });

  it('should accept constant', () => {
    const result = backoffPolicySchema.parse('constant');
    expect(result).toBe('constant');
  });

  it('should reject invalid policy', () => {
    const result = backoffPolicySchema.safeParse('invalid');
    expect(result.success).toBe(false);
  });
});

describe('retryConfigSchema', () => {
  it('should apply all defaults', () => {
    const result = retryConfigSchema.parse({});
    expect(result.maxAttempts).toBe(3);
    expect(result.initialDelay).toBe(100);
    expect(result.backoffPolicy).toBe('exponential');
    expect(result.multiplier).toBe(2.0);
    expect(result.jitter).toBe(false);
  });

  it('should accept custom values', () => {
    const result = retryConfigSchema.parse({
      maxAttempts: 5,
      initialDelay: 200,
      maxDelay: 10000,
      backoffPolicy: 'linear',
      multiplier: 1.5,
      jitter: true,
    });
    expect(result.maxAttempts).toBe(5);
    expect(result.initialDelay).toBe(200);
    expect(result.maxDelay).toBe(10000);
    expect(result.backoffPolicy).toBe('linear');
    expect(result.multiplier).toBe(1.5);
    expect(result.jitter).toBe(true);
  });

  it('should reject zero maxAttempts', () => {
    const result = retryConfigSchema.safeParse({ maxAttempts: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject negative initialDelay', () => {
    const result = retryConfigSchema.safeParse({ initialDelay: -100 });
    expect(result.success).toBe(false);
  });

  it('should accept isRetryable callback', () => {
    const result = retryConfigSchema.parse({
      isRetryable: () => true,
    });
    expect(result.isRetryable).toBeTypeOf('function');
  });

  it('should accept onRetry callback', () => {
    const result = retryConfigSchema.parse({
      onRetry: () => {},
    });
    expect(result.onRetry).toBeTypeOf('function');
  });
});

describe('circuitBreakerStateSchema', () => {
  it('should accept closed', () => {
    expect(circuitBreakerStateSchema.parse('closed')).toBe('closed');
  });

  it('should accept open', () => {
    expect(circuitBreakerStateSchema.parse('open')).toBe('open');
  });

  it('should accept half-open', () => {
    expect(circuitBreakerStateSchema.parse('half-open')).toBe('half-open');
  });

  it('should reject invalid state', () => {
    const result = circuitBreakerStateSchema.safeParse('invalid');
    expect(result.success).toBe(false);
  });
});

describe('circuitBreakerCountsSchema', () => {
  it('should accept valid counts', () => {
    const counts = {
      requests: 100,
      totalSuccesses: 90,
      totalFailures: 10,
      consecutiveSuccesses: 5,
      consecutiveFailures: 0,
    };
    const result = circuitBreakerCountsSchema.parse(counts);
    expect(result).toEqual(counts);
  });

  it('should reject negative counts', () => {
    const counts = {
      requests: -1,
      totalSuccesses: 0,
      totalFailures: 0,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
    };
    const result = circuitBreakerCountsSchema.safeParse(counts);
    expect(result.success).toBe(false);
  });

  it('should reject non-integer counts', () => {
    const counts = {
      requests: 1.5,
      totalSuccesses: 0,
      totalFailures: 0,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
    };
    const result = circuitBreakerCountsSchema.safeParse(counts);
    expect(result.success).toBe(false);
  });
});

describe('circuitBreakerConfigSchema', () => {
  it('should apply all defaults', () => {
    const result = circuitBreakerConfigSchema.parse({});
    expect(result.maxFailures).toBe(5);
    expect(result.timeout).toBe(60000);
    expect(result.halfOpenMaxRequests).toBe(1);
    expect(result.interval).toBe(0);
  });

  it('should accept custom values', () => {
    const result = circuitBreakerConfigSchema.parse({
      maxFailures: 10,
      timeout: 30000,
      halfOpenMaxRequests: 3,
      interval: 5000,
    });
    expect(result.maxFailures).toBe(10);
    expect(result.timeout).toBe(30000);
    expect(result.halfOpenMaxRequests).toBe(3);
    expect(result.interval).toBe(5000);
  });

  it('should reject zero maxFailures', () => {
    const result = circuitBreakerConfigSchema.safeParse({ maxFailures: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject negative timeout', () => {
    const result = circuitBreakerConfigSchema.safeParse({ timeout: -1 });
    expect(result.success).toBe(false);
  });

  it('should accept zero interval (disabled)', () => {
    const result = circuitBreakerConfigSchema.parse({ interval: 0 });
    expect(result.interval).toBe(0);
  });

  it('should accept readyToTrip callback', () => {
    const result = circuitBreakerConfigSchema.parse({
      readyToTrip: () => true,
    });
    expect(result.readyToTrip).toBeTypeOf('function');
  });

  it('should accept isSuccessful callback', () => {
    const result = circuitBreakerConfigSchema.parse({
      isSuccessful: () => true,
    });
    expect(result.isSuccessful).toBeTypeOf('function');
  });

  it('should accept onStateChange callback', () => {
    const result = circuitBreakerConfigSchema.parse({
      onStateChange: () => {},
    });
    expect(result.onStateChange).toBeTypeOf('function');
  });
});

describe('rateLimitConfigSchema', () => {
  it('should apply all defaults', () => {
    const result = rateLimitConfigSchema.parse({});
    expect(result.rate).toBe(100);
    expect(result.interval).toBe(1000);
    expect(result.burst).toBeUndefined();
  });

  it('should accept custom values', () => {
    const result = rateLimitConfigSchema.parse({
      rate: 50,
      burst: 100,
      interval: 2000,
    });
    expect(result.rate).toBe(50);
    expect(result.burst).toBe(100);
    expect(result.interval).toBe(2000);
  });

  it('should reject zero rate', () => {
    const result = rateLimitConfigSchema.safeParse({ rate: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject negative interval', () => {
    const result = rateLimitConfigSchema.safeParse({ interval: -1 });
    expect(result.success).toBe(false);
  });

  it('should accept onLimit callback', () => {
    const result = rateLimitConfigSchema.parse({
      onLimit: () => {},
    });
    expect(result.onLimit).toBeTypeOf('function');
  });
});

describe('bulkheadConfigSchema', () => {
  it('should apply all defaults', () => {
    const result = bulkheadConfigSchema.parse({});
    expect(result.maxConcurrent).toBe(10);
    expect(result.maxQueue).toBe(0);
    expect(result.queueTimeout).toBeUndefined();
  });

  it('should accept custom values', () => {
    const result = bulkheadConfigSchema.parse({
      maxConcurrent: 5,
      maxQueue: 10,
      queueTimeout: 5000,
    });
    expect(result.maxConcurrent).toBe(5);
    expect(result.maxQueue).toBe(10);
    expect(result.queueTimeout).toBe(5000);
  });

  it('should reject zero maxConcurrent', () => {
    const result = bulkheadConfigSchema.safeParse({ maxConcurrent: 0 });
    expect(result.success).toBe(false);
  });

  it('should accept zero maxQueue (no queueing)', () => {
    const result = bulkheadConfigSchema.parse({ maxQueue: 0 });
    expect(result.maxQueue).toBe(0);
  });

  it('should reject negative maxQueue', () => {
    const result = bulkheadConfigSchema.safeParse({ maxQueue: -1 });
    expect(result.success).toBe(false);
  });

  it('should accept onRejected callback', () => {
    const result = bulkheadConfigSchema.parse({
      onRejected: () => {},
    });
    expect(result.onRejected).toBeTypeOf('function');
  });
});

describe('fallbackConfigSchema', () => {
  it('should require fallback function', () => {
    const result = fallbackConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept valid config with fallback', () => {
    const result = fallbackConfigSchema.parse({
      fallback: () => 'fallback value',
    });
    expect(result.fallback).toBeTypeOf('function');
  });

  it('should accept shouldFallback callback', () => {
    const result = fallbackConfigSchema.parse({
      fallback: () => 'fallback',
      shouldFallback: () => true,
    });
    expect(result.shouldFallback).toBeTypeOf('function');
  });

  it('should accept onFallback callback', () => {
    const result = fallbackConfigSchema.parse({
      fallback: () => 'fallback',
      onFallback: () => {},
    });
    expect(result.onFallback).toBeTypeOf('function');
  });

  it('should accept onSuccess callback', () => {
    const result = fallbackConfigSchema.parse({
      fallback: () => 'fallback',
      onSuccess: () => {},
    });
    expect(result.onSuccess).toBeTypeOf('function');
  });

  it('should reject non-function fallback', () => {
    const result = fallbackConfigSchema.safeParse({
      fallback: 'not a function',
    });
    expect(result.success).toBe(false);
  });
});
