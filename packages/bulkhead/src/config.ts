import { z } from 'zod';
import { type FortifyLogger } from '@fortify-ts/core';

/**
 * Zod schema for Bulkhead configuration.
 */
export const bulkheadConfigSchema = z.object({
  /** Maximum number of concurrent executions allowed (default: 10) */
  maxConcurrent: z.number().int().positive().default(10),
  /** Maximum size of overflow queue, 0 means no queue (default: 0) */
  maxQueue: z.number().int().nonnegative().default(0),
  /** Maximum time a request can wait in queue in milliseconds, 0 means no timeout (default: 0) */
  queueTimeout: z.number().int().nonnegative().default(0),
});

/**
 * Raw config input type (before defaults are applied).
 */
export type BulkheadConfigInput = z.input<typeof bulkheadConfigSchema>;

/**
 * Parsed config type (after defaults are applied).
 */
export type BulkheadConfigParsed = z.output<typeof bulkheadConfigSchema>;

/**
 * Full configuration type including callbacks and logger.
 */
export interface BulkheadConfig extends BulkheadConfigParsed {
  /** Callback when a request is rejected */
  onRejected: (() => void) | undefined;
  /** Logger instance for structured logging */
  logger: FortifyLogger | undefined;
}

/**
 * Input config type for constructor.
 */
export interface BulkheadConfigInputFull extends BulkheadConfigInput {
  onRejected?: () => void;
  logger?: FortifyLogger;
}

/**
 * Parse and validate bulkhead configuration.
 *
 * @param config - Raw configuration input
 * @returns Validated configuration with defaults applied
 */
export function parseBulkheadConfig(config?: BulkheadConfigInputFull): BulkheadConfig {
  const parsed = bulkheadConfigSchema.parse(config ?? {});
  return {
    ...parsed,
    onRejected: config?.onRejected,
    logger: config?.logger,
  };
}
