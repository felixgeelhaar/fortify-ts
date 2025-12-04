import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { RingBuffer } from '../src/ring-buffer.js';

describe('RingBuffer Property-Based Tests', () => {
  describe('FIFO ordering', () => {
    it('should maintain FIFO order for any sequence of operations', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 0, maxLength: 100 }),
          (items) => {
            const buffer = new RingBuffer<number>(items.length + 1);

            // Push all items
            for (const item of items) {
              buffer.push(item);
            }

            // Shift all items and verify order
            const result: number[] = [];
            let item = buffer.shift();
            while (item !== undefined) {
              result.push(item);
              item = buffer.shift();
            }

            expect(result).toEqual(items);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('capacity constraints', () => {
    it('should never exceed capacity', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }), // capacity
          fc.array(fc.integer(), { minLength: 0, maxLength: 100 }), // items to push
          (capacity, items) => {
            const buffer = new RingBuffer<number>(capacity);

            let pushCount = 0;
            for (const item of items) {
              if (buffer.push(item)) {
                pushCount++;
              }
            }

            expect(pushCount).toBeLessThanOrEqual(capacity);
            expect(buffer.length).toBeLessThanOrEqual(capacity);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('length invariants', () => {
    it('should maintain correct length through operations', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 50 }), // capacity
          fc.array(
            fc.record({
              op: fc.constantFrom('push', 'shift'),
              value: fc.integer(),
            }),
            { minLength: 0, maxLength: 100 }
          ),
          (capacity, operations) => {
            const buffer = new RingBuffer<number>(capacity);
            let expectedLength = 0;

            for (const { op, value } of operations) {
              if (op === 'push') {
                if (buffer.push(value)) {
                  expectedLength++;
                }
              } else if (op === 'shift') {
                if (buffer.shift() !== undefined) {
                  expectedLength--;
                }
              }

              expect(buffer.length).toBe(expectedLength);
              expect(buffer.isEmpty()).toBe(expectedLength === 0);
              expect(buffer.isFull()).toBe(expectedLength >= capacity);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('wrap-around correctness', () => {
    it('should handle wrap-around correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 20 }), // capacity
          fc.integer({ min: 5, max: 50 }), // number of cycles
          (capacity, cycles) => {
            const buffer = new RingBuffer<number>(capacity);
            let nextValue = 0;
            const allValues: number[] = [];

            // Perform multiple fill/partial-drain cycles
            for (let cycle = 0; cycle < cycles; cycle++) {
              // Fill to capacity
              while (!buffer.isFull()) {
                buffer.push(nextValue);
                allValues.push(nextValue);
                nextValue++;
              }

              // Drain half
              const toDrain = Math.floor(capacity / 2);
              for (let i = 0; i < toDrain; i++) {
                const expected = allValues.shift();
                const actual = buffer.shift();
                expect(actual).toBe(expected);
              }
            }

            // Verify remaining items
            while (!buffer.isEmpty()) {
              const expected = allValues.shift();
              const actual = buffer.shift();
              expect(actual).toBe(expected);
            }

            expect(allValues.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('drain operation', () => {
    it('should drain all items in correct order', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }), // capacity
          fc.array(fc.string(), { minLength: 0, maxLength: 50 }),
          (capacity, items) => {
            const buffer = new RingBuffer<string>(capacity);
            const pushed: string[] = [];

            // Push items up to capacity
            for (const item of items) {
              if (buffer.push(item)) {
                pushed.push(item);
              }
            }

            // Drain should return all items in order
            const drained = buffer.drain();
            expect(drained).toEqual(pushed);
            expect(buffer.isEmpty()).toBe(true);
            expect(buffer.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('remove operation', () => {
    it('should correctly remove items from any position', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 20 }), // capacity
          fc.integer({ min: 3, max: 15 }), // number of items
          fc.integer({ min: 0 }),          // item to remove (index mod length)
          (capacity, numItems, removeIndex) => {
            const actualItems = Math.min(numItems, capacity);
            if (actualItems < 2) return; // Need at least 2 items

            const buffer = new RingBuffer<number>(capacity);
            const items: number[] = [];

            // Push items
            for (let i = 0; i < actualItems; i++) {
              buffer.push(i);
              items.push(i);
            }

            // Remove an item
            const indexToRemove = removeIndex % items.length;
            const itemToRemove = items[indexToRemove];

            expect(buffer.remove(itemToRemove)).toBe(true);
            items.splice(indexToRemove, 1);

            // Verify remaining items
            const remaining: number[] = [];
            while (!buffer.isEmpty()) {
              const item = buffer.shift();
              if (item !== undefined) {
                remaining.push(item);
              }
            }

            expect(remaining).toEqual(items);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
