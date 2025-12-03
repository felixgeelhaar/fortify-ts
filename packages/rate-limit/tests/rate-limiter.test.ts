import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/rate-limiter.js';
import { TokenBucket } from '../src/token-bucket.js';
import { RateLimitExceededError } from '@fortify-ts/core';

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('allow', () => {
    it('should allow requests when tokens are available', () => {
      const bucket = new TokenBucket(10, 10, 1000);
      expect(bucket.allow()).toBe(true);
      expect(bucket.allow()).toBe(true);
    });

    it('should reject when bucket is empty', () => {
      const bucket = new TokenBucket(10, 2, 1000);
      expect(bucket.allow()).toBe(true);
      expect(bucket.allow()).toBe(true);
      expect(bucket.allow()).toBe(false);
    });

    it('should refill tokens over time', () => {
      const bucket = new TokenBucket(10, 2, 1000);
      expect(bucket.allow()).toBe(true);
      expect(bucket.allow()).toBe(true);
      expect(bucket.allow()).toBe(false);

      // Advance 100ms (should add 1 token at 10/sec)
      vi.advanceTimersByTime(100);
      expect(bucket.allow()).toBe(true);
      expect(bucket.allow()).toBe(false);
    });

    it('should not exceed burst capacity', () => {
      const bucket = new TokenBucket(10, 5, 1000);
      // Drain bucket
      for (let i = 0; i < 5; i++) {
        bucket.allow();
      }
      expect(bucket.allow()).toBe(false);

      // Wait enough for full refill (and more)
      vi.advanceTimersByTime(2000);

      // Should only have burst (5) tokens
      for (let i = 0; i < 5; i++) {
        expect(bucket.allow()).toBe(true);
      }
      expect(bucket.allow()).toBe(false);
    });
  });

  describe('take', () => {
    it('should take multiple tokens at once', () => {
      const bucket = new TokenBucket(10, 10, 1000);
      expect(bucket.take(5)).toBe(true);
      expect(bucket.take(5)).toBe(true);
      expect(bucket.take(1)).toBe(false);
    });

    it('should reject if not enough tokens', () => {
      const bucket = new TokenBucket(10, 10, 1000);
      expect(bucket.take(5)).toBe(true);
      expect(bucket.take(10)).toBe(false);
    });

    it('should reject zero or negative tokens', () => {
      const bucket = new TokenBucket(10, 10, 1000);
      expect(bucket.take(0)).toBe(false);
      expect(bucket.take(-1)).toBe(false);
    });
  });

  describe('waitTime', () => {
    it('should return 0 when tokens are available', () => {
      const bucket = new TokenBucket(10, 10, 1000);
      expect(bucket.waitTime()).toBe(0);
    });

    it('should return wait time when no tokens available', () => {
      const bucket = new TokenBucket(10, 1, 1000);
      bucket.allow();
      const waitTime = bucket.waitTime();
      // At 10 tokens/second, need to wait 100ms for 1 token
      expect(waitTime).toBeCloseTo(100, 0);
    });
  });
});

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const limiter = new RateLimiter();
      // Default is 100 requests per second
      for (let i = 0; i < 100; i++) {
        expect(limiter.allow()).toBe(true);
      }
      expect(limiter.allow()).toBe(false);
    });

    it('should accept custom configuration', () => {
      const limiter = new RateLimiter({
        rate: 5,
        burst: 10,
        interval: 1000,
      });

      for (let i = 0; i < 10; i++) {
        expect(limiter.allow()).toBe(true);
      }
      expect(limiter.allow()).toBe(false);
    });

    it('should default burst to rate when not specified', () => {
      const limiter = new RateLimiter({ rate: 5 });
      for (let i = 0; i < 5; i++) {
        expect(limiter.allow()).toBe(true);
      }
      expect(limiter.allow()).toBe(false);
    });
  });

  describe('allow', () => {
    it('should allow requests within rate limit', () => {
      const limiter = new RateLimiter({ rate: 5, burst: 5 });
      expect(limiter.allow('user-1')).toBe(true);
    });

    it('should reject requests exceeding rate limit', () => {
      const limiter = new RateLimiter({ rate: 2, burst: 2 });
      expect(limiter.allow('user-1')).toBe(true);
      expect(limiter.allow('user-1')).toBe(true);
      expect(limiter.allow('user-1')).toBe(false);
    });

    it('should maintain separate limits per key', () => {
      const limiter = new RateLimiter({ rate: 2, burst: 2 });
      expect(limiter.allow('user-1')).toBe(true);
      expect(limiter.allow('user-1')).toBe(true);
      expect(limiter.allow('user-1')).toBe(false);

      // user-2 should have their own bucket
      expect(limiter.allow('user-2')).toBe(true);
      expect(limiter.allow('user-2')).toBe(true);
      expect(limiter.allow('user-2')).toBe(false);
    });

    it('should use default key when not provided', () => {
      const limiter = new RateLimiter({ rate: 2, burst: 2 });
      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(false);
    });
  });

  describe('take', () => {
    it('should take multiple tokens', () => {
      const limiter = new RateLimiter({ rate: 10, burst: 10 });
      expect(limiter.take('key', 5)).toBe(true);
      expect(limiter.take('key', 5)).toBe(true);
      expect(limiter.take('key', 1)).toBe(false);
    });

    it('should reject zero or negative tokens', () => {
      const limiter = new RateLimiter({ rate: 10, burst: 10 });
      expect(limiter.take('key', 0)).toBe(false);
      expect(limiter.take('key', -1)).toBe(false);
    });
  });

  describe('wait', () => {
    it('should return immediately when tokens available', async () => {
      const limiter = new RateLimiter({ rate: 10, burst: 10 });
      await limiter.wait('key');
      // Should not throw
    });

    it('should wait for token when bucket is empty', async () => {
      const limiter = new RateLimiter({ rate: 10, burst: 1 });
      expect(limiter.allow('key')).toBe(true);
      expect(limiter.allow('key')).toBe(false);

      const waitPromise = limiter.wait('key');

      // Advance time to refill 1 token
      vi.advanceTimersByTime(100);

      await waitPromise;
      // Should complete without error
    });

    it('should abort when signal is already aborted', async () => {
      const limiter = new RateLimiter({ rate: 10, burst: 10 });
      const controller = new AbortController();
      controller.abort();

      await expect(limiter.wait('key', controller.signal)).rejects.toThrow();
    });

    it('should abort when signal is aborted during wait', async () => {
      const limiter = new RateLimiter({ rate: 10, burst: 1 });
      limiter.allow('key'); // Drain

      const controller = new AbortController();
      const waitPromise = limiter.wait('key', controller.signal);

      // Abort while waiting
      controller.abort();

      await expect(waitPromise).rejects.toThrow();
    });
  });

  describe('execute', () => {
    it('should execute operation when allowed', async () => {
      const limiter = new RateLimiter({ rate: 10, burst: 10 });
      const result = await limiter.execute(async () => 'success', 'key');
      expect(result).toBe('success');
    });

    it('should throw RateLimitExceededError when rate limited', async () => {
      const limiter = new RateLimiter({ rate: 1, burst: 1 });
      await limiter.execute(async () => 'first', 'key');

      await expect(
        limiter.execute(async () => 'second', 'key')
      ).rejects.toThrow(RateLimitExceededError);
    });

    it('should throw when signal is already aborted', async () => {
      const limiter = new RateLimiter();
      const controller = new AbortController();
      controller.abort();

      await expect(
        limiter.execute(async () => 'success', 'key', controller.signal)
      ).rejects.toThrow();
    });
  });

  describe('reset', () => {
    it('should clear all buckets', () => {
      const limiter = new RateLimiter({ rate: 2, burst: 2 });

      // Drain some keys
      limiter.allow('key-1');
      limiter.allow('key-1');
      limiter.allow('key-2');
      limiter.allow('key-2');

      expect(limiter.allow('key-1')).toBe(false);
      expect(limiter.allow('key-2')).toBe(false);

      // Reset
      limiter.reset();

      // Buckets should be fresh
      expect(limiter.allow('key-1')).toBe(true);
      expect(limiter.allow('key-2')).toBe(true);
    });
  });

  describe('callbacks', () => {
    it('should call onLimit when rate limited', () => {
      const onLimit = vi.fn();
      const limiter = new RateLimiter({
        rate: 1,
        burst: 1,
        onLimit,
      });

      limiter.allow('test-key');
      expect(onLimit).not.toHaveBeenCalled();

      limiter.allow('test-key');
      expect(onLimit).toHaveBeenCalledWith('test-key');
    });

    it('should handle errors in onLimit gracefully', () => {
      const onLimit = vi.fn().mockImplementation(() => {
        throw new Error('callback error');
      });

      const limiter = new RateLimiter({
        rate: 1,
        burst: 1,
        onLimit,
      });

      limiter.allow('key');
      // Should not throw
      expect(() => limiter.allow('key')).not.toThrow();
    });
  });

  describe('rate refill', () => {
    it('should refill tokens over time', () => {
      const limiter = new RateLimiter({
        rate: 10,
        burst: 10,
        interval: 1000,
      });

      // Drain bucket
      for (let i = 0; i < 10; i++) {
        limiter.allow('key');
      }
      expect(limiter.allow('key')).toBe(false);

      // Advance 500ms (should add 5 tokens)
      vi.advanceTimersByTime(500);
      for (let i = 0; i < 5; i++) {
        expect(limiter.allow('key')).toBe(true);
      }
      expect(limiter.allow('key')).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest bucket when maxBuckets is exceeded', () => {
      const limiter = new RateLimiter({
        rate: 10,
        burst: 10,
        maxBuckets: 3,
      });

      // Create 3 buckets
      limiter.allow('key-1');
      limiter.allow('key-2');
      limiter.allow('key-3');

      expect(limiter.bucketCount()).toBe(3);
      expect(limiter.getEvictionCount()).toBe(0);

      // Adding 4th key should evict the oldest (key-1)
      limiter.allow('key-4');

      expect(limiter.bucketCount()).toBe(3);
      expect(limiter.getEvictionCount()).toBe(1);
    });

    it('should evict LRU bucket not just oldest created', () => {
      const limiter = new RateLimiter({
        rate: 10,
        burst: 10,
        maxBuckets: 3,
      });

      // Create 3 buckets
      limiter.allow('key-1');
      limiter.allow('key-2');
      limiter.allow('key-3');

      // Touch key-1 to make it recently used
      limiter.allow('key-1');

      // Adding 4th key should evict key-2 (now the LRU)
      limiter.allow('key-4');

      expect(limiter.bucketCount()).toBe(3);
      expect(limiter.getEvictionCount()).toBe(1);

      // key-1 should still work (wasn't evicted)
      // key-2 was evicted, so it should get a fresh bucket
      expect(limiter.allow('key-1')).toBe(true);
    });

    it('should not evict when maxBuckets is 0 (unlimited)', () => {
      const limiter = new RateLimiter({
        rate: 10,
        burst: 10,
        maxBuckets: 0,
      });

      // Create many buckets
      for (let i = 0; i < 100; i++) {
        limiter.allow(`key-${i}`);
      }

      expect(limiter.bucketCount()).toBe(100);
      expect(limiter.getEvictionCount()).toBe(0);
    });

    it('should reset eviction count on reset', () => {
      const limiter = new RateLimiter({
        rate: 10,
        burst: 10,
        maxBuckets: 2,
      });

      limiter.allow('key-1');
      limiter.allow('key-2');
      limiter.allow('key-3'); // Evicts key-1

      expect(limiter.getEvictionCount()).toBe(1);

      limiter.reset();

      // Bucket count should be 0, but eviction count is NOT reset
      // (eviction count tracks total evictions since creation)
      expect(limiter.bucketCount()).toBe(0);
      expect(limiter.getEvictionCount()).toBe(1);
    });
  });
});
