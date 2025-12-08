import { describe, it, expect } from 'vitest';
import {
  bucketStateSchema,
  validateBucketState,
  sanitizeStorageKey,
  MemoryStorage,
  type BucketState,
} from '../src/storage.js';

describe('bucketStateSchema', () => {
  it('should accept valid bucket state', () => {
    const state = { tokens: 100, lastRefill: Date.now() };
    const result = bucketStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });

  it('should accept zero tokens', () => {
    const state = { tokens: 0, lastRefill: Date.now() };
    const result = bucketStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });

  it('should reject negative tokens', () => {
    const state = { tokens: -1, lastRefill: Date.now() };
    const result = bucketStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });

  it('should reject tokens exceeding maximum', () => {
    const state = { tokens: 1_000_000_001, lastRefill: Date.now() };
    const result = bucketStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });

  it('should reject negative lastRefill', () => {
    const state = { tokens: 100, lastRefill: -1 };
    const result = bucketStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });

  it('should reject lastRefill exceeding maximum timestamp', () => {
    const state = { tokens: 100, lastRefill: 4_102_444_800_001 };
    const result = bucketStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });

  it('should reject non-integer lastRefill', () => {
    const state = { tokens: 100, lastRefill: 1000.5 };
    const result = bucketStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });

  it('should reject missing tokens', () => {
    const state = { lastRefill: Date.now() };
    const result = bucketStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });

  it('should reject missing lastRefill', () => {
    const state = { tokens: 100 };
    const result = bucketStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });
});

describe('validateBucketState', () => {
  it('should return validated state for valid data', () => {
    const data = { tokens: 50, lastRefill: 1000000 };
    const result = validateBucketState(data);
    expect(result).toEqual(data);
  });

  it('should return null for invalid data', () => {
    const result = validateBucketState({ tokens: -1, lastRefill: 1000 });
    expect(result).toBeNull();
  });

  it('should return null for null input', () => {
    const result = validateBucketState(null);
    expect(result).toBeNull();
  });

  it('should return null for undefined input', () => {
    const result = validateBucketState(undefined);
    expect(result).toBeNull();
  });

  it('should return null for string input', () => {
    const result = validateBucketState('invalid');
    expect(result).toBeNull();
  });

  it('should return null for array input', () => {
    const result = validateBucketState([1, 2, 3]);
    expect(result).toBeNull();
  });

  it('should handle malicious __proto__ injection', () => {
    // This tests that Zod's parsing doesn't allow prototype pollution
    const malicious = JSON.parse('{"tokens": 100, "lastRefill": 1000, "__proto__": {"polluted": true}}');
    const result = validateBucketState(malicious);
    // Should still parse correctly (Zod ignores extra properties)
    expect(result).toEqual({ tokens: 100, lastRefill: 1000 });
    // Verify no pollution occurred
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('sanitizeStorageKey', () => {
  it('should pass through simple alphanumeric keys', () => {
    expect(sanitizeStorageKey('user123')).toBe('user123');
  });

  it('should allow dashes', () => {
    expect(sanitizeStorageKey('user-123')).toBe('user-123');
  });

  it('should allow underscores', () => {
    expect(sanitizeStorageKey('user_123')).toBe('user_123');
  });

  it('should allow dots', () => {
    expect(sanitizeStorageKey('user.123')).toBe('user.123');
  });

  it('should allow colons', () => {
    expect(sanitizeStorageKey('rate:limit:user')).toBe('rate:limit:user');
  });

  it('should allow at symbols', () => {
    expect(sanitizeStorageKey('user@example.com')).toBe('user@example.com');
  });

  it('should replace forward slashes with underscores', () => {
    expect(sanitizeStorageKey('path/to/key')).toBe('path_to_key');
  });

  it('should replace backslashes with underscores', () => {
    expect(sanitizeStorageKey('path\\to\\key')).toBe('path_to_key');
  });

  it('should remove null bytes', () => {
    expect(sanitizeStorageKey('user\x00123')).toBe('user123');
  });

  it('should remove control characters', () => {
    expect(sanitizeStorageKey('user\x01\x02\x03key')).toBe('userkey');
  });

  it('should remove DEL character', () => {
    expect(sanitizeStorageKey('user\x7fkey')).toBe('userkey');
  });

  it('should truncate keys longer than 256 characters', () => {
    const longKey = 'a'.repeat(300);
    const result = sanitizeStorageKey(longKey);
    expect(result.length).toBe(256);
    expect(result).toBe('a'.repeat(256));
  });

  it('should handle empty string', () => {
    expect(sanitizeStorageKey('')).toBe('');
  });

  it('should handle combined dangerous characters', () => {
    expect(sanitizeStorageKey('path/to\x00/key\x01\x02')).toBe('path_to_key');
  });

  it('should prevent path traversal attacks', () => {
    expect(sanitizeStorageKey('../../../etc/passwd')).toBe('.._.._.._etc_passwd');
  });
});

describe('MemoryStorage', () => {
  describe('basic operations', () => {
    it('should store and retrieve bucket state', async () => {
      const storage = new MemoryStorage();
      const state: BucketState = { tokens: 100, lastRefill: Date.now() };

      await storage.set('key1', state);
      const retrieved = await storage.get('key1');

      expect(retrieved).toEqual(state);
    });

    it('should return null for non-existent key', async () => {
      const storage = new MemoryStorage();
      const result = await storage.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should delete entries', async () => {
      const storage = new MemoryStorage();
      const state: BucketState = { tokens: 100, lastRefill: Date.now() };

      await storage.set('key1', state);
      await storage.delete('key1');
      const result = await storage.get('key1');

      expect(result).toBeNull();
    });

    it('should clear all entries', async () => {
      const storage = new MemoryStorage();

      await storage.set('key1', { tokens: 100, lastRefill: 1000 });
      await storage.set('key2', { tokens: 200, lastRefill: 2000 });
      await storage.clear();

      expect(await storage.get('key1')).toBeNull();
      expect(await storage.get('key2')).toBeNull();
      expect(storage.size()).toBe(0);
    });

    it('should track size correctly', async () => {
      const storage = new MemoryStorage();

      expect(storage.size()).toBe(0);
      await storage.set('key1', { tokens: 100, lastRefill: 1000 });
      expect(storage.size()).toBe(1);
      await storage.set('key2', { tokens: 200, lastRefill: 2000 });
      expect(storage.size()).toBe(2);
      await storage.delete('key1');
      expect(storage.size()).toBe(1);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when maxEntries exceeded', async () => {
      const storage = new MemoryStorage({ maxEntries: 3 });

      await storage.set('key1', { tokens: 100, lastRefill: 1000 });
      await storage.set('key2', { tokens: 200, lastRefill: 2000 });
      await storage.set('key3', { tokens: 300, lastRefill: 3000 });
      await storage.set('key4', { tokens: 400, lastRefill: 4000 });

      // key1 should be evicted (oldest)
      expect(await storage.get('key1')).toBeNull();
      expect(await storage.get('key2')).not.toBeNull();
      expect(await storage.get('key3')).not.toBeNull();
      expect(await storage.get('key4')).not.toBeNull();
      expect(storage.size()).toBe(3);
    });

    it('should track eviction count', async () => {
      const storage = new MemoryStorage({ maxEntries: 2 });

      expect(storage.getEvictionCount()).toBe(0);

      await storage.set('key1', { tokens: 100, lastRefill: 1000 });
      await storage.set('key2', { tokens: 200, lastRefill: 2000 });
      expect(storage.getEvictionCount()).toBe(0);

      await storage.set('key3', { tokens: 300, lastRefill: 3000 });
      expect(storage.getEvictionCount()).toBe(1);

      await storage.set('key4', { tokens: 400, lastRefill: 4000 });
      expect(storage.getEvictionCount()).toBe(2);
    });

    it('should update LRU order on get (touch)', async () => {
      const storage = new MemoryStorage({ maxEntries: 3 });

      await storage.set('key1', { tokens: 100, lastRefill: 1000 });
      await storage.set('key2', { tokens: 200, lastRefill: 2000 });
      await storage.set('key3', { tokens: 300, lastRefill: 3000 });

      // Touch key1 to make it recently used
      await storage.get('key1');

      // Add key4, key2 should be evicted (now oldest)
      await storage.set('key4', { tokens: 400, lastRefill: 4000 });

      expect(await storage.get('key1')).not.toBeNull();
      expect(await storage.get('key2')).toBeNull();
      expect(await storage.get('key3')).not.toBeNull();
      expect(await storage.get('key4')).not.toBeNull();
    });

    it('should update entry without eviction if key exists', async () => {
      const storage = new MemoryStorage({ maxEntries: 2 });

      await storage.set('key1', { tokens: 100, lastRefill: 1000 });
      await storage.set('key2', { tokens: 200, lastRefill: 2000 });

      // Update existing key
      await storage.set('key1', { tokens: 150, lastRefill: 1500 });

      expect(storage.size()).toBe(2);
      expect(storage.getEvictionCount()).toBe(0);
      expect(await storage.get('key1')).toEqual({ tokens: 150, lastRefill: 1500 });
    });

    it('should not evict when maxEntries is 0 (unlimited)', async () => {
      const storage = new MemoryStorage({ maxEntries: 0 });

      for (let i = 0; i < 100; i++) {
        await storage.set(`key${i}`, { tokens: i, lastRefill: i * 1000 });
      }

      expect(storage.size()).toBe(100);
      expect(storage.getEvictionCount()).toBe(0);
    });
  });

  describe('compareAndSet', () => {
    it('should update when expected matches current', async () => {
      const storage = new MemoryStorage();
      const initial: BucketState = { tokens: 100, lastRefill: 1000 };
      const updated: BucketState = { tokens: 90, lastRefill: 2000 };

      await storage.set('key1', initial);
      const result = await storage.compareAndSet('key1', initial, updated);

      expect(result.success).toBe(true);
      expect(result.currentState).toEqual(updated);
      expect(await storage.get('key1')).toEqual(updated);
    });

    it('should fail when expected does not match current', async () => {
      const storage = new MemoryStorage();
      const initial: BucketState = { tokens: 100, lastRefill: 1000 };
      const stale: BucketState = { tokens: 50, lastRefill: 500 };
      const updated: BucketState = { tokens: 90, lastRefill: 2000 };

      await storage.set('key1', initial);
      const result = await storage.compareAndSet('key1', stale, updated);

      expect(result.success).toBe(false);
      expect(result.currentState).toEqual(initial);
      expect(await storage.get('key1')).toEqual(initial);
    });

    it('should succeed when both expected and current are null', async () => {
      const storage = new MemoryStorage();
      const newState: BucketState = { tokens: 100, lastRefill: 1000 };

      const result = await storage.compareAndSet('key1', null, newState);

      expect(result.success).toBe(true);
      expect(result.currentState).toEqual(newState);
      expect(await storage.get('key1')).toEqual(newState);
    });

    it('should fail when expected is null but key exists', async () => {
      const storage = new MemoryStorage();
      const existing: BucketState = { tokens: 100, lastRefill: 1000 };
      const newState: BucketState = { tokens: 50, lastRefill: 2000 };

      await storage.set('key1', existing);
      const result = await storage.compareAndSet('key1', null, newState);

      expect(result.success).toBe(false);
      expect(result.currentState).toEqual(existing);
    });

    it('should fail when expected is set but key does not exist', async () => {
      const storage = new MemoryStorage();
      const expected: BucketState = { tokens: 100, lastRefill: 1000 };
      const newState: BucketState = { tokens: 50, lastRefill: 2000 };

      const result = await storage.compareAndSet('key1', expected, newState);

      expect(result.success).toBe(false);
      expect(result.currentState).toBeNull();
    });
  });

  describe('sync methods', () => {
    it('getSync should work correctly', () => {
      const storage = new MemoryStorage();
      const state: BucketState = { tokens: 100, lastRefill: 1000 };

      storage.setSync('key1', state);
      expect(storage.getSync('key1')).toEqual(state);
    });

    it('getSync should return null for non-existent key', () => {
      const storage = new MemoryStorage();
      expect(storage.getSync('nonexistent')).toBeNull();
    });

    it('deleteSync should work correctly', () => {
      const storage = new MemoryStorage();
      const state: BucketState = { tokens: 100, lastRefill: 1000 };

      storage.setSync('key1', state);
      storage.deleteSync('key1');
      expect(storage.getSync('key1')).toBeNull();
    });

    it('clearSync should work correctly', () => {
      const storage = new MemoryStorage();

      storage.setSync('key1', { tokens: 100, lastRefill: 1000 });
      storage.setSync('key2', { tokens: 200, lastRefill: 2000 });
      storage.clearSync();

      expect(storage.size()).toBe(0);
    });
  });

  describe('default options', () => {
    it('should use default maxEntries of 10000', async () => {
      const storage = new MemoryStorage();

      // Add 10001 entries
      for (let i = 0; i < 10001; i++) {
        await storage.set(`key${i}`, { tokens: i, lastRefill: i * 1000 });
      }

      expect(storage.size()).toBe(10000);
      expect(storage.getEvictionCount()).toBe(1);
    });
  });
});
