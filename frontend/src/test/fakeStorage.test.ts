/**
 * FakeStorage Tests
 *
 * These tests verify that FakeStorage correctly implements the Storage
 * interface and provides deterministic testing capabilities.
 */

import { FakeStorage, installFakeStorage } from './fakeStorage'

describe('FakeStorage', () => {
  /**
   * Test: Storage should start empty
   *
   * Behavior: New FakeStorage has no items
   * Fixture: new FakeStorage()
   * Assertion: length === 0
   */
  it('should start empty', () => {
    const storage = new FakeStorage()
    expect(storage.length).toBe(0)
    expect(storage.keys()).toEqual([])
  })

  /**
   * Test: setItem and getItem should work correctly
   *
   * Behavior: Setting an item makes it retrievable
   * Fixture: setItem('key', 'value')
   * Assertion: getItem('key') === 'value'
   */
  it('should set and get items', () => {
    const storage = new FakeStorage()

    storage.setItem('theme', 'dark')
    storage.setItem('fontSize', '14')

    expect(storage.getItem('theme')).toBe('dark')
    expect(storage.getItem('fontSize')).toBe('14')
    expect(storage.length).toBe(2)
  })

  /**
   * Test: getItem should return null for missing keys
   *
   * Behavior: Non-existent keys return null (not undefined)
   * Fixture: Empty storage
   * Assertion: getItem('missing') === null
   */
  it('should return null for missing keys', () => {
    const storage = new FakeStorage()

    expect(storage.getItem('missing')).toBeNull()
  })

  /**
   * Test: removeItem should delete items
   *
   * Behavior: Removing an item makes it no longer retrievable
   * Fixture: Storage with item, then removeItem
   * Assertion: getItem returns null, length decremented
   */
  it('should remove items', () => {
    const storage = new FakeStorage()
    storage.setItem('key', 'value')

    expect(storage.has('key')).toBe(true)

    storage.removeItem('key')

    expect(storage.getItem('key')).toBeNull()
    expect(storage.has('key')).toBe(false)
    expect(storage.length).toBe(0)
  })

  /**
   * Test: clear should remove all items
   *
   * Behavior: Clear empties the storage completely
   * Fixture: Storage with multiple items
   * Assertion: length === 0 after clear
   */
  it('should clear all items', () => {
    const storage = new FakeStorage()
    storage.setItem('a', '1')
    storage.setItem('b', '2')
    storage.setItem('c', '3')

    expect(storage.length).toBe(3)

    storage.clear()

    expect(storage.length).toBe(0)
    expect(storage.keys()).toEqual([])
  })

  /**
   * Test: key(index) should return the nth key
   *
   * Behavior: key() provides indexed access to keys
   * Fixture: Storage with multiple items
   * Assertion: key(0) and key(1) return valid keys
   */
  it('should return key by index', () => {
    const storage = new FakeStorage()
    storage.setItem('first', '1')
    storage.setItem('second', '2')

    // Note: Map iteration order is insertion order
    expect(storage.key(0)).toBe('first')
    expect(storage.key(1)).toBe('second')
    expect(storage.key(2)).toBeNull()
  })

  /**
   * Test: getAll should return all data as plain object
   *
   * Behavior: Helper method returns snapshot of all data
   * Fixture: Storage with multiple items
   * Assertion: Returns object with all key/value pairs
   */
  it('should get all items as object', () => {
    const storage = new FakeStorage()
    storage.setItem('theme', 'dark')
    storage.setItem('fontSize', '14')

    expect(storage.getAll()).toEqual({
      theme: 'dark',
      fontSize: '14',
    })
  })

  /**
   * Test: populate should pre-fill storage
   *
   * Behavior: populate() sets up test fixtures easily
   * Fixture: Empty storage, populate with data
   * Assertion: All populated items are retrievable
   */
  it('should populate from object', () => {
    const storage = new FakeStorage()

    storage.populate({
      theme: 'dark',
      settings: { fontSize: 14, fontFamily: 'Monaco' },
    })

    expect(storage.getItem('theme')).toBe('dark')
    expect(storage.getItem('settings')).toBe(
      '{"fontSize":14,"fontFamily":"Monaco"}'
    )
  })

  /**
   * Test: getItemParsed should return parsed JSON
   *
   * Behavior: Helper parses JSON-stored values
   * Fixture: Storage with JSON-serialized object
   * Assertion: Returns parsed object with correct types
   */
  it('should parse JSON items', () => {
    const storage = new FakeStorage()
    storage.setItem(
      'settings',
      JSON.stringify({ theme: 'dark', fontSize: 14 })
    )

    const parsed = storage.getItemParsed<{ theme: string; fontSize: number }>(
      'settings'
    )

    expect(parsed).toEqual({ theme: 'dark', fontSize: 14 })
    expect(parsed?.fontSize).toBe(14)
  })

  /**
   * Test: getAllParsed should return all items parsed
   *
   * Behavior: Helper parses all JSON values in storage
   * Fixture: Storage with multiple JSON values
   * Assertion: Returns object with all parsed values
   */
  it('should get all items parsed', () => {
    const storage = new FakeStorage()
    storage.setItem('a', JSON.stringify({ x: 1 }))
    storage.setItem('b', JSON.stringify({ y: 2 }))

    expect(storage.getAllParsed()).toEqual({
      a: { x: 1 },
      b: { y: 2 },
    })
  })

  /**
   * Test: setItem should overwrite existing values
   *
   * Behavior: Setting same key updates the value
   * Fixture: setItem twice with same key
   * Assertion: Latest value is stored
   */
  it('should overwrite existing values', () => {
    const storage = new FakeStorage()
    storage.setItem('key', 'old')
    storage.setItem('key', 'new')

    expect(storage.getItem('key')).toBe('new')
    expect(storage.length).toBe(1)
  })
})

describe('installFakeStorage', () => {
  /**
   * Test: installFakeStorage should replace global localStorage
   *
   * Behavior: Install replaces localStorage, restore brings it back
   * Fixture: Install fake storage
   * Assertion: localStorage operations use fake, restore works
   */
  it('should replace global localStorage', () => {
    const { storage, restore } = installFakeStorage()

    try {
      localStorage.setItem('test', 'value')
      expect(storage.getItem('test')).toBe('value')
      expect(localStorage.getItem('test')).toBe('value')
    } finally {
      restore()
    }
  })
})
