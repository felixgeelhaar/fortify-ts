import { bench, describe } from 'vitest';
import { RingBuffer } from '../src/ring-buffer.js';

describe('RingBuffer Performance', () => {
  describe('push/shift operations', () => {
    const buffer = new RingBuffer<number>(10000);

    bench('push', () => {
      if (buffer.isFull()) {
        buffer.shift();
      }
      buffer.push(1);
    });

    bench('shift', () => {
      if (buffer.isEmpty()) {
        buffer.push(1);
      }
      buffer.shift();
    });
  });

  describe('push/shift cycle', () => {
    const buffer = new RingBuffer<number>(1000);

    bench('push then shift', () => {
      buffer.push(1);
      buffer.shift();
    });
  });

  describe('comparison with Array', () => {
    const ringBuffer = new RingBuffer<number>(1000);
    const array: number[] = [];

    // Pre-fill both with 500 items
    for (let i = 0; i < 500; i++) {
      ringBuffer.push(i);
      array.push(i);
    }

    bench('RingBuffer - push then shift', () => {
      ringBuffer.push(1);
      ringBuffer.shift();
    });

    bench('Array - push then shift (O(n))', () => {
      array.push(1);
      array.shift();
    });
  });

  describe('drain operation', () => {
    bench('drain 100 items', () => {
      const buffer = new RingBuffer<number>(100);
      for (let i = 0; i < 100; i++) {
        buffer.push(i);
      }
      buffer.drain();
    });

    bench('drain 1000 items', () => {
      const buffer = new RingBuffer<number>(1000);
      for (let i = 0; i < 1000; i++) {
        buffer.push(i);
      }
      buffer.drain();
    });
  });

  describe('length checks', () => {
    const buffer = new RingBuffer<number>(1000);
    for (let i = 0; i < 500; i++) {
      buffer.push(i);
    }

    bench('length', () => {
      buffer.length;
    });

    bench('isEmpty()', () => {
      buffer.isEmpty();
    });

    bench('isFull()', () => {
      buffer.isFull();
    });
  });
});
