import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { Fallback } from '../src/fallback.js';

describe('Fallback Property-Based Tests', () => {
  describe('primary success behavior', () => {
    it('should return primary result when it succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.anything(), // any return value
          async (returnValue) => {
            const fallback = new Fallback({
              fallback: async () => 'fallback-value',
            });

            const operation = vi.fn(async () => returnValue);

            const result = await fallback.execute(operation);

            expect(result).toEqual(returnValue);
            expect(operation).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should not call fallback function when primary succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(), // return value
          async (returnValue) => {
            const fallbackFn = vi.fn(async () => 'fallback');

            const fallback = new Fallback({
              fallback: fallbackFn,
            });

            const operation = vi.fn(async () => returnValue);

            await fallback.execute(operation);

            expect(fallbackFn).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('fallback behavior on failure', () => {
    it('should return fallback result when primary fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(), // fallback value
          fc.string(), // error message
          async (fallbackValue, errorMessage) => {
            const fallback = new Fallback({
              fallback: async () => fallbackValue,
            });

            const operation = vi.fn(async () => {
              throw new Error(errorMessage);
            });

            const result = await fallback.execute(operation);

            expect(result).toBe(fallbackValue);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should pass error to fallback function', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // error message
          async (errorMessage) => {
            let receivedError: Error | null = null;

            const fallback = new Fallback({
              fallback: async (_signal, error) => {
                receivedError = error;
                return 'fallback';
              },
            });

            const primaryError = new Error(errorMessage);
            const operation = vi.fn(async () => {
              throw primaryError;
            });

            await fallback.execute(operation);

            expect(receivedError).toBe(primaryError);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('shouldFallback predicate', () => {
    it('should skip fallback when shouldFallback returns false', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // error message
          async (errorMessage) => {
            const fallbackFn = vi.fn(async () => 'fallback');

            const fallback = new Fallback({
              fallback: fallbackFn,
              shouldFallback: () => false, // Never fallback
            });

            const primaryError = new Error(errorMessage);
            const operation = vi.fn(async () => {
              throw primaryError;
            });

            await expect(fallback.execute(operation)).rejects.toThrow(primaryError);
            expect(fallbackFn).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should use fallback when shouldFallback returns true', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // error message
          fc.string(), // fallback value
          async (errorMessage, fallbackValue) => {
            const fallback = new Fallback({
              fallback: async () => fallbackValue,
              shouldFallback: () => true, // Always fallback
            });

            const operation = vi.fn(async () => {
              throw new Error(errorMessage);
            });

            const result = await fallback.execute(operation);
            expect(result).toBe(fallbackValue);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('shouldFallback receives the error', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // error message
          async (errorMessage) => {
            let receivedError: Error | null = null;

            const fallback = new Fallback({
              fallback: async () => 'fallback',
              shouldFallback: (error) => {
                receivedError = error;
                return true;
              },
            });

            const primaryError = new Error(errorMessage);
            const operation = vi.fn(async () => {
              throw primaryError;
            });

            await fallback.execute(operation);

            expect(receivedError).toBe(primaryError);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('callback behavior', () => {
    it('onSuccess should be called exactly once on primary success', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(), // return value
          async (returnValue) => {
            let onSuccessCalls = 0;

            const fallback = new Fallback({
              fallback: async () => 'fallback',
              onSuccess: () => {
                onSuccessCalls++;
              },
            });

            const operation = vi.fn(async () => returnValue);

            await fallback.execute(operation);

            expect(onSuccessCalls).toBe(1);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('onFallback should be called exactly once when fallback is used', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // error message
          async (errorMessage) => {
            let onFallbackCalls = 0;
            let receivedError: Error | null = null;

            const fallback = new Fallback({
              fallback: async () => 'fallback',
              onFallback: (error) => {
                onFallbackCalls++;
                receivedError = error;
              },
            });

            const primaryError = new Error(errorMessage);
            const operation = vi.fn(async () => {
              throw primaryError;
            });

            await fallback.execute(operation);

            expect(onFallbackCalls).toBe(1);
            expect(receivedError).toBe(primaryError);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('onSuccess should not be called when primary fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // error message
          async (errorMessage) => {
            let onSuccessCalls = 0;

            const fallback = new Fallback({
              fallback: async () => 'fallback',
              onSuccess: () => {
                onSuccessCalls++;
              },
            });

            const operation = vi.fn(async () => {
              throw new Error(errorMessage);
            });

            await fallback.execute(operation);

            expect(onSuccessCalls).toBe(0);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('fallback failure behavior', () => {
    it('should throw original error when fallback also fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // primary error message
          fc.string({ minLength: 1 }), // fallback error message
          async (primaryMessage, fallbackMessage) => {
            const fallback = new Fallback({
              fallback: async () => {
                throw new Error(fallbackMessage);
              },
            });

            const primaryError = new Error(primaryMessage);
            const operation = vi.fn(async () => {
              throw primaryError;
            });

            // Should throw the primary error, not the fallback error
            await expect(fallback.execute(operation)).rejects.toThrow(primaryError);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('abort signal handling', () => {
    it('should abort immediately when signal is already aborted', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(), // return value (never reached)
          async () => {
            const fallback = new Fallback({
              fallback: async () => 'fallback',
            });

            const controller = new AbortController();
            controller.abort();

            const operation = vi.fn(async () => 'success');

            await expect(
              fallback.execute(operation, controller.signal)
            ).rejects.toThrow();

            expect(operation).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should pass signal to primary operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(), // return value
          async (returnValue) => {
            let receivedSignal: AbortSignal | null = null;

            const fallback = new Fallback({
              fallback: async () => 'fallback',
            });

            const operation = vi.fn(async (signal: AbortSignal) => {
              receivedSignal = signal;
              return returnValue;
            });

            const controller = new AbortController();
            await fallback.execute(operation, controller.signal);

            expect(receivedSignal).not.toBeNull();
            expect(receivedSignal).toBe(controller.signal);
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should pass signal to fallback operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }), // error message
          async (errorMessage) => {
            let receivedSignal: AbortSignal | null = null;

            const fallback = new Fallback({
              fallback: async (signal) => {
                receivedSignal = signal;
                return 'fallback';
              },
            });

            const operation = vi.fn(async () => {
              throw new Error(errorMessage);
            });

            const controller = new AbortController();
            await fallback.execute(operation, controller.signal);

            expect(receivedSignal).not.toBeNull();
            expect(receivedSignal).toBe(controller.signal);
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('type preservation', () => {
    it('should preserve return type from primary operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            id: fc.integer(),
            name: fc.string(),
            active: fc.boolean(),
          }),
          async (data) => {
            const fallback = new Fallback<typeof data>({
              fallback: async () => ({ id: 0, name: 'fallback', active: false }),
            });

            const operation = vi.fn(async () => data);

            const result = await fallback.execute(operation);

            expect(result).toEqual(data);
            expect(result.id).toBe(data.id);
            expect(result.name).toBe(data.name);
            expect(result.active).toBe(data.active);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
