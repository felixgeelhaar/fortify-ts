import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  type Span,
  type Tracer,
  SpanKind,
  SpanStatusCode,
  FORTIFY_ATTRIBUTES,
  traceOperation,
  createCircuitBreakerTracer,
  createRetryTracer,
  createRateLimitTracer,
  createTimeoutTracer,
  createBulkheadTracer,
  createFallbackTracer,
} from '../src/index.js';

function createMockSpan(): Span {
  return {
    setAttribute: vi.fn().mockReturnThis(),
    setAttributes: vi.fn().mockReturnThis(),
    setStatus: vi.fn().mockReturnThis(),
    recordException: vi.fn(),
    end: vi.fn(),
    isRecording: vi.fn().mockReturnValue(true),
  };
}

function createMockTracer(): Tracer & { mockSpan: Span } {
  const mockSpan = createMockSpan();
  return {
    mockSpan,
    startSpan: vi.fn().mockReturnValue(mockSpan),
  };
}

describe('traceOperation', () => {
  let tracer: ReturnType<typeof createMockTracer>;

  beforeEach(() => {
    tracer = createMockTracer();
  });

  it('should create a span for successful operations', async () => {
    const operation = vi.fn().mockResolvedValue('result');

    const traced = traceOperation(operation, {
      tracer,
      spanName: 'test-span',
    });

    const result = await traced();

    expect(result).toBe('result');
    expect(tracer.startSpan).toHaveBeenCalledWith('test-span', {
      kind: SpanKind.INTERNAL,
      attributes: undefined,
    });
    expect(tracer.mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.OK,
    });
    expect(tracer.mockSpan.end).toHaveBeenCalled();
  });

  it('should record exceptions for failed operations', async () => {
    const error = new Error('test error');
    const operation = vi.fn().mockRejectedValue(error);

    const traced = traceOperation(operation, {
      tracer,
      spanName: 'test-span',
    });

    await expect(traced()).rejects.toThrow('test error');

    expect(tracer.mockSpan.recordException).toHaveBeenCalledWith(error);
    expect(tracer.mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'test error',
    });
    expect(tracer.mockSpan.end).toHaveBeenCalled();
  });

  it('should pass span kind and attributes', async () => {
    const operation = vi.fn().mockResolvedValue('result');

    const traced = traceOperation(operation, {
      tracer,
      spanName: 'test-span',
      spanKind: SpanKind.CLIENT,
      attributes: { 'custom.attr': 'value' },
    });

    await traced();

    expect(tracer.startSpan).toHaveBeenCalledWith('test-span', {
      kind: SpanKind.CLIENT,
      attributes: { 'custom.attr': 'value' },
    });
  });

  it('should call onSuccess callback', async () => {
    const operation = vi.fn().mockResolvedValue('result');
    const onSuccess = vi.fn();

    const traced = traceOperation(operation, {
      tracer,
      spanName: 'test-span',
      onSuccess,
    });

    await traced();

    expect(onSuccess).toHaveBeenCalledWith(tracer.mockSpan, 'result');
  });

  it('should call onError callback', async () => {
    const error = new Error('test error');
    const operation = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    const traced = traceOperation(operation, {
      tracer,
      spanName: 'test-span',
      onError,
    });

    await expect(traced()).rejects.toThrow();

    expect(onError).toHaveBeenCalledWith(tracer.mockSpan, error);
  });

  it('should pass abort signal to operation', async () => {
    const operation = vi.fn().mockResolvedValue('result');
    const signal = new AbortController().signal;

    const traced = traceOperation(operation, {
      tracer,
      spanName: 'test-span',
    });

    await traced(signal);

    expect(operation).toHaveBeenCalledWith(signal);
  });
});

describe('createCircuitBreakerTracer', () => {
  it('should create traced operation with circuit breaker attributes', async () => {
    const tracer = createMockTracer();
    const traceCircuitBreaker = createCircuitBreakerTracer(tracer, 'api-breaker');
    const operation = vi.fn().mockResolvedValue('result');

    const traced = traceCircuitBreaker(operation, 'closed', {
      failures: 0,
      successes: 5,
    });

    await traced();

    expect(tracer.startSpan).toHaveBeenCalledWith(
      'fortify.circuit_breaker.api-breaker',
      expect.objectContaining({
        attributes: expect.objectContaining({
          [FORTIFY_ATTRIBUTES.PATTERN]: 'circuit-breaker',
          [FORTIFY_ATTRIBUTES.NAME]: 'api-breaker',
          [FORTIFY_ATTRIBUTES.CB_STATE]: 'closed',
          [FORTIFY_ATTRIBUTES.CB_FAILURE_COUNT]: 0,
          [FORTIFY_ATTRIBUTES.CB_SUCCESS_COUNT]: 5,
        }),
      })
    );
  });

  it('should use custom prefix', async () => {
    const tracer = createMockTracer();
    const traceCircuitBreaker = createCircuitBreakerTracer(
      tracer,
      'api-breaker',
      'myapp'
    );
    const operation = vi.fn().mockResolvedValue('result');

    const traced = traceCircuitBreaker(operation, 'open');
    await traced();

    expect(tracer.startSpan).toHaveBeenCalledWith(
      'myapp.circuit_breaker.api-breaker',
      expect.anything()
    );
  });
});

describe('createRetryTracer', () => {
  it('should create traced operation with retry attributes', async () => {
    const tracer = createMockTracer();
    const traceRetry = createRetryTracer(tracer, 'api-retry');
    const operation = vi.fn().mockResolvedValue('result');

    const traced = traceRetry(operation, 2, 3, 100);
    await traced();

    expect(tracer.startSpan).toHaveBeenCalledWith(
      'fortify.retry.api-retry',
      expect.objectContaining({
        attributes: expect.objectContaining({
          [FORTIFY_ATTRIBUTES.PATTERN]: 'retry',
          [FORTIFY_ATTRIBUTES.NAME]: 'api-retry',
          [FORTIFY_ATTRIBUTES.RETRY_ATTEMPT]: 2,
          [FORTIFY_ATTRIBUTES.RETRY_MAX_ATTEMPTS]: 3,
          [FORTIFY_ATTRIBUTES.RETRY_DELAY_MS]: 100,
        }),
      })
    );
  });
});

describe('createRateLimitTracer', () => {
  it('should create traced operation with rate limit attributes', async () => {
    const tracer = createMockTracer();
    const traceRateLimit = createRateLimitTracer(tracer, 'api-limiter');
    const operation = vi.fn().mockResolvedValue('result');

    const traced = traceRateLimit(operation, 'user-123', true, 50);
    await traced();

    expect(tracer.startSpan).toHaveBeenCalledWith(
      'fortify.rate_limit.api-limiter',
      expect.objectContaining({
        attributes: expect.objectContaining({
          [FORTIFY_ATTRIBUTES.PATTERN]: 'rate-limit',
          [FORTIFY_ATTRIBUTES.NAME]: 'api-limiter',
          [FORTIFY_ATTRIBUTES.RATE_LIMIT_KEY]: 'user-123',
          [FORTIFY_ATTRIBUTES.RATE_LIMIT_ALLOWED]: true,
          [FORTIFY_ATTRIBUTES.RATE_LIMIT_WAIT_MS]: 50,
        }),
      })
    );
  });
});

describe('createTimeoutTracer', () => {
  it('should create traced operation with timeout attributes', async () => {
    const tracer = createMockTracer();
    const traceTimeout = createTimeoutTracer(tracer, 'api-timeout');
    const operation = vi.fn().mockResolvedValue('result');

    const traced = traceTimeout(operation, 5000);
    await traced();

    expect(tracer.startSpan).toHaveBeenCalledWith(
      'fortify.timeout.api-timeout',
      expect.objectContaining({
        attributes: expect.objectContaining({
          [FORTIFY_ATTRIBUTES.PATTERN]: 'timeout',
          [FORTIFY_ATTRIBUTES.NAME]: 'api-timeout',
          [FORTIFY_ATTRIBUTES.TIMEOUT_DURATION_MS]: 5000,
        }),
      })
    );
  });

  it('should set timeout exceeded attribute on timeout error', async () => {
    const tracer = createMockTracer();
    const traceTimeout = createTimeoutTracer(tracer, 'api-timeout');
    const timeoutError = new Error('timeout');
    timeoutError.name = 'TimeoutError';
    const operation = vi.fn().mockRejectedValue(timeoutError);

    const traced = traceTimeout(operation, 5000);
    await expect(traced()).rejects.toThrow();

    expect(tracer.mockSpan.setAttribute).toHaveBeenCalledWith(
      FORTIFY_ATTRIBUTES.TIMEOUT_EXCEEDED,
      true
    );
  });
});

describe('createBulkheadTracer', () => {
  it('should create traced operation with bulkhead attributes', async () => {
    const tracer = createMockTracer();
    const traceBulkhead = createBulkheadTracer(tracer, 'api-bulkhead');
    const operation = vi.fn().mockResolvedValue('result');

    const traced = traceBulkhead(operation, 5, 2, 10);
    await traced();

    expect(tracer.startSpan).toHaveBeenCalledWith(
      'fortify.bulkhead.api-bulkhead',
      expect.objectContaining({
        attributes: expect.objectContaining({
          [FORTIFY_ATTRIBUTES.PATTERN]: 'bulkhead',
          [FORTIFY_ATTRIBUTES.NAME]: 'api-bulkhead',
          [FORTIFY_ATTRIBUTES.BULKHEAD_ACTIVE_COUNT]: 5,
          [FORTIFY_ATTRIBUTES.BULKHEAD_QUEUED_COUNT]: 2,
          [FORTIFY_ATTRIBUTES.BULKHEAD_MAX_CONCURRENT]: 10,
        }),
      })
    );
  });
});

describe('createFallbackTracer', () => {
  it('should create traced operation with fallback attributes', async () => {
    const tracer = createMockTracer();
    const traceFallback = createFallbackTracer(tracer, 'api-fallback');
    const operation = vi.fn().mockResolvedValue('result');

    const traced = traceFallback(operation, true, 'primary failed');
    await traced();

    expect(tracer.startSpan).toHaveBeenCalledWith(
      'fortify.fallback.api-fallback',
      expect.objectContaining({
        attributes: expect.objectContaining({
          [FORTIFY_ATTRIBUTES.PATTERN]: 'fallback',
          [FORTIFY_ATTRIBUTES.NAME]: 'api-fallback',
          [FORTIFY_ATTRIBUTES.FALLBACK_ACTIVATED]: true,
          [FORTIFY_ATTRIBUTES.FALLBACK_REASON]: 'primary failed',
        }),
      })
    );
  });

  it('should omit reason when not provided', async () => {
    const tracer = createMockTracer();
    const traceFallback = createFallbackTracer(tracer, 'api-fallback');
    const operation = vi.fn().mockResolvedValue('result');

    const traced = traceFallback(operation, false);
    await traced();

    const callArgs = (tracer.startSpan as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].attributes).not.toHaveProperty(FORTIFY_ATTRIBUTES.FALLBACK_REASON);
  });
});

describe('FORTIFY_ATTRIBUTES', () => {
  it('should have all expected attribute keys', () => {
    expect(FORTIFY_ATTRIBUTES.PATTERN).toBe('fortify.pattern');
    expect(FORTIFY_ATTRIBUTES.NAME).toBe('fortify.name');
    expect(FORTIFY_ATTRIBUTES.CB_STATE).toBe('fortify.circuit_breaker.state');
    expect(FORTIFY_ATTRIBUTES.RETRY_ATTEMPT).toBe('fortify.retry.attempt');
    expect(FORTIFY_ATTRIBUTES.RATE_LIMIT_KEY).toBe('fortify.rate_limit.key');
    expect(FORTIFY_ATTRIBUTES.TIMEOUT_DURATION_MS).toBe('fortify.timeout.duration_ms');
    expect(FORTIFY_ATTRIBUTES.BULKHEAD_ACTIVE_COUNT).toBe('fortify.bulkhead.active_count');
    expect(FORTIFY_ATTRIBUTES.FALLBACK_ACTIVATED).toBe('fortify.fallback.activated');
  });
});
