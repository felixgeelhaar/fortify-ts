/**
 * Token bucket implementation for rate limiting.
 *
 * Uses the token bucket algorithm where tokens are added at a constant rate
 * up to a maximum burst capacity. Each operation consumes one or more tokens.
 */
export class TokenBucket {
  private tokens: number;
  private readonly burst: number;
  private readonly rate: number;
  private readonly intervalMs: number;
  private lastRefill: number;

  /**
   * Create a new token bucket.
   *
   * @param rate - Number of tokens added per interval
   * @param burst - Maximum tokens in the bucket (bucket capacity)
   * @param intervalMs - Time interval in milliseconds for rate replenishment
   */
  constructor(rate: number, burst: number, intervalMs: number) {
    this.rate = rate;
    this.burst = burst;
    this.intervalMs = intervalMs;
    this.tokens = burst; // Start with full bucket
    this.lastRefill = Date.now();
  }

  /**
   * Attempt to take 1 token from the bucket.
   *
   * @returns true if a token was available, false otherwise
   */
  allow(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }

    return false;
  }

  /**
   * Attempt to take n tokens from the bucket.
   *
   * @param n - Number of tokens to take
   * @returns true if n tokens were available, false otherwise
   */
  take(n: number): boolean {
    if (n <= 0) {
      return false;
    }

    this.refill();

    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }

    return false;
  }

  /**
   * Get the duration to wait for at least 1 token to become available.
   *
   * @returns Duration in milliseconds to wait, or 0 if a token is available
   */
  waitTime(): number {
    this.refill();

    if (this.tokens >= 1) {
      return 0;
    }

    // Calculate how many tokens we need
    const tokensNeeded = 1 - this.tokens;

    // Safety check
    if (tokensNeeded <= 0) {
      return 0;
    }

    // Safety check: if rate is 0 or negative
    if (this.rate <= 0) {
      return 24 * 60 * 60 * 1000; // 24 hours in ms
    }

    // Safety check: prevent division by zero
    if (this.intervalMs <= 0) {
      return 24 * 60 * 60 * 1000;
    }

    // Calculate tokens per millisecond
    const tokensPerMs = this.rate / this.intervalMs;

    // Safety check: if tokens per ms is effectively zero
    if (tokensPerMs <= 0) {
      return 24 * 60 * 60 * 1000;
    }

    const msToWait = tokensNeeded / tokensPerMs;

    // Safety check: ensure result is within reasonable bounds
    if (msToWait < 0) {
      return 0;
    }

    // Cap maximum wait time to 24 hours
    const maxWait = 24 * 60 * 60 * 1000;
    return Math.min(msToWait, maxWait);
  }

  /**
   * Refill tokens based on time elapsed since last refill.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed <= 0) {
      return;
    }

    // Cap elapsed time to prevent overflow from clock skew or system sleep
    const cappedElapsed = Math.min(elapsed, 60 * 60 * 1000); // Max 1 hour

    // Calculate tokens to add: (elapsed / interval) * rate
    const tokensToAdd = (cappedElapsed / this.intervalMs) * this.rate;

    this.tokens = Math.min(this.tokens + tokensToAdd, this.burst);
    this.lastRefill = now;
  }
}
