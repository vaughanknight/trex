/**
 * FakeWebglAddon - A deterministic WebglAddon implementation for testing.
 *
 * This fake implements the essential WebglAddon interface and provides methods to
 * control behavior deterministically. Per ADR-0004, we use fakes instead of
 * mocking frameworks.
 *
 * Usage:
 * ```ts
 * const { instances, restore } = installFakeWebglAddon()
 * // Use pool.acquire() which creates FakeWebglAddon instances
 * const addon = instances[0]
 * // Simulate context loss
 * addon.simulateContextLoss()
 * // Check if dispose was called
 * expect(addon.wasDisposed()).toBe(true)
 * // Restore original WebglAddon
 * restore()
 * ```
 */

type ContextLossHandler = () => void

/**
 * Minimal interface for what WebglAddon exposes that the pool needs.
 * The real WebglAddon has more methods, but we only implement what's used.
 */
export interface IWebglAddon {
  dispose(): void
  onContextLoss(handler: ContextLossHandler): { dispose: () => void }
}

export class FakeWebglAddon implements IWebglAddon {
  private disposed = false
  private contextLossHandler: ContextLossHandler | null = null
  private handlerDisposed = false

  /**
   * Dispose the addon, releasing WebGL resources.
   * Per Critical Discovery 03: Pool owns disposal, tracks calls.
   */
  dispose(): void {
    this.disposed = true
  }

  /**
   * Check if dispose() was called.
   * Test helper method for verifying proper cleanup.
   */
  wasDisposed(): boolean {
    return this.disposed
  }

  /**
   * Register a handler for WebGL context loss events.
   * Per Critical Discovery 04: Pool registers handler at creation.
   *
   * Returns a disposable to remove the handler.
   */
  onContextLoss(handler: ContextLossHandler): { dispose: () => void } {
    this.contextLossHandler = handler
    return {
      dispose: () => {
        this.handlerDisposed = true
        this.contextLossHandler = null
      },
    }
  }

  /**
   * Simulate WebGL context loss event.
   * Test helper to trigger context loss handler.
   */
  simulateContextLoss(): void {
    if (this.contextLossHandler && !this.handlerDisposed) {
      this.contextLossHandler()
    }
  }

  /**
   * Check if context loss handler was registered.
   * Test helper for verifying handler setup.
   */
  hasContextLossHandler(): boolean {
    return this.contextLossHandler !== null && !this.handlerDisposed
  }

  /**
   * Reset internal state for test isolation.
   */
  reset(): void {
    this.disposed = false
    this.contextLossHandler = null
    this.handlerDisposed = false
  }
}

/**
 * Factory function type that the pool will use to create addons.
 * This allows injection of FakeWebglAddon for testing.
 */
export type WebglAddonFactory = () => IWebglAddon

/**
 * Default factory that creates real WebglAddon instances.
 * Lazily imports to avoid issues when @xterm/addon-webgl isn't available.
 */
let defaultFactory: WebglAddonFactory | null = null

/**
 * Current factory - can be overridden for testing.
 */
let currentFactory: WebglAddonFactory | null = null

/**
 * Get the current WebglAddon factory.
 * Returns the test factory if installed, otherwise the real factory.
 */
export function getWebglAddonFactory(): WebglAddonFactory {
  if (currentFactory) {
    return currentFactory
  }
  if (!defaultFactory) {
    // Lazy initialization of default factory
    defaultFactory = () => {
      // Dynamic require to handle cases where WebglAddon isn't available
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = Function('return require("@xterm/addon-webgl")')() as { WebglAddon: new () => IWebglAddon }
      return new mod.WebglAddon() as IWebglAddon
    }
  }
  return defaultFactory
}

/**
 * Install FakeWebglAddon as the factory for tests.
 * Returns instances array and restore function.
 *
 * Usage:
 * ```ts
 * beforeEach(() => {
 *   const { instances, restore } = installFakeWebglAddon()
 *   // instances array will be populated as pool creates addons
 * })
 * ```
 */
export function installFakeWebglAddon(): {
  instances: FakeWebglAddon[]
  restore: () => void
} {
  const instances: FakeWebglAddon[] = []

  currentFactory = () => {
    const addon = new FakeWebglAddon()
    instances.push(addon)
    return addon
  }

  return {
    instances,
    restore: () => {
      currentFactory = null
    },
  }
}

/**
 * Set a custom factory for creating WebglAddon instances.
 * Useful for injecting test doubles.
 */
export function setWebglAddonFactory(factory: WebglAddonFactory | null): void {
  currentFactory = factory
}
