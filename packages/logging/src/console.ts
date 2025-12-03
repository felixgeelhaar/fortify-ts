import { type FortifyLogger, type LogContext } from './logger.js';

/**
 * Console logger configuration.
 */
export interface ConsoleLoggerConfig {
  /** Minimum log level to output */
  level?: 'debug' | 'info' | 'warn' | 'error';
  /** Whether to include timestamps */
  timestamps?: boolean;
  /** Whether to output as JSON */
  json?: boolean;
  /** Custom prefix for log messages */
  prefix?: string;
}

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

/**
 * Create a console-based logger.
 *
 * Browser-friendly logger that outputs to console.
 *
 * @param config - Logger configuration
 * @returns Console logger instance
 */
export function createConsoleLogger(config: ConsoleLoggerConfig = {}): FortifyLogger {
  const level = config.level ?? 'info';
  const timestamps = config.timestamps ?? true;
  const json = config.json ?? false;
  const prefix = config.prefix ?? '';

  const minLevel = LOG_LEVELS[level];
  const boundContext: LogContext = {};

  function shouldLog(logLevel: keyof typeof LOG_LEVELS): boolean {
    return LOG_LEVELS[logLevel] >= minLevel;
  }

  function formatMessage(
    logLevel: string,
    msg: string,
    context?: LogContext
  ): string | object {
    const timestamp = timestamps ? new Date().toISOString() : undefined;
    const mergedContext = { ...boundContext, ...context };

    if (json) {
      return {
        level: logLevel,
        ...(timestamp ? { timestamp } : {}),
        ...(prefix ? { prefix } : {}),
        msg,
        ...(Object.keys(mergedContext).length > 0 ? mergedContext : {}),
      };
    }

    const parts: string[] = [];
    if (timestamp) {
      parts.push(`[${timestamp}]`);
    }
    if (prefix) {
      parts.push(`[${prefix}]`);
    }
    parts.push(`[${logLevel.toUpperCase()}]`);
    parts.push(msg);

    if (Object.keys(mergedContext).length > 0) {
      parts.push(JSON.stringify(mergedContext));
    }

    return parts.join(' ');
  }

  function createChildLogger(additionalBindings: LogContext): FortifyLogger {
    const childConfig: ConsoleLoggerConfig = {
      level,
      timestamps,
      json,
      prefix,
    };
    const childLogger = createConsoleLogger(childConfig);

    // Merge bindings
    Object.assign(
      (childLogger as unknown as { boundContext: LogContext }).boundContext ?? {},
      boundContext,
      additionalBindings
    );

    return childLogger;
  }

  const logger: FortifyLogger = {
    debug(msg: string, context?: LogContext): void {
      if (shouldLog('debug')) {
        const output = formatMessage('debug', msg, context);
        // eslint-disable-next-line no-console
        console.debug(json ? JSON.stringify(output) : output);
      }
    },

    info(msg: string, context?: LogContext): void {
      if (shouldLog('info')) {
        const output = formatMessage('info', msg, context);
        // eslint-disable-next-line no-console
        console.info(json ? JSON.stringify(output) : output);
      }
    },

    warn(msg: string, context?: LogContext): void {
      if (shouldLog('warn')) {
        const output = formatMessage('warn', msg, context);
        // eslint-disable-next-line no-console
        console.warn(json ? JSON.stringify(output) : output);
      }
    },

    error(msg: string, context?: LogContext): void {
      if (shouldLog('error')) {
        const output = formatMessage('error', msg, context);
        // eslint-disable-next-line no-console
        console.error(json ? JSON.stringify(output) : output);
      }
    },

    child(bindings: LogContext): FortifyLogger {
      return createChildLogger(bindings);
    },
  };

  // Store bound context for internal use
  (logger as unknown as { boundContext: LogContext }).boundContext = boundContext;

  return logger;
}
