/**
 * O(1) ring buffer queue implementation.
 *
 * Provides O(1) enqueue and dequeue operations by using a circular buffer
 * with head and tail pointers.
 *
 * @template T - The type of elements in the buffer
 */
export class RingBuffer<T> {
  private readonly buffer: (T | undefined)[];
  private head = 0;
  private tail = 0;
  private count = 0;

  /**
   * Create a new ring buffer.
   *
   * @param capacity - Maximum number of elements the buffer can hold
   */
  constructor(private readonly capacity: number) {
    this.buffer = new Array<T | undefined>(capacity);
  }

  /**
   * Add an element to the end of the buffer.
   *
   * @param item - The item to add
   * @returns true if added, false if buffer is full
   */
  push(item: T): boolean {
    if (this.count >= this.capacity) {
      return false;
    }

    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    this.count++;
    return true;
  }

  /**
   * Remove and return the element at the front of the buffer.
   *
   * @returns The item at the front, or undefined if empty
   */
  shift(): T | undefined {
    if (this.count === 0) {
      return undefined;
    }

    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined; // Help GC
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    return item;
  }

  /**
   * Get the number of elements in the buffer.
   */
  get length(): number {
    return this.count;
  }

  /**
   * Check if the buffer is empty.
   */
  isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Check if the buffer is full.
   */
  isFull(): boolean {
    return this.count >= this.capacity;
  }

  /**
   * Find the index of an item in the buffer.
   * Note: This is O(n) but should be rare (used for abort handling).
   *
   * @param item - The item to find
   * @returns The index of the item, or -1 if not found
   */
  indexOf(item: T): number {
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      if (this.buffer[idx] === item) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Remove an item at the given logical index.
   * Note: This is O(n) due to shifting elements.
   *
   * @param index - The logical index (0 = front of queue)
   * @returns true if item was removed
   */
  removeAt(index: number): boolean {
    if (index < 0 || index >= this.count) {
      return false;
    }

    // Shift elements to fill the gap
    for (let i = index; i < this.count - 1; i++) {
      const fromIdx = (this.head + i + 1) % this.capacity;
      const toIdx = (this.head + i) % this.capacity;
      this.buffer[toIdx] = this.buffer[fromIdx];
    }

    // Clear the last element
    const lastIdx = (this.head + this.count - 1) % this.capacity;
    this.buffer[lastIdx] = undefined;

    // Update tail
    this.tail = (this.tail - 1 + this.capacity) % this.capacity;
    this.count--;
    return true;
  }

  /**
   * Remove an item from the buffer.
   * Note: This is O(n) but should be rare (used for abort handling).
   *
   * @param item - The item to remove
   * @returns true if item was found and removed
   */
  remove(item: T): boolean {
    const index = this.indexOf(item);
    if (index === -1) {
      return false;
    }
    return this.removeAt(index);
  }

  /**
   * Get all items and clear the buffer.
   *
   * @returns Array of all items in queue order
   */
  drain(): T[] {
    const items: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      const item = this.buffer[idx];
      if (item !== undefined) {
        items.push(item);
      }
      this.buffer[idx] = undefined; // Help GC
    }
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    return items;
  }

  /**
   * Clear all elements from the buffer.
   */
  clear(): void {
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      this.buffer[idx] = undefined;
    }
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
}
