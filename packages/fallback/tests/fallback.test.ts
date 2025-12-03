import { describe, it, expect, vi } from 'vitest';
import { Fallback } from '../src/fallback.js';

describe('Fallback', () => {
  describe('initialization', () => {
    it('should require fallback function', () => {
      expect(() => new Fallback<string>({} as any)).toThrow('Fallback function is required');
    });

    it('should accept valid configuration', () => {
      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
      });
      expect(fb).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should return primary result on success', async () => {
      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
      });

      const result = await fb.execute(async () => 'primary');
      expect(result).toBe('primary');
    });

    it('should return fallback result on primary failure', async () => {
      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
      });

      const result = await fb.execute(async () => {
        throw new Error('primary failed');
      });

      expect(result).toBe('fallback');
    });

    it('should pass error to fallback function', async () => {
      const fallback = vi.fn().mockResolvedValue('fallback');
      const fb = new Fallback<string>({ fallback });
      const primaryError = new Error('primary failed');

      await fb.execute(async () => {
        throw primaryError;
      });

      expect(fallback).toHaveBeenCalledWith(expect.any(AbortSignal), primaryError);
    });

    it('should throw original error when fallback fails', async () => {
      const fb = new Fallback<string>({
        fallback: async () => {
          throw new Error('fallback failed');
        },
      });

      await expect(fb.execute(async () => {
        throw new Error('primary failed');
      })).rejects.toThrow('primary failed');
    });

    it('should throw when signal is already aborted', async () => {
      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
      });
      const controller = new AbortController();
      controller.abort();

      await expect(
        fb.execute(async () => 'primary', controller.signal)
      ).rejects.toThrow();
    });

    it('should throw when signal is aborted after primary fails', async () => {
      const controller = new AbortController();
      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
      });

      await expect(fb.execute(async () => {
        controller.abort();
        throw new Error('primary failed');
      }, controller.signal)).rejects.toThrow();
    });

    it('should rethrow non-Error values', async () => {
      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
      });

      await expect(fb.execute(async () => {
        throw 'string error';
      })).rejects.toBe('string error');
    });
  });

  describe('shouldFallback', () => {
    it('should skip fallback when shouldFallback returns false', async () => {
      const fallback = vi.fn().mockResolvedValue('fallback');
      const fb = new Fallback<string>({
        fallback,
        shouldFallback: () => false,
      });

      await expect(fb.execute(async () => {
        throw new Error('primary failed');
      })).rejects.toThrow('primary failed');

      expect(fallback).not.toHaveBeenCalled();
    });

    it('should use fallback when shouldFallback returns true', async () => {
      const fallback = vi.fn().mockResolvedValue('fallback');
      const fb = new Fallback<string>({
        fallback,
        shouldFallback: () => true,
      });

      const result = await fb.execute(async () => {
        throw new Error('primary failed');
      });

      expect(result).toBe('fallback');
      expect(fallback).toHaveBeenCalled();
    });

    it('should receive error in shouldFallback', async () => {
      const shouldFallback = vi.fn().mockReturnValue(true);
      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
        shouldFallback,
      });
      const error = new Error('specific error');

      await fb.execute(async () => {
        throw error;
      });

      expect(shouldFallback).toHaveBeenCalledWith(error);
    });

    it('should filter specific error types', async () => {
      class RetryableError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'RetryableError';
        }
      }

      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
        shouldFallback: (error) => error.name !== 'RetryableError',
      });

      // Should use fallback for regular errors
      const result1 = await fb.execute(async () => {
        throw new Error('regular error');
      });
      expect(result1).toBe('fallback');

      // Should not use fallback for RetryableError
      await expect(fb.execute(async () => {
        throw new RetryableError('retryable');
      })).rejects.toThrow('retryable');
    });
  });

  describe('callbacks', () => {
    it('should call onSuccess when primary succeeds', async () => {
      const onSuccess = vi.fn();
      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
        onSuccess,
      });

      await fb.execute(async () => 'primary');

      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('should not call onSuccess when primary fails', async () => {
      const onSuccess = vi.fn();
      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
        onSuccess,
      });

      await fb.execute(async () => {
        throw new Error('primary failed');
      });

      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('should call onFallback when fallback is triggered', async () => {
      const onFallback = vi.fn();
      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
        onFallback,
      });
      const error = new Error('primary failed');

      await fb.execute(async () => {
        throw error;
      });

      expect(onFallback).toHaveBeenCalledWith(error);
    });

    it('should not call onFallback when primary succeeds', async () => {
      const onFallback = vi.fn();
      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
        onFallback,
      });

      await fb.execute(async () => 'primary');

      expect(onFallback).not.toHaveBeenCalled();
    });

    it('should handle errors in callbacks gracefully', async () => {
      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
        onSuccess: () => {
          throw new Error('callback error');
        },
      });

      // Should not throw even though callback throws
      const result = await fb.execute(async () => 'primary');
      expect(result).toBe('primary');
    });

    it('should handle errors in onFallback gracefully', async () => {
      const fb = new Fallback<string>({
        fallback: async () => 'fallback',
        onFallback: () => {
          throw new Error('callback error');
        },
      });

      const result = await fb.execute(async () => {
        throw new Error('primary failed');
      });

      expect(result).toBe('fallback');
    });
  });

  describe('synchronous fallback', () => {
    it('should work with synchronous fallback function', async () => {
      const fb = new Fallback<string>({
        fallback: () => 'sync fallback',
      });

      const result = await fb.execute(async () => {
        throw new Error('primary failed');
      });

      expect(result).toBe('sync fallback');
    });
  });

  describe('integration', () => {
    it('should provide cached data when API fails', async () => {
      const cache = { data: 'cached value' };

      const fb = new Fallback<string>({
        fallback: async () => cache.data,
      });

      // Simulate API failure
      const result = await fb.execute(async () => {
        throw new Error('Network error');
      });

      expect(result).toBe('cached value');
    });

    it('should use live data when available', async () => {
      const cache = { data: 'cached value' };

      const fb = new Fallback<string>({
        fallback: async () => cache.data,
      });

      // API succeeds
      const result = await fb.execute(async () => 'live data');

      expect(result).toBe('live data');
    });
  });
});
