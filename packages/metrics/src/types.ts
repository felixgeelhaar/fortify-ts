/**
 * Minimal prom-client types to avoid requiring prom-client as a direct dependency.
 */

export interface Registry {
  registerMetric(metric: Metric): void;
  getSingleMetric(name: string): Metric | undefined;
  metrics(): Promise<string>;
  clear(): void;
}

export interface Metric {
  name: string;
}

export interface CounterConfiguration {
  name: string;
  help: string;
  labelNames?: string[];
  registers?: Registry[];
}

export interface Counter extends Metric {
  inc(labels?: Record<string, string | number>, value?: number): void;
  inc(value?: number): void;
  labels(...values: string[]): { inc(value?: number): void };
}

export interface GaugeConfiguration {
  name: string;
  help: string;
  labelNames?: string[];
  registers?: Registry[];
}

export interface Gauge extends Metric {
  set(labels: Record<string, string | number>, value: number): void;
  set(value: number): void;
  inc(labels?: Record<string, string | number>, value?: number): void;
  inc(value?: number): void;
  dec(labels?: Record<string, string | number>, value?: number): void;
  dec(value?: number): void;
  labels(...values: string[]): {
    set(value: number): void;
    inc(value?: number): void;
    dec(value?: number): void;
  };
}

export interface HistogramConfiguration {
  name: string;
  help: string;
  labelNames?: string[];
  buckets?: number[];
  registers?: Registry[];
}

export interface Histogram extends Metric {
  observe(labels: Record<string, string | number>, value: number): void;
  observe(value: number): void;
  labels(...values: string[]): { observe(value: number): void };
  startTimer(labels?: Record<string, string | number>): () => number;
}

/**
 * Label values for metrics.
 */
export type Labels = Record<string, string>;

/**
 * Common label names used across fortify metrics.
 */
export const COMMON_LABELS = {
  /** Pattern name (circuit-breaker, retry, etc.) */
  PATTERN: 'pattern',
  /** Instance name */
  NAME: 'name',
  /** Circuit breaker state */
  STATE: 'state',
  /** Outcome (success, failure, etc.) */
  OUTCOME: 'outcome',
} as const;
