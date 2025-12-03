export {
  type Registry,
  type Metric,
  type Counter,
  type Gauge,
  type Histogram,
  type Labels,
  COMMON_LABELS,
} from './types.js';

export {
  type MetricsCollector,
  type MetricsCollectorConfig,
  type PromClientFactories,
  DEFAULT_DURATION_BUCKETS,
  DEFAULT_ATTEMPT_BUCKETS,
  createMetricsCollector,
} from './collector.js';
