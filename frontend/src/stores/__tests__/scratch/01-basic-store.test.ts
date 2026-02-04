/**
 * TAD Scratch Test: Basic Zustand Store
 *
 * Exploring: Can we create a simple store and read/write state?
 */

import { create } from 'zustand'

describe('scratch: basic zustand store', () => {
  it('should create a store with initial state', () => {
    interface CounterStore {
      count: number
      increment: () => void
    }

    const useCounter = create<CounterStore>((set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }))

    // Get state without hooks (for testing)
    const state = useCounter.getState()
    expect(state.count).toBe(0)
  })

  it('should update state when actions called', () => {
    interface CounterStore {
      count: number
      increment: () => void
    }

    const useCounter = create<CounterStore>((set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
    }))

    useCounter.getState().increment()
    expect(useCounter.getState().count).toBe(1)

    useCounter.getState().increment()
    expect(useCounter.getState().count).toBe(2)
  })

  it('should support multiple values in state', () => {
    interface UIStore {
      sidebarOpen: boolean
      activeTab: string
      toggleSidebar: () => void
      setActiveTab: (tab: string) => void
    }

    const useUI = create<UIStore>((set) => ({
      sidebarOpen: true,
      activeTab: 'home',
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setActiveTab: (tab) => set({ activeTab: tab }),
    }))

    expect(useUI.getState().sidebarOpen).toBe(true)
    expect(useUI.getState().activeTab).toBe('home')

    useUI.getState().toggleSidebar()
    expect(useUI.getState().sidebarOpen).toBe(false)

    useUI.getState().setActiveTab('settings')
    expect(useUI.getState().activeTab).toBe('settings')
  })
})
