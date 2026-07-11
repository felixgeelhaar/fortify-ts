import { afterEach, describe, expect, it, vi } from 'vitest';
import { consoleLogger, noopLogger, type FortifyLogger } from '../src/types.js';

/**
 * Covers the logger implementations in types.ts. consoleLogger's four methods
 * each branch on whether a `context` object is supplied (with-context vs
 * message-only), so every method is exercised both ways to cover all branches.
 */
describe('consoleLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const levels: Array<{ method: keyof FortifyLogger; console: keyof Console }> = [
    { method: 'debug', console: 'debug' },
    { method: 'info', console: 'info' },
    { method: 'warn', console: 'warn' },
    { method: 'error', console: 'error' },
  ];

  for (const { method, console: consoleMethod } of levels) {
    it(`${method}() forwards a message with context to console.${String(consoleMethod)}`, () => {
      const spy = vi.spyOn(console, consoleMethod).mockImplementation(() => undefined);
      const context = { requestId: 'abc', attempt: 1 };

      consoleLogger[method]('boom', context);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('[fortify] boom', context);
    });

    it(`${method}() forwards a message without context to console.${String(consoleMethod)}`, () => {
      const spy = vi.spyOn(console, consoleMethod).mockImplementation(() => undefined);

      consoleLogger[method]('bare');

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('[fortify] bare');
    });
  }
});

describe('noopLogger', () => {
  it('discards all messages and returns undefined', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(noopLogger.debug('x')).toBeUndefined();
    expect(noopLogger.info('x', { a: 1 })).toBeUndefined();
    expect(noopLogger.warn('x')).toBeUndefined();
    expect(noopLogger.error('x', { a: 1 })).toBeUndefined();

    expect(errorSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
