import { describe, it, expect } from 'vitest';
import {
  FortifyError,
  CircuitOpenError,
  RateLimitExceededError,
  BulkheadFullError,
  TimeoutError,
  MaxAttemptsReachedError,
  RetryableErrorWrapper,
  asRetryable,
  asNonRetryable,
  isRetryable,
  isRetryableError,
} from '../src/errors.js';

describe('FortifyError', () => {
  it('should create error with message', () => {
    const error = new FortifyError('test message');
    expect(error.message).toBe('test message');
    expect(error.name).toBe('FortifyError');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(FortifyError);
  });
});

describe('CircuitOpenError', () => {
  it('should create with default message', () => {
    const error = new CircuitOpenError();
    expect(error.message).toBe('Circuit breaker is open');
    expect(error.name).toBe('CircuitOpenError');
  });

  it('should create with custom message', () => {
    const error = new CircuitOpenError('custom message');
    expect(error.message).toBe('custom message');
  });
});

describe('RateLimitExceededError', () => {
  it('should create with default message', () => {
    const error = new RateLimitExceededError();
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.key).toBeUndefined();
  });

  it('should create with key', () => {
    const error = new RateLimitExceededError('Rate limit exceeded', 'user-123');
    expect(error.key).toBe('user-123');
  });
});

describe('BulkheadFullError', () => {
  it('should create with default values', () => {
    const error = new BulkheadFullError();
    expect(error.message).toBe('Bulkhead is full');
    expect(error.activeCount).toBe(0);
    expect(error.queuedCount).toBe(0);
  });

  it('should create with counts', () => {
    const error = new BulkheadFullError('Bulkhead is full', 10, 5);
    expect(error.activeCount).toBe(10);
    expect(error.queuedCount).toBe(5);
  });
});

describe('TimeoutError', () => {
  it('should create with default values', () => {
    const error = new TimeoutError();
    expect(error.message).toBe('Operation timed out');
    expect(error.timeoutMs).toBe(0);
  });

  it('should create with timeout', () => {
    const error = new TimeoutError('Timeout after 5s', 5000);
    expect(error.timeoutMs).toBe(5000);
  });
});

describe('MaxAttemptsReachedError', () => {
  it('should create with default values', () => {
    const error = new MaxAttemptsReachedError();
    expect(error.message).toBe('Maximum retry attempts reached');
    expect(error.attempts).toBe(0);
    expect(error.lastError).toBeUndefined();
  });

  it('should create with attempts and last error', () => {
    const lastError = new Error('last error');
    const error = new MaxAttemptsReachedError('Max attempts', 3, lastError);
    expect(error.attempts).toBe(3);
    expect(error.lastError).toBe(lastError);
  });
});

describe('RetryableErrorWrapper', () => {
  it('should wrap error as retryable', () => {
    const original = new Error('original');
    const wrapped = new RetryableErrorWrapper(original, true);
    expect(wrapped.retryable).toBe(true);
    expect(wrapped.cause).toBe(original);
    expect(wrapped.message).toBe('original');
  });

  it('should wrap error as non-retryable', () => {
    const original = new Error('original');
    const wrapped = new RetryableErrorWrapper(original, false);
    expect(wrapped.retryable).toBe(false);
  });
});

describe('asRetryable', () => {
  it('should create retryable wrapper', () => {
    const error = new Error('test');
    const wrapped = asRetryable(error);
    expect(wrapped.retryable).toBe(true);
  });

  it('should allow specifying retryable as false', () => {
    const error = new Error('test');
    const wrapped = asRetryable(error, false);
    expect(wrapped.retryable).toBe(false);
  });
});

describe('asNonRetryable', () => {
  it('should create non-retryable wrapper', () => {
    const error = new Error('test');
    const wrapped = asNonRetryable(error);
    expect(wrapped.retryable).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('should return true for RetryableErrorWrapper', () => {
    const error = asRetryable(new Error('test'));
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return false for regular errors', () => {
    const error = new Error('test');
    expect(isRetryableError(error)).toBe(false);
  });

  it('should return false for non-errors', () => {
    expect(isRetryableError('string')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe('isRetryable', () => {
  it('should return true for retryable errors', () => {
    const error = asRetryable(new Error('test'));
    expect(isRetryable(error)).toBe(true);
  });

  it('should return false for non-retryable errors', () => {
    const error = asNonRetryable(new Error('test'));
    expect(isRetryable(error)).toBe(false);
  });

  it('should return undefined for regular errors', () => {
    const error = new Error('test');
    expect(isRetryable(error)).toBeUndefined();
  });
});
