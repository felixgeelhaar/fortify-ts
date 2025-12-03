import {
  type Operation,
  type Pattern,
  type Resettable,
  BulkheadFullError,
  type FortifyLogger,
  noopLogger,
  sleep,
} from '@fortify-ts/core';
import {
  type BulkheadConfig,
  type BulkheadConfigInputFull,
  parseBulkheadConfig,
} from './config.js';
import { Semaphore } from './semaphore.js';

/**
 * Bulkhead pattern implementation for limiting concurrent operations.
 *
 * Prevents resource exhaustion by limiting the number of concurrent executions,
 * with optional queueing for overflow requests.
 *
 * @template T - The return type of operations
 *
 * @example
 * ```typescript
 * const bulkhead = new Bulkhead<Response>({
 *   maxConcurrent: 5,
 *   maxQueue: 10,
 *   queueTimeout: 5000,
 *   onRejected: () => console.log('Request rejected'),
 * });
 *
 * const result = await bulkhead.execute(async (signal) => {
 *   return fetch('/api/data', { signal });
 * });
 * ```
 */
export class Bulkhead<T> implements Pattern<T>, Resettable {
  private readonly config: BulkheadConfig;
  private readonly logger: FortifyLogger;
  private readonly semaphore: Semaphore;
  private readonly queueSemaphore: Semaphore | undefined;
  private closed = false;

  /**
   * Create a new Bulkhead instance.
   *
   * @param config - Bulkhead configuration
   */
  constructor(config?: BulkheadConfigInputFull) {
    this.config = parseBulkheadConfig(config);
    this.logger = this.config.logger ?? noopLogger;
    this.semaphore = new Semaphore(this.config.maxConcurrent);

    // Only create queue semaphore if maxQueue > 0
    if (this.config.maxQueue > 0) {
      this.queueSemaphore = new Semaphore(this.config.maxQueue);
    }
  }

  /**
   * Execute an operation within the bulkhead's concurrency limits.
   *
   * @param operation - The async operation to execute
   * @param signal - Optional AbortSignal for cancellation
   * @returns Promise resolving to the operation result
   * @throws {BulkheadFullError} When bulkhead is at capacity and queue is full
   * @throws {DOMException} When cancelled via signal (AbortError)
   */
  async execute(operation: Operation<T>, signal?: AbortSignal): Promise<T> {
    // Check if closed
    if (this.closed) {
      throw new BulkheadFullError();
    }

    // Check if cancelled
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }

    // Try to acquire semaphore immediately
    if (this.semaphore.tryAcquire()) {
      return this.executeWithPermit(operation, signal);
    }

    // Bulkhead full, try to queue
    return this.enqueue(operation, signal);
  }

  /**
   * Get the number of currently active executions.
   */
  activeCount(): number {
    return this.config.maxConcurrent - this.semaphore.availablePermits();
  }

  /**
   * Get the number of requests currently waiting in the queue.
   */
  queuedCount(): number {
    return this.semaphore.queueLength();
  }

  /**
   * Close the bulkhead, rejecting all pending requests.
   */
  close(): void {
    if (this.closed) return;

    this.closed = true;
    this.semaphore.rejectAll(new BulkheadFullError());
    this.queueSemaphore?.rejectAll(new BulkheadFullError());
    this.logger.info('Bulkhead closed');
  }

  /**
   * Reset the bulkhead to accept new requests.
   */
  reset(): void {
    this.closed = false;
    this.logger.info('Bulkhead reset');
  }

  /**
   * Execute operation with semaphore permit held.
   */
  private async executeWithPermit(
    operation: Operation<T>,
    signal?: AbortSignal
  ): Promise<T> {
    try {
      return await operation(signal ?? new AbortController().signal);
    } finally {
      this.semaphore.release();
    }
  }

  /**
   * Attempt to queue the request when bulkhead is full.
   */
  private async enqueue(
    operation: Operation<T>,
    signal?: AbortSignal
  ): Promise<T> {
    // If no queue configured, reject immediately
    if (this.config.maxQueue === 0) {
      this.onRejected();
      throw new BulkheadFullError();
    }

    // Try to acquire queue slot
    if (!this.queueSemaphore?.tryAcquire()) {
      // Queue is full, reject
      this.onRejected();
      throw new BulkheadFullError();
    }

    try {
      // Create combined signal for queue timeout
      let timeoutController: AbortController | undefined;
      let combinedSignal = signal;

      if (this.config.queueTimeout > 0) {
        timeoutController = new AbortController();

        // Create combined signal
        if (signal) {
          combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
        } else {
          combinedSignal = timeoutController.signal;
        }

        // Start timeout
        sleep(this.config.queueTimeout).then(() => {
          timeoutController?.abort(new DOMException('Queue timeout', 'TimeoutError'));
        });
      }

      // Wait for execution semaphore
      try {
        await this.semaphore.acquire(combinedSignal);
      } catch (error) {
        // If aborted due to queue timeout, call onRejected
        if (
          error instanceof DOMException &&
          error.name === 'TimeoutError'
        ) {
          this.onRejected();
        }
        throw error;
      }

      // Got permit, execute
      return await this.executeWithPermit(operation, signal);
    } finally {
      this.queueSemaphore?.release();
    }
  }

  /**
   * Handle rejection event.
   */
  private onRejected(): void {
    this.logger.warn('Bulkhead rejection', {
      maxConcurrent: this.config.maxConcurrent,
      maxQueue: this.config.maxQueue,
    });

    if (this.config.onRejected) {
      try {
        this.config.onRejected();
      } catch (error) {
        this.logger.error('onRejected callback threw an error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
