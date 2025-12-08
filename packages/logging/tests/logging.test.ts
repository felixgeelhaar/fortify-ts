import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  type FortifyLogger,
  createResilienceLogger,
  createConsoleLogger,
  createPinoLogger,
  noopLogger,
  createNoopLogger,
} from '../src/index.js';

describe('noopLogger', () => {
  it('should not throw on any log level', () => {
    expect(() => noopLogger.debug('test')).not.toThrow();
    expect(() => noopLogger.info('test')).not.toThrow();
    expect(() => noopLogger.warn('test')).not.toThrow();
    expect(() => noopLogger.error('test')).not.toThrow();
  });

  it('should accept context without throwing', () => {
    expect(() =>
      noopLogger.debug('test', { key: 'value' })
    ).not.toThrow();
  });

  it('should return itself for child()', () => {
    const child = noopLogger.child({ service: 'test' });
    expect(child).toBe(noopLogger);
  });

  it('should be returned by createNoopLogger()', () => {
    expect(createNoopLogger()).toBe(noopLogger);
  });
});

describe('createConsoleLogger', () => {
  let consoleSpy: {
    debug: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('prototype pollution prevention', () => {
    it('should filter __proto__ from context', () => {
      const logger = createConsoleLogger({ timestamps: false });
      const maliciousContext = JSON.parse('{"__proto__": {"polluted": true}, "safe": "value"}');

      logger.info('test message', maliciousContext);

      // Verify Object prototype was not polluted
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();

      // Verify safe properties are still included
      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      expect(output).toContain('"safe":"value"');
      expect(output).not.toContain('__proto__');
    });

    it('should filter constructor from context', () => {
      const logger = createConsoleLogger({ timestamps: false });
      const maliciousContext = { constructor: { polluted: true }, safe: 'value' };

      logger.info('test message', maliciousContext);

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      expect(output).toContain('"safe":"value"');
      expect(output).not.toContain('constructor');
    });

    it('should filter prototype from context', () => {
      const logger = createConsoleLogger({ timestamps: false });
      const maliciousContext = { prototype: { polluted: true }, safe: 'value' };

      logger.info('test message', maliciousContext);

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      expect(output).toContain('"safe":"value"');
      expect(output).not.toContain('"prototype"');
    });

    it('should prevent prototype pollution via child logger', () => {
      const logger = createConsoleLogger({ timestamps: false });
      const maliciousBindings = JSON.parse('{"__proto__": {"childPolluted": true}}');

      const child = logger.child(maliciousBindings);
      child.info('test message');

      // Verify Object prototype was not polluted
      expect(({} as Record<string, unknown>).childPolluted).toBeUndefined();
    });

    it('should handle multiple unsafe keys in same context', () => {
      const logger = createConsoleLogger({ timestamps: false });
      const maliciousContext = JSON.parse(
        '{"__proto__": {"a": 1}, "constructor": {"b": 2}, "prototype": {"c": 3}, "safe": "value"}'
      );

      logger.info('test message', maliciousContext);

      // Verify no pollution
      expect(({} as Record<string, unknown>).a).toBeUndefined();

      // Verify safe properties work
      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      expect(output).toContain('"safe":"value"');
    });

    it('should work correctly in JSON mode', () => {
      const logger = createConsoleLogger({ json: true });
      const maliciousContext = JSON.parse('{"__proto__": {"polluted": true}, "safe": "value"}');

      logger.info('test message', maliciousContext);

      // Verify Object prototype was not polluted
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();

      // Verify JSON output contains safe properties
      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.safe).toBe('value');
      // Check that __proto__ key is not present in output (using hasOwnProperty)
      expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
    });
  });

  it('should log at all levels', () => {
    const logger = createConsoleLogger({ level: 'debug' });

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(consoleSpy.debug).toHaveBeenCalled();
    expect(consoleSpy.info).toHaveBeenCalled();
    expect(consoleSpy.warn).toHaveBeenCalled();
    expect(consoleSpy.error).toHaveBeenCalled();
  });

  it('should respect log level', () => {
    const logger = createConsoleLogger({ level: 'warn' });

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(consoleSpy.debug).not.toHaveBeenCalled();
    expect(consoleSpy.info).not.toHaveBeenCalled();
    expect(consoleSpy.warn).toHaveBeenCalled();
    expect(consoleSpy.error).toHaveBeenCalled();
  });

  it('should include timestamps by default', () => {
    const logger = createConsoleLogger({ level: 'debug' });
    logger.info('test message');

    const output = consoleSpy.info.mock.calls[0]?.[0] as string;
    expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
  });

  it('should exclude timestamps when disabled', () => {
    const logger = createConsoleLogger({ level: 'debug', timestamps: false });
    logger.info('test message');

    const output = consoleSpy.info.mock.calls[0]?.[0] as string;
    expect(output).not.toMatch(/\[\d{4}-\d{2}-\d{2}T/);
  });

  it('should include prefix when specified', () => {
    const logger = createConsoleLogger({ prefix: 'MyApp' });
    logger.info('test message');

    const output = consoleSpy.info.mock.calls[0]?.[0] as string;
    expect(output).toContain('[MyApp]');
  });

  it('should output JSON when enabled', () => {
    const logger = createConsoleLogger({ json: true });
    logger.info('test message', { key: 'value' });

    const output = consoleSpy.info.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('test message');
    expect(parsed.key).toBe('value');
  });

  it('should include context in log message', () => {
    const logger = createConsoleLogger({ timestamps: false });
    logger.info('test message', { userId: '123', action: 'login' });

    const output = consoleSpy.info.mock.calls[0]?.[0] as string;
    expect(output).toContain('"userId":"123"');
    expect(output).toContain('"action":"login"');
  });

  it('should create child logger with bound context', () => {
    const logger = createConsoleLogger({ timestamps: false });
    const child = logger.child({ service: 'auth' });

    child.info('test message');

    // Child logger should work
    expect(consoleSpy.info).toHaveBeenCalled();
  });
});

describe('createPinoLogger', () => {
  function createMockPino() {
    const mock = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    };
    mock.child.mockReturnValue(mock);
    return mock;
  }

  it('should delegate debug calls to pino', () => {
    const pino = createMockPino();
    const logger = createPinoLogger(pino);

    logger.debug('test message');
    expect(pino.debug).toHaveBeenCalledWith('test message');
  });

  it('should delegate info calls to pino', () => {
    const pino = createMockPino();
    const logger = createPinoLogger(pino);

    logger.info('test message');
    expect(pino.info).toHaveBeenCalledWith('test message');
  });

  it('should delegate warn calls to pino', () => {
    const pino = createMockPino();
    const logger = createPinoLogger(pino);

    logger.warn('test message');
    expect(pino.warn).toHaveBeenCalledWith('test message');
  });

  it('should delegate error calls to pino', () => {
    const pino = createMockPino();
    const logger = createPinoLogger(pino);

    logger.error('test message');
    expect(pino.error).toHaveBeenCalledWith('test message');
  });

  it('should pass context as first argument when provided', () => {
    const pino = createMockPino();
    const logger = createPinoLogger(pino);

    logger.info('test message', { userId: '123' });
    expect(pino.info).toHaveBeenCalledWith({ userId: '123' }, 'test message');
  });

  it('should not pass context when empty', () => {
    const pino = createMockPino();
    const logger = createPinoLogger(pino);

    logger.info('test message', {});
    expect(pino.info).toHaveBeenCalledWith('test message');
  });

  it('should create child logger via pino.child()', () => {
    const pino = createMockPino();
    const logger = createPinoLogger(pino);

    logger.child({ service: 'auth' });
    expect(pino.child).toHaveBeenCalledWith({ service: 'auth' });
  });
});

describe('createResilienceLogger', () => {
  function createMockLogger(): FortifyLogger {
    const mock = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    };
    mock.child.mockReturnValue(mock);
    return mock as unknown as FortifyLogger;
  }

  it('should pass through base logger methods', () => {
    const base = createMockLogger();
    const logger = createResilienceLogger(base);

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(base.debug).toHaveBeenCalledWith('debug');
    expect(base.info).toHaveBeenCalledWith('info');
    expect(base.warn).toHaveBeenCalledWith('warn');
    expect(base.error).toHaveBeenCalledWith('error');
  });

  describe('circuitBreakerStateChange', () => {
    it('should log state change with pattern context', () => {
      const base = createMockLogger();
      const logger = createResilienceLogger(base);

      logger.circuitBreakerStateChange('api-breaker', 'closed', 'open');

      expect(base.info).toHaveBeenCalledWith(
        'Circuit breaker api-breaker state changed: closed -> open',
        expect.objectContaining({
          pattern: 'circuit-breaker',
          name: 'api-breaker',
          from: 'closed',
          to: 'open',
        })
      );
    });

    it('should merge additional context', () => {
      const base = createMockLogger();
      const logger = createResilienceLogger(base);

      logger.circuitBreakerStateChange('api-breaker', 'closed', 'open', {
        reason: 'max failures exceeded',
      });

      expect(base.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ reason: 'max failures exceeded' })
      );
    });
  });

  describe('retryAttempt', () => {
    it('should log retry attempt with pattern context', () => {
      const base = createMockLogger();
      const logger = createResilienceLogger(base);
      const error = new Error('Connection failed');

      logger.retryAttempt('api-retry', 2, 3, error);

      expect(base.warn).toHaveBeenCalledWith(
        'Retry api-retry attempt 2/3',
        expect.objectContaining({
          pattern: 'retry',
          name: 'api-retry',
          attempt: 2,
          maxAttempts: 3,
          error: 'Connection failed',
        })
      );
    });
  });

  describe('rateLimitExceeded', () => {
    it('should log rate limit exceeded with pattern context', () => {
      const base = createMockLogger();
      const logger = createResilienceLogger(base);

      logger.rateLimitExceeded('api-limit', 'user-123');

      expect(base.warn).toHaveBeenCalledWith(
        'Rate limit api-limit exceeded for key: user-123',
        expect.objectContaining({
          pattern: 'rate-limit',
          name: 'api-limit',
          key: 'user-123',
        })
      );
    });
  });

  describe('timeoutExceeded', () => {
    it('should log timeout exceeded with pattern context', () => {
      const base = createMockLogger();
      const logger = createResilienceLogger(base);

      logger.timeoutExceeded('api-timeout', 5000);

      expect(base.warn).toHaveBeenCalledWith(
        'Timeout api-timeout exceeded after 5000ms',
        expect.objectContaining({
          pattern: 'timeout',
          name: 'api-timeout',
          duration: 5000,
        })
      );
    });
  });

  describe('bulkheadRejection', () => {
    it('should log bulkhead rejection with pattern context', () => {
      const base = createMockLogger();
      const logger = createResilienceLogger(base);

      logger.bulkheadRejection('api-bulkhead', 10, 5);

      expect(base.warn).toHaveBeenCalledWith(
        'Bulkhead api-bulkhead rejected request',
        expect.objectContaining({
          pattern: 'bulkhead',
          name: 'api-bulkhead',
          active: 10,
          queued: 5,
        })
      );
    });
  });

  describe('fallbackActivated', () => {
    it('should log fallback activation with pattern context', () => {
      const base = createMockLogger();
      const logger = createResilienceLogger(base);
      const error = new Error('Primary failed');

      logger.fallbackActivated('api-fallback', error);

      expect(base.info).toHaveBeenCalledWith(
        'Fallback api-fallback activated due to: Primary failed',
        expect.objectContaining({
          pattern: 'fallback',
          name: 'api-fallback',
          error: 'Primary failed',
        })
      );
    });
  });

  describe('child', () => {
    it('should return a resilience logger from child', () => {
      const base = createMockLogger();
      const logger = createResilienceLogger(base);

      const child = logger.child({ service: 'api' });

      // Should have resilience methods
      expect(typeof child.circuitBreakerStateChange).toBe('function');
      expect(typeof child.retryAttempt).toBe('function');
      expect(typeof child.rateLimitExceeded).toBe('function');
    });
  });
});
