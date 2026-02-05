/**
 * GPU Capability Detection - Determines optimal WebGL pool size based on hardware.
 *
 * Detects the GPU renderer string and returns device-appropriate pool sizes:
 * - Apple Silicon: 6 (good WebGL performance)
 * - Intel integrated: 4 (conservative)
 * - NVIDIA/AMD discrete: 8 (high performance)
 * - Unknown/unavailable: 4 (safe default)
 *
 * Per Critical Discovery 09: Wrap detection in try-catch, accept false negatives.
 */

import { getFakeGPUConfig, isGPUContextFaked } from '../test/fakeGPUContext'

/**
 * Result of GPU capability detection.
 */
export interface GPUCapabilityResult {
  /** Recommended WebGL pool max size */
  maxSize: number
  /** The detected GPU renderer string, or null if unavailable */
  renderer: string | null
  /** Whether detection was successful */
  detected: boolean
}

/** Pool size for Apple Silicon GPUs */
const APPLE_POOL_SIZE = 6

/** Pool size for Intel integrated GPUs */
const INTEL_POOL_SIZE = 4

/** Pool size for NVIDIA/AMD discrete GPUs */
const DISCRETE_POOL_SIZE = 8

/** Default pool size when detection fails */
const DEFAULT_POOL_SIZE = 4

/**
 * Determine pool size based on GPU renderer string.
 */
function getPoolSizeFromRenderer(renderer: string): number {
  const upperRenderer = renderer.toUpperCase()

  // Apple Silicon GPUs
  if (upperRenderer.includes('APPLE')) {
    return APPLE_POOL_SIZE
  }

  // NVIDIA discrete GPUs
  if (upperRenderer.includes('NVIDIA') || upperRenderer.includes('GEFORCE')) {
    return DISCRETE_POOL_SIZE
  }

  // AMD discrete GPUs
  if (upperRenderer.includes('AMD') || upperRenderer.includes('RADEON')) {
    return DISCRETE_POOL_SIZE
  }

  // Intel integrated GPUs
  if (upperRenderer.includes('INTEL')) {
    return INTEL_POOL_SIZE
  }

  // Unknown GPU - use conservative default
  return DEFAULT_POOL_SIZE
}

/**
 * Detect GPU renderer string from WebGL context.
 * Returns null if WebGL or debug info extension is unavailable.
 */
function detectRendererString(): string | null {
  // Check if we're using a fake context for testing
  if (isGPUContextFaked()) {
    const fakeConfig = getFakeGPUConfig()
    if (!fakeConfig) return null
    if (fakeConfig.renderer === null) return null
    if (!fakeConfig.extensionAvailable) return null
    return fakeConfig.renderer
  }

  // Real detection via WebGL
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')

  if (!gl) {
    return null
  }

  // Cast to WebGLRenderingContext for type safety
  const webgl = gl as WebGLRenderingContext

  // Try to get debug renderer info extension
  const debugInfo = webgl.getExtension('WEBGL_debug_renderer_info')

  if (!debugInfo) {
    return null
  }

  // Get the unmasked renderer string
  const renderer = webgl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)

  return typeof renderer === 'string' ? renderer : null
}

/**
 * Detect GPU capability and return recommended pool size.
 *
 * Per Critical Discovery 09: Wrapped in try-catch with conservative fallback.
 * This function never throws - it returns safe defaults on any error.
 */
export function detectGPUCapability(): GPUCapabilityResult {
  try {
    const renderer = detectRendererString()

    if (!renderer) {
      // WebGL or extension unavailable - use conservative default
      console.info('[WebGL Pool] GPU detection unavailable, using default maxSize:', DEFAULT_POOL_SIZE)
      return {
        maxSize: DEFAULT_POOL_SIZE,
        renderer: null,
        detected: false,
      }
    }

    const maxSize = getPoolSizeFromRenderer(renderer)
    console.info(`[WebGL Pool] GPU detected: "${renderer}" → maxSize ${maxSize}`)

    return {
      maxSize,
      renderer,
      detected: true,
    }
  } catch (error) {
    // Per Critical Discovery 09: Accept false negatives as safe
    console.warn('[WebGL Pool] GPU detection failed, using default maxSize:', DEFAULT_POOL_SIZE, error)
    return {
      maxSize: DEFAULT_POOL_SIZE,
      renderer: null,
      detected: false,
    }
  }
}

/**
 * Get the default pool size (for use when detection is skipped).
 */
export function getDefaultPoolSize(): number {
  return DEFAULT_POOL_SIZE
}
