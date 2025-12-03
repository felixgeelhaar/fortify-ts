/**
 * A Promise-based semaphore for limiting concurrent operations.
 */
export class Semaphore {
  private permits: number;
  private readonly maxPermits: number;
  private readonly waitingQueue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  /**
   * Create a new semaphore.
   *
   * @param maxPermits - Maximum number of concurrent permits
   */
  constructor(maxPermits: number) {
    this.maxPermits = maxPermits;
    this.permits = maxPermits;
  }

  /**
   * Try to acquire a permit without waiting.
   *
   * @returns true if a permit was acquired, false otherwise
   */
  tryAcquire(): boolean {
    if (this.permits > 0) {
      this.permits--;
      return true;
    }
    return false;
  }

  /**
   * Acquire a permit, waiting if necessary.
   *
   * @param signal - Optional AbortSignal for cancellation
   * @returns Promise that resolves when permit is acquired
   * @throws {DOMException} When cancelled via signal (AbortError)
   */
  acquire(signal?: AbortSignal): Promise<void> {
    // Check if cancelled
    if (signal?.aborted) {
      return Promise.reject(
        signal.reason ?? new DOMException('Aborted', 'AbortError')
      );
    }

    // Try to acquire immediately
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    // Add to wait queue
    return new Promise<void>((resolve, reject) => {
      const waiter = { resolve, reject };
      this.waitingQueue.push(waiter);

      // Set up abort handler
      if (signal) {
        const onAbort = () => {
          const index = this.waitingQueue.indexOf(waiter);
          if (index !== -1) {
            this.waitingQueue.splice(index, 1);
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
          }
        };

        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  /**
   * Release a permit back to the semaphore.
   */
  release(): void {
    if (this.waitingQueue.length > 0) {
      // Give permit to next waiter
      const waiter = this.waitingQueue.shift();
      waiter?.resolve();
    } else if (this.permits < this.maxPermits) {
      // Return permit to pool
      this.permits++;
    }
  }

  /**
   * Get the number of available permits.
   */
  availablePermits(): number {
    return this.permits;
  }

  /**
   * Get the number of waiters in the queue.
   */
  queueLength(): number {
    return this.waitingQueue.length;
  }

  /**
   * Reject all waiters with the given error.
   */
  rejectAll(error: Error): void {
    const waiters = this.waitingQueue.splice(0, this.waitingQueue.length);
    for (const waiter of waiters) {
      waiter.reject(error);
    }
  }
}
