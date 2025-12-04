import { bench, describe } from 'vitest';
import { RateLimiter } from '../src/rate-limiter.js';

describe('RateLimiter Performance', () => {
  describe('allow - single key', () => {
    const limiter = new RateLimiter({
      rate: 1000000, // High rate to avoid limiting
      burst: 1000000,
      interval: 1000,
    });

    bench('allow() - default key', () => {
      limiter.allow();
    });

    bench('allow() - specific key', () => {
      limiter.allow('user-123');
    });
  });

  describe('allow - multiple keys', () => {
    const limiter = new RateLimiter({
      rate: 1000000,
      burst: 1000000,
      interval: 1000,
    });

    // Pre-populate with some keys
    for (let i = 0; i < 100; i++) {
      limiter.allow(`key-${String(i)}`);
    }

    bench('allow() - existing key', () => {
      limiter.allow('key-50');
    });

    bench('allow() - new key', () => {
      limiter.allow(`new-${String(Date.now())}`);
    });
  });

  describe('take operation', () => {
    const limiter = new RateLimiter({
      rate: 1000000,
      burst: 1000000,
      interval: 1000,
    });

    bench('take(key, 1)', () => {
      limiter.take('key', 1);
    });

    bench('take(key, 10)', () => {
      limiter.take('key', 10);
    });
  });

  describe('construction', () => {
    bench('create with defaults', () => {
      new RateLimiter();
    });

    bench('create with custom config', () => {
      new RateLimiter({
        rate: 1000,
        burst: 500,
        interval: 60000,
      });
    });
  });
});
