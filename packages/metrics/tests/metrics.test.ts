import { describe, it, expect, beforeEach } from 'vitest';
import * as promClient from 'prom-client';
import {
  createMetricsCollector,
  DEFAULT_DURATION_BUCKETS,
  DEFAULT_ATTEMPT_BUCKETS,
} from '../src/index.js';

describe('createMetricsCollector', () => {
  let registry: promClient.Registry;

  beforeEach(() => {
    registry = new promClient.Registry();
  });

  it('should create all circuit breaker metrics', () => {
    const metrics = createMetricsCollector(promClient, { registry });

    expect(metrics.circuitBreakerState).toBeDefined();
    expect(metrics.circuitBreakerRequests).toBeDefined();
    expect(metrics.circuitBreakerSuccesses).toBeDefined();
    expect(metrics.circuitBreakerFailures).toBeDefined();
    expect(metrics.circuitBreakerStateChanges).toBeDefined();
  });

  it('should create all retry metrics', () => {
    const metrics = createMetricsCollector(promClient, { registry });

    expect(metrics.retryAttempts).toBeDefined();
    expect(metrics.retrySuccesses).toBeDefined();
    expect(metrics.retryFailures).toBeDefined();
    expect(metrics.retryDuration).toBeDefined();
  });

  it('should create all rate limit metrics', () => {
    const metrics = createMetricsCollector(promClient, { registry });

    expect(metrics.rateLimitAllowed).toBeDefined();
    expect(metrics.rateLimitDenied).toBeDefined();
    expect(metrics.rateLimitWaitTime).toBeDefined();
  });

  it('should create all timeout metrics', () => {
    const metrics = createMetricsCollector(promClient, { registry });

    expect(metrics.timeoutExecutions).toBeDefined();
    expect(metrics.timeoutExceeded).toBeDefined();
    expect(metrics.timeoutDuration).toBeDefined();
  });

  it('should create all bulkhead metrics', () => {
    const metrics = createMetricsCollector(promClient, { registry });

    expect(metrics.bulkheadActive).toBeDefined();
    expect(metrics.bulkheadQueued).toBeDefined();
    expect(metrics.bulkheadRejected).toBeDefined();
    expect(metrics.bulkheadSuccesses).toBeDefined();
    expect(metrics.bulkheadFailures).toBeDefined();
    expect(metrics.bulkheadDuration).toBeDefined();
  });

  it('should create all fallback metrics', () => {
    const metrics = createMetricsCollector(promClient, { registry });

    expect(metrics.fallbackExecutions).toBeDefined();
    expect(metrics.fallbackActivated).toBeDefined();
  });

  it('should use default prefix', async () => {
    const metrics = createMetricsCollector(promClient, { registry });

    // Increment a metric
    metrics.circuitBreakerRequests.inc({ name: 'test' });

    // Get metrics output
    const output = await registry.metrics();
    expect(output).toContain('fortify_circuit_breaker_requests_total');
  });

  it('should use custom prefix', async () => {
    const metrics = createMetricsCollector(promClient, {
      registry,
      prefix: 'myapp_',
    });

    metrics.circuitBreakerRequests.inc({ name: 'test' });

    const output = await registry.metrics();
    expect(output).toContain('myapp_circuit_breaker_requests_total');
  });

  it('should register metrics with provided registry', async () => {
    createMetricsCollector(promClient, { registry });

    const output = await registry.metrics();
    expect(output).toContain('fortify_');
  });

  describe('Circuit Breaker metrics', () => {
    it('should track circuit breaker state', async () => {
      const metrics = createMetricsCollector(promClient, { registry });

      // Set state (0=closed, 1=open, 2=half-open)
      metrics.circuitBreakerState.set({ name: 'api-breaker' }, 1);

      const output = await registry.metrics();
      expect(output).toContain('fortify_circuit_breaker_state{name="api-breaker"} 1');
    });

    it('should count requests', async () => {
      const metrics = createMetricsCollector(promClient, { registry });

      metrics.circuitBreakerRequests.inc({ name: 'api-breaker' });
      metrics.circuitBreakerRequests.inc({ name: 'api-breaker' });

      const output = await registry.metrics();
      expect(output).toContain('fortify_circuit_breaker_requests_total{name="api-breaker"} 2');
    });

    it('should track state changes with from/to labels', async () => {
      const metrics = createMetricsCollector(promClient, { registry });

      metrics.circuitBreakerStateChanges.inc({
        name: 'api-breaker',
        from: 'closed',
        to: 'open',
      });

      const output = await registry.metrics();
      expect(output).toContain('from="closed"');
      expect(output).toContain('to="open"');
    });
  });

  describe('Retry metrics', () => {
    it('should record retry attempts histogram', async () => {
      const metrics = createMetricsCollector(promClient, { registry });

      metrics.retryAttempts.observe({ name: 'api-retry', outcome: 'success' }, 3);

      const output = await registry.metrics();
      expect(output).toContain('fortify_retry_attempts_bucket');
    });

    it('should record retry duration', async () => {
      const metrics = createMetricsCollector(promClient, { registry });

      metrics.retryDuration.observe({ name: 'api-retry', outcome: 'success' }, 0.5);

      const output = await registry.metrics();
      expect(output).toContain('fortify_retry_duration_seconds_bucket');
    });
  });

  describe('Rate Limit metrics', () => {
    it('should count allowed and denied requests', async () => {
      const metrics = createMetricsCollector(promClient, { registry });

      metrics.rateLimitAllowed.inc({ name: 'api-limiter', key: 'user-123' });
      metrics.rateLimitDenied.inc({ name: 'api-limiter', key: 'user-456' });

      const output = await registry.metrics();
      expect(output).toContain('fortify_rate_limit_allowed_total');
      expect(output).toContain('fortify_rate_limit_denied_total');
    });

    it('should track wait time', async () => {
      const metrics = createMetricsCollector(promClient, { registry });

      metrics.rateLimitWaitTime.observe({ name: 'api-limiter', key: 'user-123' }, 0.1);

      const output = await registry.metrics();
      expect(output).toContain('fortify_rate_limit_wait_seconds_bucket');
    });
  });

  describe('Timeout metrics', () => {
    it('should count executions and timeouts', async () => {
      const metrics = createMetricsCollector(promClient, { registry });

      metrics.timeoutExecutions.inc({ name: 'api-timeout' });
      metrics.timeoutExceeded.inc({ name: 'api-timeout' });

      const output = await registry.metrics();
      expect(output).toContain('fortify_timeout_executions_total');
      expect(output).toContain('fortify_timeout_exceeded_total');
    });

    it('should track duration', async () => {
      const metrics = createMetricsCollector(promClient, { registry });

      metrics.timeoutDuration.observe({ name: 'api-timeout', outcome: 'success' }, 0.25);

      const output = await registry.metrics();
      expect(output).toContain('fortify_timeout_duration_seconds_bucket');
    });
  });

  describe('Bulkhead metrics', () => {
    it('should track active and queued counts', async () => {
      const metrics = createMetricsCollector(promClient, { registry });

      metrics.bulkheadActive.set({ name: 'api-bulkhead' }, 5);
      metrics.bulkheadQueued.set({ name: 'api-bulkhead' }, 2);

      const output = await registry.metrics();
      expect(output).toContain('fortify_bulkhead_active{name="api-bulkhead"} 5');
      expect(output).toContain('fortify_bulkhead_queued{name="api-bulkhead"} 2');
    });

    it('should count rejections', async () => {
      const metrics = createMetricsCollector(promClient, { registry });

      metrics.bulkheadRejected.inc({ name: 'api-bulkhead' });

      const output = await registry.metrics();
      expect(output).toContain('fortify_bulkhead_rejected_total');
    });
  });

  describe('Fallback metrics', () => {
    it('should count executions and activations', async () => {
      const metrics = createMetricsCollector(promClient, { registry });

      metrics.fallbackExecutions.inc({ name: 'api-fallback' });
      metrics.fallbackActivated.inc({ name: 'api-fallback' });

      const output = await registry.metrics();
      expect(output).toContain('fortify_fallback_executions_total');
      expect(output).toContain('fortify_fallback_activated_total');
    });
  });
});

describe('Default buckets', () => {
  it('should have sensible duration buckets', () => {
    expect(DEFAULT_DURATION_BUCKETS).toContain(0.01);
    expect(DEFAULT_DURATION_BUCKETS).toContain(0.1);
    expect(DEFAULT_DURATION_BUCKETS).toContain(1);
    expect(DEFAULT_DURATION_BUCKETS).toContain(10);
  });

  it('should have sensible attempt buckets', () => {
    expect(DEFAULT_ATTEMPT_BUCKETS).toContain(1);
    expect(DEFAULT_ATTEMPT_BUCKETS).toContain(3);
    expect(DEFAULT_ATTEMPT_BUCKETS).toContain(5);
  });
});
