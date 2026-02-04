/**
 * FakeStorage - A deterministic localStorage implementation for testing.
 *
 * This fake implements the Storage interface and provides methods to
 * inspect and control storage state deterministically. Per ADR-0004,
 * we use fakes instead of mocking frameworks.
 *
 * Usage:
 * ```ts
 * const storage = new FakeStorage()
 * storage.setItem('key', 'value')
 * expect(storage.getItem('key')).toBe('value')
 *
 * // Inject into Zustand persist
 * create(persist(storeConfig, { storage: createJSONStorage(() => storage) }))
 * ```
 */

export class FakeStorage implements Storage {
  private data: Map<string, string> = new Map()

  /**
   * Returns the number of key/value pairs.
   */
  get length(): number {
    return this.data.size
  }

  /**
   * Returns the name of the nth key, or null if n >= length.
   */
  key(index: number): string | null {
    const keys = Array.from(this.data.keys())
    return keys[index] ?? null
  }

  /**
   * Returns the value associated with the given key, or null if not found.
   */
  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  /**
   * Sets the value for the given key.
   */
  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }

  /**
   * Removes the key/value pair with the given key.
   */
  removeItem(key: string): void {
    this.data.delete(key)
  }

  /**
   * Removes all key/value pairs.
   */
  clear(): void {
    this.data.clear()
  }

  // ==================
  // Test helper methods
  // ==================

  /**
   * Get all stored data as a plain object.
   * Useful for snapshot assertions.
   */
  getAll(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [key, value] of this.data) {
      result[key] = value
    }
    return result
  }

  /**
   * Get all stored data as parsed JSON objects.
   * Useful when storing JSON-serialized data.
   */
  getAllParsed<T = unknown>(): Record<string, T> {
    const result: Record<string, T> = {}
    for (const [key, value] of this.data) {
      try {
        result[key] = JSON.parse(value) as T
      } catch {
        // If not valid JSON, store raw string cast to T
        result[key] = value as unknown as T
      }
    }
    return result
  }

  /**
   * Check if a key exists.
   */
  has(key: string): boolean {
    return this.data.has(key)
  }

  /**
   * Get the keys as an array.
   */
  keys(): string[] {
    return Array.from(this.data.keys())
  }

  /**
   * Pre-populate storage with initial data.
   * Useful for setting up test fixtures.
   */
  populate(data: Record<string, string | object>): void {
    for (const [key, value] of Object.entries(data)) {
      this.data.set(key, typeof value === 'string' ? value : JSON.stringify(value))
    }
  }

  /**
   * Get a JSON-parsed item with type safety.
   */
  getItemParsed<T>(key: string): T | null {
    const value = this.data.get(key)
    if (value === undefined) return null
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }
}

/**
 * Install FakeStorage as the global localStorage for tests.
 * Returns a cleanup function to restore the original.
 */
export function installFakeStorage(): {
  storage: FakeStorage
  restore: () => void
} {
  const storage = new FakeStorage()
  const originalLocalStorage = globalThis.localStorage

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  })

  return {
    storage,
    restore: () => {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      })
    },
  }
}

/**
 * Install FakeStorage as the global sessionStorage for tests.
 * Returns a cleanup function to restore the original.
 */
export function installFakeSessionStorage(): {
  storage: FakeStorage
  restore: () => void
} {
  const storage = new FakeStorage()
  const originalSessionStorage = globalThis.sessionStorage

  Object.defineProperty(globalThis, 'sessionStorage', {
    value: storage,
    writable: true,
    configurable: true,
  })

  return {
    storage,
    restore: () => {
      Object.defineProperty(globalThis, 'sessionStorage', {
        value: originalSessionStorage,
        writable: true,
        configurable: true,
      })
    },
  }
}
