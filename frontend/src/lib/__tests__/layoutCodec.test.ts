import { describe, it, expect } from 'vitest'
import {
  serializeLayout,
  parseLayout,
  validateLayout,
  verifyRoundTrip,
  countURLPanes,
  layoutToURLTree,
  urlTreeToLayout,
  ParseError,
  type URLPaneLayout,
} from '../layoutCodec'

describe('serializeLayout', () => {
  it('serializes single pane', () => {
    expect(serializeLayout({ type: 'leaf', shell: 'bash' })).toBe('b')
  })

  it('serializes all shell types', () => {
    expect(serializeLayout({ type: 'leaf', shell: 'bash' })).toBe('b')
    expect(serializeLayout({ type: 'leaf', shell: 'zsh' })).toBe('z')
    expect(serializeLayout({ type: 'leaf', shell: 'fish' })).toBe('f')
    expect(serializeLayout({ type: 'leaf', shell: 'default' })).toBe('d')
  })

  it('serializes 2-column 50/50', () => {
    expect(serializeLayout({
      type: 'split', direction: 'h', ratio: 0.5,
      first: { type: 'leaf', shell: 'bash' },
      second: { type: 'leaf', shell: 'zsh' },
    })).toBe('H50bz')
  })

  it('serializes 2-row 60/40', () => {
    expect(serializeLayout({
      type: 'split', direction: 'v', ratio: 0.6,
      first: { type: 'leaf', shell: 'bash' },
      second: { type: 'leaf', shell: 'zsh' },
    })).toBe('V60bz')
  })

  it('serializes 2x2 grid', () => {
    expect(serializeLayout({
      type: 'split', direction: 'v', ratio: 0.5,
      first: {
        type: 'split', direction: 'h', ratio: 0.5,
        first: { type: 'leaf', shell: 'bash' },
        second: { type: 'leaf', shell: 'zsh' },
      },
      second: {
        type: 'split', direction: 'h', ratio: 0.5,
        first: { type: 'leaf', shell: 'fish' },
        second: { type: 'leaf', shell: 'bash' },
      },
    })).toBe('V50H50bzH50fb')
  })

  it('serializes L-shaped layout', () => {
    expect(serializeLayout({
      type: 'split', direction: 'h', ratio: 0.6,
      first: { type: 'leaf', shell: 'bash' },
      second: {
        type: 'split', direction: 'v', ratio: 0.5,
        first: { type: 'leaf', shell: 'zsh' },
        second: { type: 'leaf', shell: 'fish' },
      },
    })).toBe('H60bV50zf')
  })

  it('serializes 3-col mid-split', () => {
    expect(serializeLayout({
      type: 'split', direction: 'h', ratio: 0.33,
      first: { type: 'leaf', shell: 'bash' },
      second: {
        type: 'split', direction: 'h', ratio: 0.5,
        first: {
          type: 'split', direction: 'v', ratio: 0.5,
          first: { type: 'leaf', shell: 'bash' },
          second: { type: 'leaf', shell: 'fish' },
        },
        second: { type: 'leaf', shell: 'zsh' },
      },
    })).toBe('H33bH50V50bfz')
  })
})

describe('parseLayout', () => {
  it('parses single pane', () => {
    expect(parseLayout('b')).toEqual({ type: 'leaf', shell: 'bash' })
  })

  it('parses 2-col 50/50', () => {
    expect(parseLayout('H50bz')).toEqual({
      type: 'split', direction: 'h', ratio: 0.5,
      first: { type: 'leaf', shell: 'bash' },
      second: { type: 'leaf', shell: 'zsh' },
    })
  })

  it('rejects empty string', () => {
    expect(() => parseLayout('')).toThrow(ParseError)
  })

  it('rejects invalid character', () => {
    expect(() => parseLayout('X')).toThrow(ParseError)
  })

  it('rejects truncated split', () => {
    expect(() => parseLayout('H50b')).toThrow(ParseError)
  })

  it('rejects ratio 00', () => {
    const result = validateLayout('H00bz')
    expect(result.ok).toBe(false)
  })

  it('rejects trailing characters', () => {
    expect(() => parseLayout('bz')).toThrow(ParseError)
  })
})

describe('validateLayout', () => {
  it('accepts valid layout', () => {
    const result = validateLayout('H50bz')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.layout.type).toBe('split')
    }
  })

  it('rejects >8 panes', () => {
    // 9-pane tree: V50(V50(V50(V50(b,b),b),b),V50(V50(V50(b,b),b),b)) -- but more simply:
    const result = validateLayout('V50V50V50V50bbbbV50V50V50V50bbbb')
    expect(result.ok).toBe(false)
  })

  it('accepts exactly 8 panes', () => {
    // 8 panes: V50(H50(H50(b,b),H50(b,b)),H50(H50(b,b),H50(b,b)))
    const result = validateLayout('V50H50H50bbH50bbH50H50bbH50bb')
    expect(result.ok).toBe(true)
  })

  it('rejects malformed input', () => {
    const result = validateLayout('XYZ')
    expect(result.ok).toBe(false)
  })
})

describe('countURLPanes', () => {
  it('single leaf = 1', () => {
    expect(countURLPanes({ type: 'leaf', shell: 'bash' })).toBe(1)
  })

  it('split with 2 leaves = 2', () => {
    expect(countURLPanes({
      type: 'split', direction: 'h', ratio: 0.5,
      first: { type: 'leaf', shell: 'bash' },
      second: { type: 'leaf', shell: 'zsh' },
    })).toBe(2)
  })
})

describe('round-trip fidelity', () => {
  it.each(['b', 'H50bz', 'V60bz', 'V50H50bzH50fb', 'H60bV50zf', 'H33bH50V50bfz'])(
    'round-trips %s',
    (input) => {
      expect(verifyRoundTrip(input)).toBe(true)
    },
  )
})

describe('layoutToURLTree', () => {
  it('converts runtime leaf to URL leaf', () => {
    const sessionShellMap = new Map([['s1', 'zsh']])
    const result = layoutToURLTree(
      { type: 'leaf', paneId: 'p1', sessionId: 's1' },
      sessionShellMap,
    )
    expect(result).toEqual({ type: 'leaf', shell: 'zsh' })
  })

  it('falls back to default for unknown session', () => {
    const sessionShellMap = new Map<string, string>()
    const result = layoutToURLTree(
      { type: 'leaf', paneId: 'p1', sessionId: 'unknown' },
      sessionShellMap,
    )
    expect(result).toEqual({ type: 'leaf', shell: 'default' })
  })

  it('converts split tree preserving structure', () => {
    const sessionShellMap = new Map([['s1', 'bash'], ['s2', 'zsh']])
    const result = layoutToURLTree(
      {
        type: 'split', direction: 'h', ratio: 0.5,
        first: { type: 'leaf', paneId: 'p1', sessionId: 's1' },
        second: { type: 'leaf', paneId: 'p2', sessionId: 's2' },
      },
      sessionShellMap,
    )
    expect(result).toEqual({
      type: 'split', direction: 'h', ratio: 0.5,
      first: { type: 'leaf', shell: 'bash' },
      second: { type: 'leaf', shell: 'zsh' },
    })
  })
})

describe('urlTreeToLayout', () => {
  it('creates runtime leaf with fresh paneId and pending sessionId', () => {
    const result = urlTreeToLayout({ type: 'leaf', shell: 'bash' })
    expect(result.type).toBe('leaf')
    if (result.type === 'leaf') {
      expect(result.paneId).toBeTruthy()
      expect(result.sessionId).toMatch(/^pending-/)
    }
  })

  it('preserves split structure with fresh IDs', () => {
    const urlTree: URLPaneLayout = {
      type: 'split', direction: 'h', ratio: 0.5,
      first: { type: 'leaf', shell: 'bash' },
      second: { type: 'leaf', shell: 'zsh' },
    }
    const result = urlTreeToLayout(urlTree)
    expect(result.type).toBe('split')
    if (result.type === 'split') {
      expect(result.direction).toBe('h')
      expect(result.ratio).toBe(0.5)
      expect(result.first.type).toBe('leaf')
      expect(result.second.type).toBe('leaf')
    }
  })
})
