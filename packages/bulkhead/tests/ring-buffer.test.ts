import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../src/ring-buffer.js';

describe('RingBuffer', () => {
  describe('basic operations', () => {
    it('should initialize with correct capacity', () => {
      const buffer = new RingBuffer<number>(5);
      expect(buffer.length).toBe(0);
      expect(buffer.isEmpty()).toBe(true);
      expect(buffer.isFull()).toBe(false);
    });

    it('should push items', () => {
      const buffer = new RingBuffer<number>(3);
      expect(buffer.push(1)).toBe(true);
      expect(buffer.push(2)).toBe(true);
      expect(buffer.push(3)).toBe(true);
      expect(buffer.length).toBe(3);
      expect(buffer.isFull()).toBe(true);
    });

    it('should reject push when full', () => {
      const buffer = new RingBuffer<number>(2);
      buffer.push(1);
      buffer.push(2);
      expect(buffer.push(3)).toBe(false);
      expect(buffer.length).toBe(2);
    });

    it('should shift items in FIFO order', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.shift()).toBe(1);
      expect(buffer.shift()).toBe(2);
      expect(buffer.shift()).toBe(3);
      expect(buffer.shift()).toBeUndefined();
      expect(buffer.isEmpty()).toBe(true);
    });

    it('should handle wrap-around correctly', () => {
      const buffer = new RingBuffer<number>(3);

      // Fill buffer
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      // Remove first two
      expect(buffer.shift()).toBe(1);
      expect(buffer.shift()).toBe(2);

      // Add two more (causes wrap-around)
      buffer.push(4);
      buffer.push(5);

      // Should get remaining items in order
      expect(buffer.shift()).toBe(3);
      expect(buffer.shift()).toBe(4);
      expect(buffer.shift()).toBe(5);
      expect(buffer.isEmpty()).toBe(true);
    });
  });

  describe('indexOf and remove', () => {
    it('should find item index', () => {
      const buffer = new RingBuffer<string>(5);
      buffer.push('a');
      buffer.push('b');
      buffer.push('c');

      expect(buffer.indexOf('a')).toBe(0);
      expect(buffer.indexOf('b')).toBe(1);
      expect(buffer.indexOf('c')).toBe(2);
      expect(buffer.indexOf('d')).toBe(-1);
    });

    it('should find index after wrap-around', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.shift(); // Remove 1
      buffer.push(4); // Now: [2, 3, 4] with wrap-around

      expect(buffer.indexOf(2)).toBe(0);
      expect(buffer.indexOf(3)).toBe(1);
      expect(buffer.indexOf(4)).toBe(2);
    });

    it('should remove item', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.remove(2)).toBe(true);
      expect(buffer.length).toBe(2);
      expect(buffer.shift()).toBe(1);
      expect(buffer.shift()).toBe(3);
    });

    it('should remove item with wrap-around', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.shift(); // Remove 1
      buffer.push(4); // Now: [2, 3, 4] with wrap-around

      expect(buffer.remove(3)).toBe(true);
      expect(buffer.length).toBe(2);
      expect(buffer.shift()).toBe(2);
      expect(buffer.shift()).toBe(4);
    });

    it('should return false for non-existent item', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      expect(buffer.remove(99)).toBe(false);
      expect(buffer.length).toBe(1);
    });
  });

  describe('drain and clear', () => {
    it('should drain all items', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      const items = buffer.drain();
      expect(items).toEqual([1, 2, 3]);
      expect(buffer.isEmpty()).toBe(true);
    });

    it('should drain items with wrap-around', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.shift();
      buffer.push(4);

      const items = buffer.drain();
      expect(items).toEqual([2, 3, 4]);
      expect(buffer.isEmpty()).toBe(true);
    });

    it('should clear buffer', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.clear();

      expect(buffer.isEmpty()).toBe(true);
      expect(buffer.length).toBe(0);
    });
  });

  describe('object reference tracking', () => {
    it('should track and remove object references correctly', () => {
      interface Waiter {
        id: number;
        resolve: () => void;
      }

      const buffer = new RingBuffer<Waiter>(5);
      const waiter1: Waiter = { id: 1, resolve: () => {} };
      const waiter2: Waiter = { id: 2, resolve: () => {} };
      const waiter3: Waiter = { id: 3, resolve: () => {} };

      buffer.push(waiter1);
      buffer.push(waiter2);
      buffer.push(waiter3);

      // Remove by reference
      expect(buffer.remove(waiter2)).toBe(true);
      expect(buffer.length).toBe(2);

      // Verify remaining items
      expect(buffer.shift()).toBe(waiter1);
      expect(buffer.shift()).toBe(waiter3);
    });
  });
});
