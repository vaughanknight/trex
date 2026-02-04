import '@testing-library/jest-dom/vitest'

// Mock ResizeObserver for tests
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock

// Mock PointerEvent for Radix UI components (required by jsdom)
// @ts-expect-error - Polyfill for jsdom
globalThis.PointerEvent = class PointerEvent extends MouseEvent {
  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params)
  }
}

// Mock hasPointerCapture for Radix Select/Slider (jsdom doesn't support it)
Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => {}
Element.prototype.releasePointerCapture = () => {}

// Mock scrollIntoView for Radix Select (jsdom doesn't support it)
Element.prototype.scrollIntoView = () => {}

// Mock matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
