/**
 * Font detection utility for system monospace fonts.
 *
 * Uses the Local Font Access API (available in Chrome/Edge) with
 * fallback to a curated list of common system fonts.
 *
 * @see https://developer.chrome.com/docs/capabilities/web-apis/local-fonts
 */

// Common monospace fonts to check for
const COMMON_MONOSPACE_FONTS = [
  // macOS
  'SF Mono',
  'Menlo',
  'Monaco',
  // Windows
  'Consolas',
  'Lucida Console',
  // Linux
  'DejaVu Sans Mono',
  'Liberation Mono',
  'Ubuntu Mono',
  // Cross-platform
  'Courier New',
]

export interface DetectedFont {
  family: string
  fullName: string
}

/**
 * Check if Local Font Access API is available.
 */
export function isLocalFontAccessAvailable(): boolean {
  return 'queryLocalFonts' in window
}

/**
 * Detect available monospace fonts on the system.
 *
 * If Local Font Access API is available, queries for actual installed fonts.
 * Otherwise, falls back to canvas-based font detection for common fonts.
 *
 * @returns Array of detected font families
 */
export async function detectSystemFonts(): Promise<DetectedFont[]> {
  // Try Local Font Access API first (Chrome/Edge)
  if (isLocalFontAccessAvailable()) {
    try {
      const fonts = await queryLocalFonts()
      return fonts
    } catch (error) {
      // Permission denied or API error - fall back to canvas detection
      console.warn('Local Font Access API unavailable:', error)
    }
  }

  // Fallback: canvas-based font detection
  return detectFontsViaCanvas()
}

/**
 * Query fonts using the Local Font Access API.
 * Filters for monospace fonts only.
 */
async function queryLocalFonts(): Promise<DetectedFont[]> {
  // @ts-expect-error - Local Font Access API not in TypeScript types
  const fonts = await window.queryLocalFonts()

  // Filter for monospace fonts (heuristic: common mono families)
  const monoKeywords = ['mono', 'code', 'console', 'courier', 'menlo', 'monaco', 'consolas']

  const detected: DetectedFont[] = []
  const seenFamilies = new Set<string>()

  for (const font of fonts) {
    const family = font.family as string
    const lowerFamily = family.toLowerCase()

    // Skip if already seen this family
    if (seenFamilies.has(family)) continue

    // Check if it's likely a monospace font
    const isMono = monoKeywords.some(keyword => lowerFamily.includes(keyword))
    if (isMono) {
      seenFamilies.add(family)
      detected.push({
        family,
        fullName: font.fullName || family,
      })
    }
  }

  return detected.sort((a, b) => a.family.localeCompare(b.family))
}

/**
 * Detect fonts by rendering text on canvas and checking width.
 * This is a fallback for browsers without Local Font Access API.
 */
function detectFontsViaCanvas(): DetectedFont[] {
  const detected: DetectedFont[] = []

  // Create canvas for measurement
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return detected

  const testString = 'mmmmmmmmmmlli'
  const fontSize = 72

  // Get baseline width with fallback font
  ctx.font = `${fontSize}px monospace`
  const fallbackWidth = ctx.measureText(testString).width

  for (const fontFamily of COMMON_MONOSPACE_FONTS) {
    // Test with the specific font
    ctx.font = `${fontSize}px "${fontFamily}", monospace`
    const width = ctx.measureText(testString).width

    // If width differs from fallback, font is available
    if (width !== fallbackWidth) {
      detected.push({
        family: fontFamily,
        fullName: fontFamily,
      })
    }
  }

  return detected
}

/**
 * Get the CSS font-family string for a detected font.
 */
export function getFontFamilyCSS(font: DetectedFont): string {
  return `"${font.family}", monospace`
}
