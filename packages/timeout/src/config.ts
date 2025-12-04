import { z } from 'zod';
import { type FortifyLogger } from '@fortify-ts/core';

/**
 * Zod schema for Timeout configuration.
 */
export const timeoutConfigSchema = z.object({
  /** Default timeout in milliseconds (default: 30000) */
  defaultTimeout: z.number().int().positive().default(30000),
  /** Callback when timeout occurs */
  onTimeout: z.function().optional(),
});

/**
 * Raw config input type (before defaults are applied).
 */
export type TimeoutConfigInput = z.input<typeof timeoutConfigSchema>;

/**
 * Parsed config type (after defaults are applied).
 */
export type TimeoutConfigParsed = z.output<typeof timeoutConfigSchema>;

/**
 * Full configuration type including logger.
 */
export interface TimeoutConfig extends TimeoutConfigParsed {
  /** Logger instance for structured logging */
  logger: FortifyLogger | undefined;
}

/**
 * Parse and validate timeout configuration.
 *
 * @param config - Raw configuration input
 * @returns Validated configuration with defaults applied
 */
export function parseTimeoutConfig(config?: TimeoutConfigInput & { logger?: FortifyLogger }): TimeoutConfig {
  const parsed = timeoutConfigSchema.parse(config ?? {});
  return {
    ...parsed,
    logger: config?.logger,
  };
}
