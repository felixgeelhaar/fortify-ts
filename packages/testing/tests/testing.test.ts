import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createErrorInjector,
  createLatencyInjector,
  createTimeoutSimulator,
  createFlakeyService,
  createDegradedResponse,
  composeChaos,
  createMockOperation,
  createCountingOperation,
  createFailThenSucceed,
  createFailingOperation,
  createSuccessfulOperation,
  createSlowOperation,
  createAbortableOperation,
} from '../src/index.js';

describe('Chaos Injectors', () => {
  describe('createErrorInjector', () => {
    it('should inject errors based on probability', async () => {
      const inject = createErrorInjector({
        probability: 1,
        error: new Error('injected'),
      });

      const operation = async () => 'success';
      const wrapped = inject(operation);

      await expect(wrapped()).rejects.toThrow('injected');
    });

    it('should not inject errors when probability is 0', async () => {
      const inject = createErrorInjector({
        probability: 0,
        error: new Error('injected'),
      });

      const operation = async () => 'success';
      const wrapped = inject(operation);

      const result = await wrapped();
      expect(result).toBe('success');
    });

    it('should inject errors approximately at configured rate', async () => {
      // Mock Math.random to be predictable
      let callCount = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callCount++;
        return callCount % 2 === 0 ? 0.6 : 0.4; // Alternates above/below 0.5
      });

      const inject = createErrorInjector({
        probability: 0.5,
        error: new Error('injected'),
      });

      const operation = async () => 'success';
      const wrapped = inject(operation);

      await expect(wrapped()).rejects.toThrow('injected'); // 0.4 < 0.5
      const result = await wrapped(); // 0.6 >= 0.5
      expect(result).toBe('success');

      vi.restoreAllMocks();
    });
  });

  describe('createLatencyInjector', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should add latency within configured range', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const inject = createLatencyInjector({
        minMs: 100,
        maxMs: 200,
      });

      const operation = async () => 'success';
      const wrapped = inject(operation);

      const promise = wrapped();
      await vi.advanceTimersByTimeAsync(150); // min + 0.5 * (max - min) = 150
      const result = await promise;

      expect(result).toBe('success');
      vi.restoreAllMocks();
    });

    it('should skip latency based on probability', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.6);

      const inject = createLatencyInjector({
        minMs: 1000,
        maxMs: 2000,
        probability: 0.5,
      });

      const operation = async () => 'success';
      const wrapped = inject(operation);

      const result = await wrapped();
      expect(result).toBe('success');

      vi.restoreAllMocks();
    });
  });

  describe('createTimeoutSimulator', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should simulate timeout when triggered', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.4);

      const simulate = createTimeoutSimulator({
        timeoutMs: 5000,
        probability: 0.5,
      });

      const start = Date.now();
      const operation = async () => 'success';
      const wrapped = simulate(operation);

      const promise = wrapped();
      await vi.advanceTimersByTimeAsync(5000);
      await promise;

      expect(Date.now() - start).toBe(5000);
      vi.restoreAllMocks();
    });
  });

  describe('createFlakeyService', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should add latency to all requests', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const flakey = createFlakeyService({
        errorRate: 0, // No errors
        minLatencyMs: 100,
        maxLatencyMs: 200,
      });

      const operation = async () => 'success';
      const wrapped = flakey(operation);

      const promise = wrapped();
      await vi.advanceTimersByTimeAsync(150);
      const result = await promise;

      expect(result).toBe('success');
      vi.restoreAllMocks();
    });

    it('should fail based on error rate', async () => {
      vi.useRealTimers();

      let callIdx = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callIdx++;
        // First call: 0 for delay, 0.3 for error check
        // Second call: 0 for delay, 0.8 for error check
        if (callIdx === 1) return 0; // delay
        if (callIdx === 2) return 0.3; // error check (< 0.5)
        if (callIdx === 3) return 0; // delay
        return 0.8; // error check (>= 0.5)
      });

      const flakey = createFlakeyService({
        errorRate: 0.5,
        minLatencyMs: 0,
        maxLatencyMs: 1,
        errors: [new Error('service error')],
      });

      const operation = async () => 'success';
      const wrapped = flakey(operation);

      // First call should fail (0.3 < 0.5)
      await expect(wrapped()).rejects.toThrow('service error');

      // Second call should succeed (0.8 >= 0.5)
      const result = await wrapped();
      expect(result).toBe('success');

      vi.restoreAllMocks();
    });
  });

  describe('createDegradedResponse', () => {
    it('should degrade response when triggered', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.4);

      const degrade = createDegradedResponse({
        probability: 0.5,
        transform: (data: unknown) => ({ ...(data as object), degraded: true }),
      });

      const operation = async () => ({ data: 'value' });
      const wrapped = degrade(operation);

      const result = await wrapped();
      expect(result).toEqual({ data: 'value', degraded: true });

      vi.restoreAllMocks();
    });

    it('should not degrade when probability not met', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.6);

      const degrade = createDegradedResponse({
        probability: 0.5,
        transform: () => ({ degraded: true }),
      });

      const operation = async () => ({ data: 'value' });
      const wrapped = degrade(operation);

      const result = await wrapped();
      expect(result).toEqual({ data: 'value' });

      vi.restoreAllMocks();
    });
  });

  describe('composeChaos', () => {
    it('should compose multiple injectors', async () => {
      const log: string[] = [];

      const injector1 = <T>(op: (signal?: AbortSignal) => Promise<T>) => {
        return async (signal?: AbortSignal): Promise<T> => {
          log.push('injector1-before');
          const result = await op(signal);
          log.push('injector1-after');
          return result;
        };
      };

      const injector2 = <T>(op: (signal?: AbortSignal) => Promise<T>) => {
        return async (signal?: AbortSignal): Promise<T> => {
          log.push('injector2-before');
          const result = await op(signal);
          log.push('injector2-after');
          return result;
        };
      };

      const chaos = composeChaos(injector1, injector2);

      const operation = async () => {
        log.push('operation');
        return 'success';
      };

      const wrapped = chaos(operation);
      await wrapped();

      // injector2 wraps first (innermost), then injector1 wraps it (outermost)
      expect(log).toEqual([
        'injector2-before',
        'injector1-before',
        'operation',
        'injector1-after',
        'injector2-after',
      ]);
    });
  });
});

describe('Mock Operations', () => {
  describe('createMockOperation', () => {
    it('should return results in sequence', async () => {
      const { operation, stats } = createMockOperation({
        results: ['first', 'second', 'third'],
        defaultResult: 'default',
      });

      expect(await operation()).toBe('first');
      expect(await operation()).toBe('second');
      expect(await operation()).toBe('third');
      expect(await operation()).toBe('default');
      expect(stats.callCount).toBe(4);
    });

    it('should throw errors from results', async () => {
      const { operation } = createMockOperation({
        results: ['success', new Error('fail')],
        defaultResult: 'default',
      });

      expect(await operation()).toBe('success');
      await expect(operation()).rejects.toThrow('fail');
    });

    it('should track call timestamps', async () => {
      const { operation, stats } = createMockOperation({
        defaultResult: 'result',
      });

      await operation();
      await operation();

      expect(stats.calls).toHaveLength(2);
      expect(stats.calls[0]?.timestamp).toBeDefined();
    });

    it('should call onCall callback', async () => {
      const onCall = vi.fn();
      const { operation } = createMockOperation({
        defaultResult: 'result',
        onCall,
      });

      await operation();
      await operation();

      expect(onCall).toHaveBeenCalledTimes(2);
      expect(onCall).toHaveBeenNthCalledWith(1, 0, undefined);
      expect(onCall).toHaveBeenNthCalledWith(2, 1, undefined);
    });

    it('should reset stats', async () => {
      const { operation, stats } = createMockOperation({
        defaultResult: 'result',
      });

      await operation();
      await operation();
      expect(stats.callCount).toBe(2);

      stats.reset();
      expect(stats.callCount).toBe(0);
      expect(stats.calls).toHaveLength(0);
    });

    it('should add delay when configured', async () => {
      vi.useFakeTimers();

      const { operation } = createMockOperation({
        defaultResult: 'result',
        delayMs: 100,
      });

      const promise = operation();
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result).toBe('result');

      vi.useRealTimers();
    });
  });

  describe('createCountingOperation', () => {
    it('should count invocations', async () => {
      const baseOperation = async () => 'result';
      const { operation, getCallCount, reset } = createCountingOperation(baseOperation);

      await operation();
      await operation();
      await operation();

      expect(getCallCount()).toBe(3);

      reset();
      expect(getCallCount()).toBe(0);
    });
  });

  describe('createFailThenSucceed', () => {
    it('should fail specified number of times then succeed', async () => {
      const { operation, getAttempts } = createFailThenSucceed(
        2,
        new Error('fail'),
        'success'
      );

      await expect(operation()).rejects.toThrow('fail');
      await expect(operation()).rejects.toThrow('fail');
      expect(await operation()).toBe('success');
      expect(getAttempts()).toBe(3);
    });
  });

  describe('createFailingOperation', () => {
    it('should always throw', async () => {
      const operation = createFailingOperation(new Error('always fails'));

      await expect(operation()).rejects.toThrow('always fails');
      await expect(operation()).rejects.toThrow('always fails');
    });
  });

  describe('createSuccessfulOperation', () => {
    it('should always succeed', async () => {
      const operation = createSuccessfulOperation('always works');

      expect(await operation()).toBe('always works');
      expect(await operation()).toBe('always works');
    });
  });

  describe('createSlowOperation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should delay for specified duration', async () => {
      const operation = createSlowOperation(500, 'result');

      const promise = operation();
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(result).toBe('result');
    });
  });

  describe('createAbortableOperation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should complete normally without abort', async () => {
      const operation = createAbortableOperation('result', 100);
      const controller = new AbortController();

      const promise = operation(controller.signal);
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result).toBe('result');
    });

    it('should respect abort signal', async () => {
      vi.useRealTimers();

      const controller = new AbortController();
      const operation = createAbortableOperation('result', 50);

      const promise = operation(controller.signal);

      // Abort before completion
      setTimeout(() => controller.abort(), 10);

      await expect(promise).rejects.toThrow();
    });
  });
});
