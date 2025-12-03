/**
 * Minimal OpenTelemetry types to avoid requiring @opentelemetry/api as a direct dependency.
 */

/**
 * Span kind enumeration.
 */
export enum SpanKind {
  INTERNAL = 0,
  SERVER = 1,
  CLIENT = 2,
  PRODUCER = 3,
  CONSUMER = 4,
}

/**
 * Span status code.
 */
export enum SpanStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2,
}

/**
 * Attribute value types.
 */
export type AttributeValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>;

/**
 * Attributes (key-value pairs).
 */
export type Attributes = Record<string, AttributeValue>;

/**
 * Span interface (minimal).
 */
export interface Span {
  setAttribute(key: string, value: AttributeValue): this;
  setAttributes(attributes: Attributes): this;
  setStatus(status: { code: SpanStatusCode; message?: string }): this;
  recordException(exception: Error): void;
  end(endTime?: number): void;
  isRecording(): boolean;
}

/**
 * Tracer interface (minimal).
 */
export interface Tracer {
  startSpan(
    name: string,
    options?: {
      kind?: SpanKind;
      attributes?: Attributes;
    }
  ): Span;
}

/**
 * Tracing configuration.
 */
export interface TracingConfig {
  /** OpenTelemetry tracer instance */
  tracer: Tracer;
  /** Prefix for span names */
  spanNamePrefix?: string;
}

/**
 * Attribute keys for fortify patterns.
 */
export const FORTIFY_ATTRIBUTES = {
  // Common
  PATTERN: 'fortify.pattern',
  NAME: 'fortify.name',

  // Circuit Breaker
  CB_STATE: 'fortify.circuit_breaker.state',
  CB_FAILURE_COUNT: 'fortify.circuit_breaker.failure_count',
  CB_SUCCESS_COUNT: 'fortify.circuit_breaker.success_count',

  // Retry
  RETRY_ATTEMPT: 'fortify.retry.attempt',
  RETRY_MAX_ATTEMPTS: 'fortify.retry.max_attempts',
  RETRY_DELAY_MS: 'fortify.retry.delay_ms',

  // Rate Limiter
  RATE_LIMIT_KEY: 'fortify.rate_limit.key',
  RATE_LIMIT_ALLOWED: 'fortify.rate_limit.allowed',
  RATE_LIMIT_WAIT_MS: 'fortify.rate_limit.wait_ms',

  // Timeout
  TIMEOUT_DURATION_MS: 'fortify.timeout.duration_ms',
  TIMEOUT_EXCEEDED: 'fortify.timeout.exceeded',

  // Bulkhead
  BULKHEAD_ACTIVE_COUNT: 'fortify.bulkhead.active_count',
  BULKHEAD_QUEUED_COUNT: 'fortify.bulkhead.queued_count',
  BULKHEAD_MAX_CONCURRENT: 'fortify.bulkhead.max_concurrent',

  // Fallback
  FALLBACK_ACTIVATED: 'fortify.fallback.activated',
  FALLBACK_REASON: 'fortify.fallback.reason',
} as const;
