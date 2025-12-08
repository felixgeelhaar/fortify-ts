# ADR-002: Operation Type with AbortSignal

## Status

Accepted

## Context

All resilience patterns need to wrap and execute asynchronous operations. We needed a consistent type signature for operations that:

1. Supports async/await patterns
2. Enables cancellation (timeout, circuit breaker trips, manual abort)
3. Works in both Node.js and browser environments
4. Integrates with existing APIs (fetch, etc.)

## Decision

We defined the **Operation type** as a function that accepts an `AbortSignal` and returns a `Promise`:

```typescript
type Operation<T> = (signal: AbortSignal) => Promise<T>;
```

All patterns implement the **Pattern interface**:

```typescript
interface Pattern<T> {
  execute(operation: Operation<T>, signal?: AbortSignal): Promise<T>;
}
```

### Signal Handling

- Patterns create internal `AbortController` instances for their own cancellation needs
- External signals are combined with internal signals using `combineSignals()` utility
- Operations receive a combined signal that aborts when any source aborts
- Node 20+ `AbortSignal.any()` is used when available, with a polyfill for older environments

## Consequences

### Positive

- **Cancellation support**: Operations can be cancelled at any time via AbortController
- **Composability**: Signals can be combined when patterns are chained
- **Standard API**: AbortSignal is a web standard supported in all modern environments
- **Fetch integration**: Works seamlessly with `fetch()` which accepts AbortSignal
- **Resource cleanup**: Cancelled operations can clean up resources immediately

### Negative

- **Boilerplate**: Operations must accept and respect the signal parameter
- **Learning curve**: Developers unfamiliar with AbortSignal need to learn the pattern
- **Incomplete cancellation**: Some operations (CPU-bound) cannot be truly cancelled

### Neutral

- Operations that don't need cancellation can ignore the signal parameter
- The signal is always provided, even if no external signal was passed (internal patterns may create one)

## Alternatives Considered

### Callback-based API

```typescript
type Operation<T> = (callback: (err: Error | null, result?: T) => void) => void;
```

**Rejected because:**
- Doesn't integrate well with async/await
- More complex error handling
- No built-in cancellation mechanism

### Promise without Signal

```typescript
type Operation<T> = () => Promise<T>;
```

**Rejected because:**
- No way to cancel running operations
- Timeout patterns would need to race promises, wasting resources
- Cannot clean up resources on cancellation

### Custom Cancellation Token

```typescript
interface CancellationToken {
  isCancelled: boolean;
  onCancel(callback: () => void): void;
}
type Operation<T> = (token: CancellationToken) => Promise<T>;
```

**Rejected because:**
- Non-standard, requires users to learn a custom API
- Doesn't integrate with fetch or other standard APIs
- AbortSignal is the established standard for this purpose

## Examples

### Basic Usage

```typescript
const retry = new Retry({ maxAttempts: 3 });

const result = await retry.execute(async (signal) => {
  return fetch('/api/data', { signal });
});
```

### Manual Cancellation

```typescript
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  await pattern.execute(operation, controller.signal);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Operation was cancelled');
  }
}
```

### Combined Signals

```typescript
// Internal implementation combines external signal with timeout
const combined = combineSignals(externalSignal, timeoutController.signal);
return operation(combined);
```
