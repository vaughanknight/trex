import { describe, it, expect } from 'vitest'
import { buildThemeCSSVars, mixColors } from '../themeCSS'
import { themes, getThemeById } from '../../themes'

describe('mixColors', () => {
  it('returns colorA when ratio is 0', () => {
    expect(mixColors('#000000', '#ffffff', 0)).toBe('#000000')
  })

  it('returns colorB when ratio is 1', () => {
    expect(mixColors('#000000', '#ffffff', 1)).toBe('#ffffff')
  })

  it('returns midpoint at ratio 0.5', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('mixes non-trivial colors', () => {
    // 25% of the way from black to red
    expect(mixColors('#000000', '#ff0000', 0.25)).toBe('#400000')
  })
})

describe('buildThemeCSSVars', () => {
  it('produces valid hex or rgba for all CSS variables', () => {
    const theme = getThemeById('default-dark')
    const vars = buildThemeCSSVars(theme, true)

    for (const [key, value] of Object.entries(vars)) {
      const isHex = /^#[0-9a-f]{6}$/i.test(value)
      const isRgba = /^rgba\(\d+, \d+, \d+, [\d.]+\)$/.test(value)
      expect(isHex || isRgba, `${key} = "${value}" is not valid hex or rgba`).toBe(true)
    }
  })

  it('produces all expected CSS variable keys', () => {
    const theme = getThemeById('dracula')
    const vars = buildThemeCSSVars(theme, true)

    const expectedKeys = [
      '--background', '--foreground',
      '--card', '--card-foreground',
      '--popover', '--popover-foreground',
      '--primary', '--primary-foreground',
      '--secondary', '--secondary-foreground',
      '--muted', '--muted-foreground',
      '--accent', '--accent-foreground',
      '--destructive',
      '--border', '--input', '--ring',
      '--sidebar', '--sidebar-foreground',
      '--sidebar-primary', '--sidebar-primary-foreground',
      '--sidebar-accent', '--sidebar-accent-foreground',
      '--sidebar-border', '--sidebar-ring',
    ]

    for (const key of expectedKeys) {
      expect(vars).toHaveProperty(key)
    }
  })

  it('sets --background and --foreground directly from theme', () => {
    const theme = getThemeById('dracula')
    const vars = buildThemeCSSVars(theme, true)

    expect(vars['--background']).toBe('#282a36')
    expect(vars['--foreground']).toBe('#f8f8f2')
  })

  it('sets --destructive from theme red', () => {
    const theme = getThemeById('nord')
    const vars = buildThemeCSSVars(theme, true)

    expect(vars['--destructive']).toBe('#bf616a')
  })

  it('derived colors differ from background', () => {
    const theme = getThemeById('tokyo-night')
    const vars = buildThemeCSSVars(theme, true)

    expect(vars['--card']).not.toBe(vars['--background'])
    expect(vars['--muted']).not.toBe(vars['--background'])
    expect(vars['--muted-foreground']).not.toBe(vars['--background'])
    expect(vars['--muted-foreground']).not.toBe(vars['--foreground'])
  })

  // Test all 12 themes produce valid output
  for (const themeInfo of themes) {
    it(`produces valid output for ${themeInfo.name}`, () => {
      const vars = buildThemeCSSVars(themeInfo.theme, themeInfo.isDark)

      expect(vars['--background']).toBe(themeInfo.theme.background)
      expect(vars['--foreground']).toBe(themeInfo.theme.foreground)
      expect(vars['--sidebar']).toBe(themeInfo.theme.background)

      // All values should be valid
      for (const [key, value] of Object.entries(vars)) {
        const isHex = /^#[0-9a-f]{6}$/i.test(value)
        const isRgba = /^rgba\(\d+, \d+, \d+, [\d.]+\)$/.test(value)
        expect(isHex || isRgba, `${themeInfo.name}: ${key} = "${value}" invalid`).toBe(true)
      }
    })
  }

  it('light theme produces different derivation than dark', () => {
    const darkVars = buildThemeCSSVars(getThemeById('default-dark'), true)
    const lightVars = buildThemeCSSVars(getThemeById('default-light'), false)

    // Light theme card should be closer to white background
    expect(lightVars['--card']).not.toBe(darkVars['--card'])
    expect(lightVars['--muted']).not.toBe(darkVars['--muted'])
  })
})
