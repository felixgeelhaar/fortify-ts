import { z } from 'zod';
import { type FortifyLogger } from '@fortify-ts/core';
import { type Counts } from './counts.js';
import { type State } from './state.js';

/**
 * Zod schema for CircuitBreaker configuration.
 */
export const circuitBreakerConfigSchema = z.object({
  /** Maximum consecutive failures before opening (default: 5) */
  maxFailures: z.number().int().positive().default(5),
  /** Duration in open state before transitioning to half-open in milliseconds (default: 60000) */
  timeout: z.number().int().positive().default(60000),
  /** Maximum requests allowed in half-open state (default: 1) */
  halfOpenMaxRequests: z.number().int().positive().default(1),
  /** Period to clear counts when closed, 0 means never (default: 0) */
  interval: z.number().int().nonnegative().default(0),
  /** Jitter factor for timeout (0-1), adds randomness to prevent thundering herd (default: 0) */
  timeoutJitter: z.number().min(0).max(1).default(0),
});

/**
 * Raw config input type (before defaults are applied).
 */
export type CircuitBreakerConfigInput = z.input<typeof circuitBreakerConfigSchema>;

/**
 * Parsed config type (after defaults are applied).
 */
export type CircuitBreakerConfigParsed = z.output<typeof circuitBreakerConfigSchema>;

/**
 * Full configuration type including callbacks and logger.
 */
export interface CircuitBreakerConfig extends CircuitBreakerConfigParsed {
  /** Custom function to determine when to trip the breaker */
  readyToTrip: ((counts: Counts) => boolean) | undefined;
  /** Custom function to determine if result is successful */
  isSuccessful: ((error: Error | null) => boolean) | undefined;
  /** Callback on state change */
  onStateChange: ((from: State, to: State) => void) | undefined;
  /** Logger instance for structured logging */
  logger: FortifyLogger | undefined;
}

/**
 * Input config type for constructor.
 */
export interface CircuitBreakerConfigInputFull extends CircuitBreakerConfigInput {
  readyToTrip?: (counts: Counts) => boolean;
  isSuccessful?: (error: Error | null) => boolean;
  onStateChange?: (from: State, to: State) => void;
  logger?: FortifyLogger;
}

/**
 * Parse and validate circuit breaker configuration.
 *
 * @param config - Raw configuration input
 * @returns Validated configuration with defaults applied
 */
export function parseCircuitBreakerConfig(config?: CircuitBreakerConfigInputFull): CircuitBreakerConfig {
  const parsed = circuitBreakerConfigSchema.parse(config ?? {});
  return {
    ...parsed,
    readyToTrip: config?.readyToTrip,
    isSuccessful: config?.isSuccessful,
    onStateChange: config?.onStateChange,
    logger: config?.logger,
  };
}
