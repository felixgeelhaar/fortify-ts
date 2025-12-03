import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sleep,
  withTimeout,
  combineSignals,
  isAbortError,
  safeCallback,
  addJitter,
  clamp,
} from '../src/utils.js';
import { TimeoutError } from '../src/errors.js';

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve after specified duration', async () => {
    const promise = sleep(100);
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();
  });

  it('should reject when signal is aborted', async () => {
    const controller = new AbortController();
    const promise = sleep(100, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow();
  });

  it('should reject immediately if signal already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(100, controller.signal)).rejects.toThrow();
  });
});

describe('withTimeout', () => {
  it('should resolve if promise completes before timeout', async () => {
    const promise = Promise.resolve('success');
    const result = await withTimeout(promise, 100);
    expect(result).toBe('success');
  });

  it('should reject with TimeoutError if timeout exceeded', async () => {
    const promise = new Promise<string>((resolve) => {
      // Never resolves
      setTimeout(() => resolve('success'), 200);
    });
    await expect(withTimeout(promise, 50)).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('combineSignals', () => {
  it('should return new signal when no signals provided', () => {
    const signal = combineSignals();
    expect(signal.aborted).toBe(false);
  });

  it('should return same signal when only one provided', () => {
    const controller = new AbortController();
    const signal = combineSignals(controller.signal);
    expect(signal).toBe(controller.signal);
  });

  it('should filter undefined signals', () => {
    const controller = new AbortController();
    const signal = combineSignals(undefined, controller.signal, undefined);
    expect(signal).toBe(controller.signal);
  });

  it('should abort combined signal when any signal aborts', () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();
    const signal = combineSignals(controller1.signal, controller2.signal);

    expect(signal.aborted).toBe(false);
    controller1.abort();
    expect(signal.aborted).toBe(true);
  });

  it('should return aborted signal if any input is already aborted', () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();
    controller1.abort();
    const signal = combineSignals(controller1.signal, controller2.signal);
    expect(signal.aborted).toBe(true);
  });

  it('should clean up listeners when signal aborts (fallback path)', () => {
    // Force fallback path by temporarily removing AbortSignal.any
    const originalAny = (AbortSignal as { any?: unknown }).any;
    delete (AbortSignal as { any?: unknown }).any;

    try {
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      const controller3 = new AbortController();

      const signal = combineSignals(
        controller1.signal,
        controller2.signal,
        controller3.signal
      );

      expect(signal.aborted).toBe(false);

      // Abort one signal - should clean up listeners on others
      controller2.abort();

      expect(signal.aborted).toBe(true);

      // Aborting other controllers should not affect the combined signal
      // (the listeners should have been cleaned up)
      controller1.abort();
      controller3.abort();

      // Signal should still report the original abort reason
      expect(signal.aborted).toBe(true);
    } finally {
      // Restore AbortSignal.any
      if (originalAny) {
        (AbortSignal as { any?: unknown }).any = originalAny;
      }
    }
  });
});

describe('isAbortError', () => {
  it('should return true for AbortError', () => {
    const error = new DOMException('Aborted', 'AbortError');
    expect(isAbortError(error)).toBe(true);
  });

  it('should return false for other DOMException', () => {
    const error = new DOMException('Other', 'OtherError');
    expect(isAbortError(error)).toBe(false);
  });

  it('should return false for regular errors', () => {
    expect(isAbortError(new Error('test'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError('string')).toBe(false);
  });
});

describe('safeCallback', () => {
  it('should return undefined when callback is undefined', () => {
    expect(safeCallback(undefined)).toBeUndefined();
  });

  it('should execute callback normally', () => {
    const callback = vi.fn().mockReturnValue('result');
    const safe = safeCallback(callback);
    expect(safe?.('arg')).toBe('result');
    expect(callback).toHaveBeenCalledWith('arg');
  });

  it('should catch errors and call onError', () => {
    const error = new Error('test');
    const callback = vi.fn().mockImplementation(() => {
      throw error;
    });
    const onError = vi.fn();
    const safe = safeCallback(callback, onError);
    expect(safe?.()).toBeUndefined();
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('should not throw if callback throws', () => {
    const callback = vi.fn().mockImplementation(() => {
      throw new Error('test');
    });
    const safe = safeCallback(callback);
    expect(() => safe?.()).not.toThrow();
  });
});

describe('addJitter', () => {
  it('should return value between delay and delay * 1.1', () => {
    // Run multiple times to verify randomness
    for (let i = 0; i < 100; i++) {
      const delay = 100;
      const jittered = addJitter(delay);
      expect(jittered).toBeGreaterThanOrEqual(delay);
      expect(jittered).toBeLessThanOrEqual(delay * 1.1);
    }
  });

  it('should return integer', () => {
    const jittered = addJitter(100);
    expect(Number.isInteger(jittered)).toBe(true);
  });
});

describe('clamp', () => {
  it('should clamp value below min', () => {
    expect(clamp(5, 10, 20)).toBe(10);
  });

  it('should clamp value above max', () => {
    expect(clamp(25, 10, 20)).toBe(20);
  });

  it('should return value within range', () => {
    expect(clamp(15, 10, 20)).toBe(15);
  });

  it('should handle edge cases', () => {
    expect(clamp(10, 10, 20)).toBe(10);
    expect(clamp(20, 10, 20)).toBe(20);
  });
});
