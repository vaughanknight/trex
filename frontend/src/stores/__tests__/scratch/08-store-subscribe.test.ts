/**
 * TAD Scratch Test: Zustand Subscribe
 *
 * Exploring: How does subscribe work for external listeners?
 */

import { create } from 'zustand'

describe('scratch: zustand subscribe', () => {
  interface CounterStore {
    count: number
    increment: () => void
  }

  it('should notify subscribers on state change', () => {
    const useCounter = create<CounterStore>((set) => ({
      count: 0,
      increment: () => set((s) => ({ count: s.count + 1 })),
    }))

    const history: number[] = []
    const unsubscribe = useCounter.subscribe((state) => {
      history.push(state.count)
    })

    useCounter.getState().increment()
    useCounter.getState().increment()
    useCounter.getState().increment()

    expect(history).toEqual([1, 2, 3])

    unsubscribe()
    useCounter.getState().increment()

    // No new entries after unsubscribe
    expect(history).toEqual([1, 2, 3])
  })

  it('should support selector-based subscribe with subscribeWithSelector', () => {
    // Note: In Zustand v5, selector-based subscriptions require
    // the subscribeWithSelector middleware or manual comparison.
    // For now, we'll test the basic pattern using manual comparison.
    interface SessionStore {
      activeId: string | null
      count: number
      setActive: (id: string | null) => void
      increment: () => void
    }

    const useStore = create<SessionStore>((set) => ({
      activeId: null,
      count: 0,
      setActive: (id) => set({ activeId: id }),
      increment: () => set((s) => ({ count: s.count + 1 })),
    }))

    const activeIdHistory: (string | null)[] = []
    let prevActiveId: string | null = useStore.getState().activeId

    // Subscribe with manual selector comparison
    const unsubscribe = useStore.subscribe((state) => {
      if (state.activeId !== prevActiveId) {
        prevActiveId = state.activeId
        activeIdHistory.push(state.activeId)
      }
    })

    useStore.getState().setActive('s1')
    useStore.getState().increment() // Should NOT trigger callback (different slice)
    useStore.getState().setActive('s2')
    useStore.getState().increment() // Should NOT trigger
    useStore.getState().setActive('s2') // Same value, should NOT trigger

    expect(activeIdHistory).toEqual(['s1', 's2'])

    unsubscribe()
  })
})
