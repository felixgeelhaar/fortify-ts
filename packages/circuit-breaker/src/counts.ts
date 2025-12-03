import { z } from 'zod';

/**
 * Zod schema for circuit breaker counts/metrics.
 */
export const countsSchema = z.object({
  /** Total requests since last reset */
  requests: z.number().int().nonnegative(),
  /** Total successes since last reset */
  totalSuccesses: z.number().int().nonnegative(),
  /** Total failures since last reset */
  totalFailures: z.number().int().nonnegative(),
  /** Consecutive successes */
  consecutiveSuccesses: z.number().int().nonnegative(),
  /** Consecutive failures */
  consecutiveFailures: z.number().int().nonnegative(),
});

export type Counts = z.infer<typeof countsSchema>;

/**
 * Create a new empty counts object.
 */
export function createCounts(): Counts {
  return {
    requests: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
  };
}

/**
 * Record a successful execution.
 */
export function recordSuccess(counts: Counts): Counts {
  return {
    requests: counts.requests + 1,
    totalSuccesses: counts.totalSuccesses + 1,
    totalFailures: counts.totalFailures,
    consecutiveSuccesses: counts.consecutiveSuccesses + 1,
    consecutiveFailures: 0,
  };
}

/**
 * Record a failed execution.
 */
export function recordFailure(counts: Counts): Counts {
  return {
    requests: counts.requests + 1,
    totalSuccesses: counts.totalSuccesses,
    totalFailures: counts.totalFailures + 1,
    consecutiveSuccesses: 0,
    consecutiveFailures: counts.consecutiveFailures + 1,
  };
}
