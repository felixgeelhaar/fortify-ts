import { bench, describe } from 'vitest';
import { CircuitBreaker } from '../src/circuit-breaker.js';

describe('CircuitBreaker Performance', () => {
  describe('execute - closed state', () => {
    const cb = new CircuitBreaker<string>({
      maxFailures: 1000,
      timeout: 60000,
    });

    bench('successful execution', async () => {
      await cb.execute(async () => 'success');
    });

    bench('execution with signal', async () => {
      await cb.execute(async () => 'success', new AbortController().signal);
    });
  });

  describe('state checks', () => {
    const cb = new CircuitBreaker<string>({
      maxFailures: 1000,
      timeout: 60000,
    });

    bench('state()', () => {
      cb.state();
    });

    bench('getCounts()', () => {
      cb.getCounts();
    });
  });

  describe('construction', () => {
    bench('create with defaults', () => {
      const cb = new CircuitBreaker();
      cb.destroy();
    });

    bench('create with custom config', () => {
      const cb = new CircuitBreaker({
        maxFailures: 10,
        timeout: 30000,
        halfOpenMaxRequests: 3,
        interval: 5000,
        timeoutJitter: 0.1,
      });
      cb.destroy();
    });
  });
});
