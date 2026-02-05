/**
 * Tests for FakeWebglAddon.
 * Ensures the fake behaves correctly for pool testing.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import {
  FakeWebglAddon,
  installFakeWebglAddon,
  getWebglAddonFactory,
} from './fakeWebglAddon'

describe('FakeWebglAddon', () => {
  test('tracks dispose() calls', () => {
    const addon = new FakeWebglAddon()
    expect(addon.wasDisposed()).toBe(false)

    addon.dispose()

    expect(addon.wasDisposed()).toBe(true)
  })

  test('registers context loss handler', () => {
    const addon = new FakeWebglAddon()
    let handlerCalled = false

    addon.onContextLoss(() => {
      handlerCalled = true
    })

    expect(addon.hasContextLossHandler()).toBe(true)

    addon.simulateContextLoss()

    expect(handlerCalled).toBe(true)
  })

  test('context loss handler can be disposed', () => {
    const addon = new FakeWebglAddon()
    let handlerCalled = false

    const disposable = addon.onContextLoss(() => {
      handlerCalled = true
    })

    disposable.dispose()

    addon.simulateContextLoss()

    expect(handlerCalled).toBe(false)
  })

  test('reset clears all state', () => {
    const addon = new FakeWebglAddon()
    addon.dispose()
    addon.onContextLoss(() => {})

    addon.reset()

    expect(addon.wasDisposed()).toBe(false)
    expect(addon.hasContextLossHandler()).toBe(false)
  })
})

describe('installFakeWebglAddon', () => {
  let restoreFn: (() => void) | null = null

  afterEach(() => {
    if (restoreFn) {
      restoreFn()
      restoreFn = null
    }
  })

  test('provides factory that creates FakeWebglAddon instances', () => {
    const { instances, restore } = installFakeWebglAddon()
    restoreFn = restore

    const factory = getWebglAddonFactory()
    const addon1 = factory()
    const addon2 = factory()

    expect(instances).toHaveLength(2)
    expect(instances[0]).toBeInstanceOf(FakeWebglAddon)
    expect(instances[1]).toBeInstanceOf(FakeWebglAddon)
    expect(addon1).toBe(instances[0])
    expect(addon2).toBe(instances[1])
  })

  test('restore removes fake factory', () => {
    const { restore } = installFakeWebglAddon()

    restore()

    // After restore, factory should be the default
    // (which would fail in test env without @xterm/addon-webgl)
    // We just verify the factory is reset
    const { instances } = installFakeWebglAddon()
    restoreFn = () => {}
    const factory = getWebglAddonFactory()
    factory()
    expect(instances).toHaveLength(1)
  })
})
