/**
 * FakeGPUContext - A deterministic GPU context implementation for testing.
 *
 * This fake allows testing of GPU detection without real WebGL contexts.
 * Per ADR-0004, we use fakes instead of mocking frameworks.
 *
 * Usage:
 * ```ts
 * const { restore } = installFakeGPUContext('Apple M3 Pro')
 * const result = detectGPUCapability()
 * expect(result.maxSize).toBe(6)
 * restore()
 * ```
 */

/**
 * Configuration for FakeGPUContext behavior.
 */
export interface FakeGPUContextConfig {
  /** The renderer string to return, or null to simulate unavailable WebGL */
  renderer: string | null
  /** Whether the debug_renderer_info extension is available */
  extensionAvailable: boolean
}

/**
 * Current fake configuration (null means use real detection).
 */
let fakeConfig: FakeGPUContextConfig | null = null

/**
 * Get the current fake configuration.
 * Returns null if no fake is installed.
 */
export function getFakeGPUConfig(): FakeGPUContextConfig | null {
  return fakeConfig
}

/**
 * Check if GPU context is being faked.
 */
export function isGPUContextFaked(): boolean {
  return fakeConfig !== null
}

/**
 * Install a fake GPU context for testing.
 * Returns a restore function to reset to real behavior.
 *
 * @param renderer - The GPU renderer string to return, or null for no WebGL
 * @param extensionAvailable - Whether WEBGL_debug_renderer_info is available (default true)
 *
 * Usage:
 * ```ts
 * // Simulate Apple Silicon GPU
 * const { restore } = installFakeGPUContext('Apple M3 Pro')
 *
 * // Simulate no WebGL
 * const { restore } = installFakeGPUContext(null)
 *
 * // Simulate blocked extension
 * const { restore } = installFakeGPUContext('Some GPU', false)
 * ```
 */
export function installFakeGPUContext(
  renderer: string | null,
  extensionAvailable = true
): { restore: () => void } {
  fakeConfig = {
    renderer,
    extensionAvailable,
  }

  return {
    restore: () => {
      fakeConfig = null
    },
  }
}

/**
 * Reset fake GPU context to use real detection.
 * Alias for the restore function for direct calls.
 */
export function resetFakeGPUContext(): void {
  fakeConfig = null
}

/**
 * Set fake GPU config directly.
 * Useful for more complex testing scenarios.
 */
export function setFakeGPUConfig(config: FakeGPUContextConfig | null): void {
  fakeConfig = config
}
