/**
 * @file gpuCapability.test.ts
 * @description Tests for GPU capability detection utility.
 *
 * Test Doc: Validates that detectGPUCapability() correctly identifies GPU types
 * and returns appropriate pool sizes. Uses FakeGPUContext per ADR-0004.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  detectGPUCapability,
  getDefaultPoolSize,
} from '../gpuCapability'
import {
  installFakeGPUContext,
  resetFakeGPUContext,
} from '../../test/fakeGPUContext'

describe('gpuCapability', () => {
  // Spy on console methods
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetFakeGPUContext()
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    resetFakeGPUContext()
    consoleInfoSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('Apple Silicon detection', () => {
    /**
     * Test Doc: Apple Silicon GPU → maxSize 6
     * Given: GPU renderer string contains "Apple"
     * When: detectGPUCapability() is called
     * Then: Returns maxSize of 6
     */
    it('returns 6 for Apple M2 Pro GPU', () => {
      const { restore } = installFakeGPUContext('Apple M2 Pro')

      const result = detectGPUCapability()

      expect(result.maxSize).toBe(6)
      expect(result.renderer).toBe('Apple M2 Pro')
      expect(result.detected).toBe(true)
      restore()
    })

    /**
     * Test Doc: Apple M3 variant → maxSize 6
     * Given: GPU renderer string is "Apple M3 Max"
     * When: detectGPUCapability() is called
     * Then: Returns maxSize of 6
     */
    it('returns 6 for Apple M3 Max GPU', () => {
      const { restore } = installFakeGPUContext('Apple M3 Max')

      const result = detectGPUCapability()

      expect(result.maxSize).toBe(6)
      expect(result.renderer).toBe('Apple M3 Max')
      expect(result.detected).toBe(true)
      restore()
    })

    /**
     * Test Doc: Case-insensitive Apple detection
     * Given: GPU renderer string is "APPLE GPU"
     * When: detectGPUCapability() is called
     * Then: Returns maxSize of 6
     */
    it('handles case-insensitive Apple detection', () => {
      const { restore } = installFakeGPUContext('APPLE GPU')

      const result = detectGPUCapability()

      expect(result.maxSize).toBe(6)
      restore()
    })
  })

  describe('Intel detection', () => {
    /**
     * Test Doc: Intel integrated GPU → maxSize 4
     * Given: GPU renderer string contains "Intel"
     * When: detectGPUCapability() is called
     * Then: Returns maxSize of 4
     */
    it('returns 4 for Intel UHD Graphics 630', () => {
      const { restore } = installFakeGPUContext('Intel(R) UHD Graphics 630')

      const result = detectGPUCapability()

      expect(result.maxSize).toBe(4)
      expect(result.renderer).toBe('Intel(R) UHD Graphics 630')
      expect(result.detected).toBe(true)
      restore()
    })

    /**
     * Test Doc: Intel Iris GPU → maxSize 4
     * Given: GPU renderer string contains "Intel" (Iris variant)
     * When: detectGPUCapability() is called
     * Then: Returns maxSize of 4
     */
    it('returns 4 for Intel Iris Xe Graphics', () => {
      const { restore } = installFakeGPUContext('Intel(R) Iris(R) Xe Graphics')

      const result = detectGPUCapability()

      expect(result.maxSize).toBe(4)
      expect(result.detected).toBe(true)
      restore()
    })
  })

  describe('NVIDIA detection', () => {
    /**
     * Test Doc: NVIDIA discrete GPU → maxSize 8
     * Given: GPU renderer string contains "NVIDIA"
     * When: detectGPUCapability() is called
     * Then: Returns maxSize of 8
     */
    it('returns 8 for NVIDIA GeForce RTX 3080', () => {
      const { restore } = installFakeGPUContext('NVIDIA GeForce RTX 3080')

      const result = detectGPUCapability()

      expect(result.maxSize).toBe(8)
      expect(result.renderer).toBe('NVIDIA GeForce RTX 3080')
      expect(result.detected).toBe(true)
      restore()
    })

    /**
     * Test Doc: GeForce variant → maxSize 8
     * Given: GPU renderer string contains "GeForce"
     * When: detectGPUCapability() is called
     * Then: Returns maxSize of 8
     */
    it('returns 8 for GeForce GTX 1080', () => {
      const { restore } = installFakeGPUContext('GeForce GTX 1080')

      const result = detectGPUCapability()

      expect(result.maxSize).toBe(8)
      expect(result.detected).toBe(true)
      restore()
    })
  })

  describe('AMD detection', () => {
    /**
     * Test Doc: AMD discrete GPU → maxSize 8
     * Given: GPU renderer string contains "AMD"
     * When: detectGPUCapability() is called
     * Then: Returns maxSize of 8
     */
    it('returns 8 for AMD Radeon RX 6800', () => {
      const { restore } = installFakeGPUContext('AMD Radeon RX 6800')

      const result = detectGPUCapability()

      expect(result.maxSize).toBe(8)
      expect(result.renderer).toBe('AMD Radeon RX 6800')
      expect(result.detected).toBe(true)
      restore()
    })

    /**
     * Test Doc: Radeon variant → maxSize 8
     * Given: GPU renderer string contains "RADEON"
     * When: detectGPUCapability() is called
     * Then: Returns maxSize of 8
     */
    it('returns 8 for Radeon Pro 5500M', () => {
      const { restore } = installFakeGPUContext('Radeon Pro 5500M')

      const result = detectGPUCapability()

      expect(result.maxSize).toBe(8)
      expect(result.detected).toBe(true)
      restore()
    })
  })

  describe('fallback handling', () => {
    /**
     * Test Doc: Null WebGL context → maxSize 4
     * Given: WebGL is unavailable (renderer is null)
     * When: detectGPUCapability() is called
     * Then: Returns maxSize of 4 with detected = false
     */
    it('returns 4 when WebGL unavailable', () => {
      const { restore } = installFakeGPUContext(null)

      const result = detectGPUCapability()

      expect(result.maxSize).toBe(4)
      expect(result.renderer).toBeNull()
      expect(result.detected).toBe(false)
      restore()
    })

    /**
     * Test Doc: Blocked extension → maxSize 4
     * Given: WEBGL_debug_renderer_info extension is blocked
     * When: detectGPUCapability() is called
     * Then: Returns maxSize of 4 with detected = false
     */
    it('returns 4 when extension blocked', () => {
      const { restore } = installFakeGPUContext('Some GPU', false)

      const result = detectGPUCapability()

      expect(result.maxSize).toBe(4)
      expect(result.renderer).toBeNull()
      expect(result.detected).toBe(false)
      restore()
    })

    /**
     * Test Doc: Unknown GPU vendor → maxSize 4
     * Given: GPU renderer string is unrecognized
     * When: detectGPUCapability() is called
     * Then: Returns maxSize of 4 with detected = true (detection worked, vendor unknown)
     */
    it('returns 4 for unknown GPU vendor', () => {
      const { restore } = installFakeGPUContext('Unknown Vendor GPU Model XYZ')

      const result = detectGPUCapability()

      expect(result.maxSize).toBe(4)
      expect(result.renderer).toBe('Unknown Vendor GPU Model XYZ')
      expect(result.detected).toBe(true)
      restore()
    })
  })

  describe('logging', () => {
    /**
     * Test Doc: Logs detected GPU info
     * Given: GPU detection succeeds
     * When: detectGPUCapability() is called
     * Then: console.info is called with GPU info
     */
    it('logs detected GPU info on success', () => {
      const { restore } = installFakeGPUContext('Apple M3 Pro')

      detectGPUCapability()

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WebGL Pool] GPU detected:')
      )
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Apple M3 Pro')
      )
      restore()
    })

    /**
     * Test Doc: Logs default on unavailable
     * Given: WebGL is unavailable
     * When: detectGPUCapability() is called
     * Then: console.info is called with default message
     */
    it('logs default message when detection unavailable', () => {
      const { restore } = installFakeGPUContext(null)

      detectGPUCapability()

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WebGL Pool] GPU detection unavailable'),
        expect.any(Number)
      )
      restore()
    })
  })

  describe('getDefaultPoolSize', () => {
    /**
     * Test Doc: Default pool size is 4
     * Given: No conditions
     * When: getDefaultPoolSize() is called
     * Then: Returns 4
     */
    it('returns 4', () => {
      expect(getDefaultPoolSize()).toBe(4)
    })
  })
})
