/**
 * TAD Scratch Test: Store Isolation Between Tests
 *
 * Exploring: How to ensure stores don't leak between tests
 * This is important for test reliability
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { FakeStorage } from '../../../test/fakeStorage'

describe('scratch: store isolation', () => {
  it('should create independent store instances', () => {
    interface CounterStore {
      count: number
      increment: () => void
    }

    // Factory function for independent instances
    const createCounterStore = () =>
      create<CounterStore>((set) => ({
        count: 0,
        increment: () => set((s) => ({ count: s.count + 1 })),
      }))

    const store1 = createCounterStore()
    const store2 = createCounterStore()

    store1.getState().increment()
    store1.getState().increment()
    store1.getState().increment()

    expect(store1.getState().count).toBe(3)
    expect(store2.getState().count).toBe(0) // Independent
  })

  it('should isolate persisted stores with different storage instances', async () => {
    interface SettingsStore {
      theme: string
      setTheme: (t: string) => void
    }

    const createSettingsStore = (storage: FakeStorage) =>
      create<SettingsStore>()(
        persist(
          (set) => ({
            theme: 'light',
            setTheme: (theme) => set({ theme }),
          }),
          {
            name: 'settings',
            storage: createJSONStorage(() => storage),
          }
        )
      )

    const storage1 = new FakeStorage()
    const storage2 = new FakeStorage()

    const store1 = createSettingsStore(storage1)
    const store2 = createSettingsStore(storage2)

    store1.getState().setTheme('dark')
    await new Promise((r) => setTimeout(r, 0))

    expect(store1.getState().theme).toBe('dark')
    expect(store2.getState().theme).toBe('light') // Isolated

    expect(storage1.getItem('settings')).toContain('dark')
    expect(storage2.getItem('settings')).toBeNull() // Separate storage
  })

  it('should allow resetting store state for test cleanup', () => {
    interface Store {
      value: number
      setValue: (v: number) => void
    }

    const useStore = create<Store>((set) => ({
      value: 0,
      setValue: (v) => set({ value: v }),
    }))

    // Simulate test usage
    useStore.getState().setValue(42)
    expect(useStore.getState().value).toBe(42)

    // Reset for next test (using setState with replace)
    useStore.setState(
      {
        value: 0,
        setValue: useStore.getState().setValue,
      },
      true
    )

    expect(useStore.getState().value).toBe(0)
  })
})
