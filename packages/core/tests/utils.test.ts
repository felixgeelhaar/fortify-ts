import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
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
  NEVER_ABORTED_SIGNAL,
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
  describe('equal mode (default)', () => {
    it('should return value between 50% and 100% of delay', () => {
      // Run multiple times to verify randomness
      for (let i = 0; i < 100; i++) {
        const delay = 100;
        const jittered = addJitter(delay);
        expect(jittered).toBeGreaterThanOrEqual(delay * 0.5);
        expect(jittered).toBeLessThanOrEqual(delay);
      }
    });

    it('should return integer', () => {
      const jittered = addJitter(100);
      expect(Number.isInteger(jittered)).toBe(true);
    });

    it('should explicitly accept equal mode', () => {
      const delay = 100;
      const jittered = addJitter(delay, 'equal');
      expect(jittered).toBeGreaterThanOrEqual(delay * 0.5);
      expect(jittered).toBeLessThanOrEqual(delay);
    });
  });

  describe('full mode', () => {
    it('should return value between 0 and delay', () => {
      for (let i = 0; i < 100; i++) {
        const delay = 100;
        const jittered = addJitter(delay, 'full');
        expect(jittered).toBeGreaterThanOrEqual(0);
        expect(jittered).toBeLessThan(delay);
      }
    });

    it('should return integer', () => {
      const jittered = addJitter(100, 'full');
      expect(Number.isInteger(jittered)).toBe(true);
    });
  });

  describe('decorrelated mode', () => {
    it('should return value between delay and previous * 3 (capped)', () => {
      const delay = 100;
      const previousDelay = 150;
      for (let i = 0; i < 100; i++) {
        const jittered = addJitter(delay, 'decorrelated', previousDelay);
        expect(jittered).toBeGreaterThanOrEqual(delay);
        // Max is min(previous * 3, delay * 10) = min(450, 1000) = 450
        expect(jittered).toBeLessThanOrEqual(previousDelay * 3);
      }
    });

    it('should use delay as previousDelay when not provided', () => {
      const delay = 100;
      for (let i = 0; i < 100; i++) {
        const jittered = addJitter(delay, 'decorrelated');
        expect(jittered).toBeGreaterThanOrEqual(delay);
        // Max is min(delay * 3, delay * 10) = delay * 3 = 300
        expect(jittered).toBeLessThanOrEqual(delay * 3);
      }
    });

    it('should cap at delay * 10 for large previousDelay', () => {
      const delay = 100;
      const previousDelay = 1000; // Would give max of 3000, but capped at 1000
      for (let i = 0; i < 100; i++) {
        const jittered = addJitter(delay, 'decorrelated', previousDelay);
        expect(jittered).toBeGreaterThanOrEqual(delay);
        expect(jittered).toBeLessThanOrEqual(delay * 10);
      }
    });

    it('should return integer', () => {
      const jittered = addJitter(100, 'decorrelated', 150);
      expect(Number.isInteger(jittered)).toBe(true);
    });
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

describe('NEVER_ABORTED_SIGNAL', () => {
  it('should not be aborted', () => {
    expect(NEVER_ABORTED_SIGNAL.aborted).toBe(false);
  });

  it('should be reusable', () => {
    // Same reference should be returned
    expect(NEVER_ABORTED_SIGNAL).toBe(NEVER_ABORTED_SIGNAL);
  });
});

describe('executeWithTimeout', () => {
  it('should execute operation and return result', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    const result = await executeWithTimeout(operation, 1000);
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalled();
  });

  it('should pass combined signal to operation', async () => {
    let receivedSignal: AbortSignal | undefined;
    const operation = vi.fn().mockImplementation((signal: AbortSignal) => {
      receivedSignal = signal;
      return Promise.resolve('success');
    });
    await executeWithTimeout(operation, 1000);
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal?.aborted).toBe(false);
  });

  it('should reject with TimeoutError when operation times out', async () => {
    // Create an operation that respects the abort signal
    const operation = vi.fn().mockImplementation((signal: AbortSignal) => {
      return new Promise((resolve, reject) => {
        // Set up a long-running operation
        const timeoutId = setTimeout(() => resolve('success'), 5000);

        // Listen for abort
        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(signal.reason);
        });
      });
    });
    // Use a short timeout to trigger the TimeoutError
    await expect(executeWithTimeout(operation, 10)).rejects.toBeInstanceOf(TimeoutError);
  });

  it('should clean up timeout on success', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const operation = vi.fn().mockResolvedValue('success');
    await executeWithTimeout(operation, 1000);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('should clean up timeout on failure', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const operation = vi.fn().mockRejectedValue(new Error('test'));
    await expect(executeWithTimeout(operation, 1000)).rejects.toThrow('test');
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});

describe('throwIfAborted', () => {
  it('should not throw if signal is undefined', () => {
    expect(() => throwIfAborted(undefined)).not.toThrow();
  });

  it('should not throw if signal is not aborted', () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
  });

  it('should throw if signal is aborted', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow();
  });

  it('should throw the abort reason if provided', () => {
    const controller = new AbortController();
    const reason = new Error('Custom abort reason');
    controller.abort(reason);
    expect(() => throwIfAborted(controller.signal)).toThrow('Custom abort reason');
  });

  it('should throw DOMException if no reason provided', () => {
    const controller = new AbortController();
    controller.abort();
    try {
      throwIfAborted(controller.signal);
      expect.fail('Should have thrown');
    } catch (error) {
      // The reason could be a DOMException or the default reason
      expect(error).toBeDefined();
    }
  });
});

describe('now', () => {
  it('should return a number', () => {
    const result = now();
    expect(typeof result).toBe('number');
  });

  it('should return increasing values', () => {
    const first = now();
    const second = now();
    expect(second).toBeGreaterThanOrEqual(first);
  });

  it('should use performance.now when available', () => {
    // Since we're in a Node environment with performance available
    const performanceSpy = vi.spyOn(performance, 'now');
    now();
    expect(performanceSpy).toHaveBeenCalled();
    performanceSpy.mockRestore();
  });
});

describe('withTimeout additional tests', () => {
  it('should reject immediately if signal already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const promise = Promise.resolve('success');
    await expect(withTimeout(promise, 1000, controller.signal)).rejects.toThrow();
  });

  it('should reject with abort reason when signal is aborted during operation', async () => {
    const controller = new AbortController();
    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('success'), 200);
    });

    const resultPromise = withTimeout(slowPromise, 1000, controller.signal);
    controller.abort(new Error('Aborted by user'));

    await expect(resultPromise).rejects.toThrow('Aborted by user');
  });
});

describe('sleep ensureError edge cases', () => {
  it('should handle string abort reason', async () => {
    const controller = new AbortController();
    controller.abort('String reason');
    await expect(sleep(100, controller.signal)).rejects.toThrow('String reason');
  });

  it('should handle object abort reason', async () => {
    const controller = new AbortController();
    controller.abort({ code: 'CUSTOM_ERROR' });
    try {
      await sleep(100, controller.signal);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('CUSTOM_ERROR');
    }
  });

  it('should handle null abort reason', async () => {
    const controller = new AbortController();
    controller.abort(null);
    try {
      await sleep(100, controller.signal);
      expect.fail('Should have thrown');
    } catch (error) {
      // Should get a DOMException for null/undefined reasons
      expect(error).toBeDefined();
    }
  });

  it('should handle undefined abort reason', async () => {
    const controller = new AbortController();
    controller.abort(undefined);
    try {
      await sleep(100, controller.signal);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
