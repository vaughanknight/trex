/**
 * Theme CSS Variable Mapping
 *
 * Maps terminal theme (ITheme) colors to CSS custom properties so the entire
 * app UI matches the selected terminal theme. The Tailwind `@theme inline`
 * block in index.css bridges these CSS variables to utility classes like
 * `bg-background`, `text-sidebar-foreground`, etc.
 */

import type { ITheme } from '@xterm/xterm'

/** Parse a hex color (#RRGGBB) into [r, g, b] (0-255). */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** Convert [r, g, b] (0-255) back to #RRGGBB. */
function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`
}

/** Mix two hex colors. ratio=0 returns colorA, ratio=1 returns colorB. */
export function mixColors(colorA: string, colorB: string, ratio: number): string {
  const [r1, g1, b1] = parseHex(colorA)
  const [r2, g2, b2] = parseHex(colorB)
  return toHex(
    r1 + (r2 - r1) * ratio,
    g1 + (g2 - g1) * ratio,
    b1 + (b2 - b1) * ratio,
  )
}

/** Add alpha (0-1) to a hex color, returning rgba(). */
function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Generate all CSS custom property overrides from a terminal theme.
 *
 * @param theme  - The xterm.js ITheme object
 * @param isDark - Whether this is a dark theme (affects derivation ratios)
 * @returns Record mapping CSS variable names to hex/rgba values
 */
export function buildThemeCSSVars(theme: ITheme, isDark: boolean): Record<string, string> {
  const bg = theme.background ?? '#1e1e1e'
  const fg = theme.foreground ?? '#d4d4d4'
  const blue = theme.blue ?? '#2472c8'
  const red = theme.red ?? '#cd3131'

  // Derived surface colors — slightly shifted from background
  const cardBg = isDark ? mixColors(bg, fg, 0.05) : mixColors(bg, fg, 0.02)
  const mutedBg = isDark ? mixColors(bg, fg, 0.10) : mixColors(bg, fg, 0.04)
  const accentBg = isDark ? mixColors(bg, fg, 0.10) : mixColors(bg, fg, 0.04)
  const secondaryBg = isDark ? mixColors(bg, fg, 0.10) : mixColors(bg, fg, 0.04)

  // Derived text colors
  const mutedFg = mixColors(bg, fg, isDark ? 0.55 : 0.50)

  // Border and input — subtle dividers
  const border = isDark ? withAlpha(fg, 0.10) : withAlpha(fg, 0.12)
  const input = isDark ? withAlpha(fg, 0.15) : withAlpha(fg, 0.12)
  const ring = mixColors(bg, fg, 0.45)

  return {
    // Foundation
    '--background': bg,
    '--foreground': fg,

    // Card
    '--card': cardBg,
    '--card-foreground': fg,

    // Popover (same as card)
    '--popover': cardBg,
    '--popover-foreground': fg,

    // Primary — use ANSI blue for consistent accent
    '--primary': isDark ? mixColors(bg, fg, 0.85) : mixColors(bg, fg, 0.85),
    '--primary-foreground': isDark ? mixColors(bg, fg, 0.15) : mixColors(bg, fg, 0.15),

    // Secondary
    '--secondary': secondaryBg,
    '--secondary-foreground': fg,

    // Muted
    '--muted': mutedBg,
    '--muted-foreground': mutedFg,

    // Accent (hover/active states)
    '--accent': accentBg,
    '--accent-foreground': fg,

    // Destructive — from ANSI red
    '--destructive': red,

    // Borders and inputs
    '--border': border,
    '--input': input,
    '--ring': ring,

    // Sidebar — match main background
    '--sidebar': bg,
    '--sidebar-foreground': fg,
    '--sidebar-primary': blue,
    '--sidebar-primary-foreground': fg,
    '--sidebar-accent': accentBg,
    '--sidebar-accent-foreground': fg,
    '--sidebar-border': border,
    '--sidebar-ring': ring,
  }
}

/**
 * Apply CSS variables to `:root` and toggle `.dark` class.
 *
 * @param theme  - The xterm.js ITheme object
 * @param isDark - Whether this is a dark theme
 */
export function applyThemeToDocument(theme: ITheme, isDark: boolean): void {
  const vars = buildThemeCSSVars(theme, isDark)
  const root = document.documentElement

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }

  if (isDark) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}
