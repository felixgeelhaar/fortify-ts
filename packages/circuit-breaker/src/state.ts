import { z } from 'zod';

/**
 * Circuit breaker states.
 */
export const stateSchema = z.enum(['closed', 'open', 'half-open']);
export type State = z.infer<typeof stateSchema>;

/**
 * Circuit breaker state constants.
 */
export const States = {
  CLOSED: 'closed' as const,
  OPEN: 'open' as const,
  HALF_OPEN: 'half-open' as const,
} as const;
