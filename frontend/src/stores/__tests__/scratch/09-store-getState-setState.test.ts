/**
 * TAD Scratch Test: Zustand getState and setState
 *
 * Exploring: Direct state access patterns outside of React
 */

import { create } from 'zustand'

describe('scratch: getState and setState', () => {
  interface Store {
    value: string
    items: string[]
    setValue: (v: string) => void
  }

  it('should allow direct setState calls', () => {
    const useStore = create<Store>((set) => ({
      value: 'initial',
      items: [],
      setValue: (v) => set({ value: v }),
    }))

    // Direct setState (useful in non-React contexts)
    useStore.setState({ value: 'updated' })
    expect(useStore.getState().value).toBe('updated')

    // Functional setState
    useStore.setState((state) => ({ value: state.value + '!' }))
    expect(useStore.getState().value).toBe('updated!')
  })

  it('should merge state by default', () => {
    const useStore = create<Store>(() => ({
      value: 'initial',
      items: ['a', 'b'],
      setValue: () => {},
    }))

    // setState merges (doesn't replace entire state)
    useStore.setState({ value: 'changed' })

    expect(useStore.getState().value).toBe('changed')
    expect(useStore.getState().items).toEqual(['a', 'b']) // preserved
  })

  it('should support replace option', () => {
    const useStore = create<Store>((set) => ({
      value: 'initial',
      items: ['a', 'b'],
      setValue: (v) => set({ value: v }),
    }))

    // Replace entire state (use with caution)
    useStore.setState(
      {
        value: 'new',
        items: [],
        setValue: useStore.getState().setValue,
      },
      true // replace
    )

    expect(useStore.getState().value).toBe('new')
    expect(useStore.getState().items).toEqual([])
  })

  it('should get state snapshot synchronously', () => {
    const useStore = create<Store>((set) => ({
      value: 'a',
      items: [],
      setValue: (v) => set({ value: v }),
    }))

    const snapshot1 = useStore.getState()
    useStore.getState().setValue('b')
    const snapshot2 = useStore.getState()

    expect(snapshot1.value).toBe('a')
    expect(snapshot2.value).toBe('b')
  })
})
