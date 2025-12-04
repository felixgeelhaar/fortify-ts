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
 * Mutates the counts object in place for performance.
 *
 * @param counts - The counts object to update
 * @returns The same counts object (for chaining)
 */
export function recordSuccess(counts: Counts): Counts {
  counts.requests++;
  counts.totalSuccesses++;
  counts.consecutiveSuccesses++;
  counts.consecutiveFailures = 0;
  return counts;
}

/**
 * Record a failed execution.
 * Mutates the counts object in place for performance.
 *
 * @param counts - The counts object to update
 * @returns The same counts object (for chaining)
 */
export function recordFailure(counts: Counts): Counts {
  counts.requests++;
  counts.totalFailures++;
  counts.consecutiveSuccesses = 0;
  counts.consecutiveFailures++;
  return counts;
}
