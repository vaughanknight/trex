/**
 * Workspace Codec Tests — v2 JSON tree format with fflate compression
 *
 * Tests for workspace URL encoding/decoding including:
 * - Base64url utilities
 * - Schema encode/decode round-trips (gzip compressed)
 * - Schema validation
 * - buildWorkspaceSchema from workspace state
 * - countSchemaSessions with tree-based items
 * - tmux per-leaf metadata
 * - URL length worst-case scenarios
 */

import { describe, it, expect } from 'vitest'
import { gzipSync } from 'fflate'
import {
  toBase64url,
  fromBase64url,
  encodeWorkspace,
  decodeWorkspace,
  buildWorkspaceSchema,
  countSchemaSessions,
  type WorkspaceURLSchema,
} from '../workspaceCodec'
import { buildWorkspaceURL } from '../urlParams'
import type { WorkspaceItem } from '../../types/workspace'

/** Helper: gzip-compress a JSON string and return base64url (for validation tests) */
function compressJSON(json: string): string {
  const bytes = new TextEncoder().encode(json)
  const compressed = gzipSync(bytes)
  let binary = ''
  compressed.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ── Base64url utilities ───────────────────────────────────────────────

describe('toBase64url / fromBase64url', () => {
  it('round-trips simple ASCII', () => {
    const input = 'hello world'
    expect(fromBase64url(toBase64url(input))).toBe(input)
  })

  it('round-trips JSON', () => {
    const input = '{"v":2,"a":0,"i":[{"n":"bash","t":{"sh":"bash"}}]}'
    expect(fromBase64url(toBase64url(input))).toBe(input)
  })

  it('produces URL-safe characters (no +, /, =)', () => {
    const input = '???>>>'
    const encoded = toBase64url(input)
    expect(encoded).not.toMatch(/[+/=]/)
  })

  it('handles empty string', () => {
    expect(fromBase64url(toBase64url(''))).toBe('')
  })

  it('handles unicode characters', () => {
    const input = 'Layout: test'
    expect(fromBase64url(toBase64url(input))).toBe(input)
  })

  it('decodes padded and unpadded equally', () => {
    const input = 'test'
    const encoded = toBase64url(input)
    const padded = encoded + '=='
    expect(fromBase64url(encoded)).toBe(input)
    expect(fromBase64url(padded)).toBe(input)
  })
})

// ── Schema encode/decode ──────────────────────────────────────────────

describe('encodeWorkspace / decodeWorkspace', () => {
  it('round-trips empty workspace', () => {
    const schema: WorkspaceURLSchema = { v: 2, a: -1, i: [] }
    const encoded = encodeWorkspace(schema)
    expect(decodeWorkspace(encoded)).toEqual(schema)
  })

  it('round-trips single terminal item', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: [{ n: 'zsh', t: { sh: 'zsh' } }],
    }
    const encoded = encodeWorkspace(schema)
    expect(decodeWorkspace(encoded)).toEqual(schema)
  })

  it('round-trips item with split tree', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: [{ n: 'Dev', t: { d: 'h', r: 0.5, 1: { sh: 'bash' }, 2: { sh: 'zsh' } } }],
    }
    const encoded = encodeWorkspace(schema)
    expect(decodeWorkspace(encoded)).toEqual(schema)
  })

  it('round-trips mixed workspace', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 2,
      i: [
        { n: 'bash', t: { sh: 'bash' } },
        { n: 'zsh', t: { sh: 'zsh' } },
        {
          n: 'Dev',
          t: {
            d: 'h', r: 0.5,
            1: { d: 'v', r: 0.5, 1: { sh: 'bash' }, 2: { sh: 'zsh' } },
            2: { d: 'v', r: 0.5, 1: { sh: 'fish' }, 2: { sh: 'default' } },
          },
        },
        { n: 'fish', t: { sh: 'fish' } },
      ],
    }
    const encoded = encodeWorkspace(schema)
    expect(decodeWorkspace(encoded)).toEqual(schema)
  })

  it('round-trips all shell types', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: [
        { n: 'bash', t: { sh: 'bash' } },
        { n: 'zsh', t: { sh: 'zsh' } },
        { n: 'fish', t: { sh: 'fish' } },
        { n: 'default', t: { sh: 'default' } },
      ],
    }
    const encoded = encodeWorkspace(schema)
    expect(decodeWorkspace(encoded)).toEqual(schema)
  })

  it('round-trips item with userRenamed and focusedPaneId', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: [{ n: 'My Shell', t: { sh: 'bash' }, ur: true, fp: 0 }],
    }
    const encoded = encodeWorkspace(schema)
    expect(decodeWorkspace(encoded)).toEqual(schema)
  })

  it('round-trips item with cwd', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: [{ n: 'project', t: { sh: 'bash', c: '/home/user/project' } }],
    }
    const encoded = encodeWorkspace(schema)
    expect(decodeWorkspace(encoded)).toEqual(schema)
  })
})

// ── Schema validation ─────────────────────────────────────────────────

describe('decodeWorkspace validation', () => {
  it('rejects null', () => {
    expect(decodeWorkspace(compressJSON('null'))).toBeNull()
  })

  it('rejects missing version', () => {
    expect(decodeWorkspace(compressJSON('{"a":0,"i":[]}'))).toBeNull()
  })

  it('rejects wrong version (v:1)', () => {
    expect(decodeWorkspace(compressJSON('{"v":1,"a":0,"i":[]}'))).toBeNull()
  })

  it('rejects wrong version (v:99)', () => {
    expect(decodeWorkspace(compressJSON('{"v":99,"a":0,"i":[]}'))).toBeNull()
  })

  it('rejects missing active index', () => {
    expect(decodeWorkspace(compressJSON('{"v":2,"i":[]}'))).toBeNull()
  })

  it('rejects missing items', () => {
    expect(decodeWorkspace(compressJSON('{"v":2,"a":0}'))).toBeNull()
  })

  it('rejects item missing name', () => {
    expect(decodeWorkspace(compressJSON('{"v":2,"a":0,"i":[{"t":{"sh":"bash"}}]}'))).toBeNull()
  })

  it('rejects item missing tree', () => {
    expect(decodeWorkspace(compressJSON('{"v":2,"a":0,"i":[{"n":"foo"}]}'))).toBeNull()
  })

  it('rejects malformed base64', () => {
    expect(decodeWorkspace('!!!not-base64!!!')).toBeNull()
  })

  it('rejects non-gzip content', () => {
    // Plain base64url JSON (not gzip compressed) should fail
    expect(decodeWorkspace(toBase64url('{"v":2,"a":0,"i":[]}'))).toBeNull()
  })

  it('accepts valid v:2 schema', () => {
    const schema: WorkspaceURLSchema = { v: 2, a: 0, i: [{ n: 'bash', t: { sh: 'bash' } }] }
    const encoded = encodeWorkspace(schema)
    expect(decodeWorkspace(encoded)).toEqual(schema)
  })
})

// ── buildWorkspaceSchema ──────────────────────────────────────────────

describe('buildWorkspaceSchema', () => {
  it('builds schema from single session', () => {
    const items: WorkspaceItem[] = [
      {
        id: 'item-1',
        name: 'zsh',
        tree: { type: 'terminal' as const, paneId: 'pane-1', sessionId: 'sess-1' },
        focusedPaneId: 'pane-1',
        userRenamed: false,
      },
    ]
    const sessions = new Map([['sess-1', { shellType: 'zsh' }]])
    const schema = buildWorkspaceSchema(items, 'item-1', sessions)

    expect(schema).toEqual({
      v: 2,
      a: 0,
      i: [{ n: 'zsh', t: { sh: 'zsh' }, fp: 0 }],
    })
  })

  it('builds schema from split layout', () => {
    const items: WorkspaceItem[] = [
      {
        id: 'item-1',
        name: 'Dev',
        tree: {
          type: 'split' as const,
          direction: 'h' as const,
          ratio: 0.5,
          first: { type: 'terminal' as const, paneId: 'p1', sessionId: 'sess-1' },
          second: { type: 'terminal' as const, paneId: 'p2', sessionId: 'sess-2' },
        },
        focusedPaneId: 'p1',
        userRenamed: false,
      },
    ]
    const sessions = new Map([
      ['sess-1', { shellType: 'bash' }],
      ['sess-2', { shellType: 'zsh' }],
    ])
    const schema = buildWorkspaceSchema(items, 'item-1', sessions)

    expect(schema).toEqual({
      v: 2,
      a: 0,
      i: [{
        n: 'Dev',
        t: { d: 'h', r: 0.5, 1: { sh: 'bash' }, 2: { sh: 'zsh' } },
        fp: 0,
      }],
    })
  })

  it('returns null if layout has pending sessions', () => {
    const items: WorkspaceItem[] = [
      {
        id: 'item-1',
        name: 'Dev',
        tree: {
          type: 'split' as const,
          direction: 'h' as const,
          ratio: 0.5,
          first: { type: 'terminal' as const, paneId: 'p1', sessionId: 'pending-p1' },
          second: { type: 'terminal' as const, paneId: 'p2', sessionId: 'sess-2' },
        },
        focusedPaneId: 'p1',
        userRenamed: false,
      },
    ]
    const sessions = new Map([['sess-2', { shellType: 'zsh' }]])
    expect(buildWorkspaceSchema(items, 'item-1', sessions)).toBeNull()
  })

  it('sets active index to -1 when no active item', () => {
    const items: WorkspaceItem[] = [
      {
        id: 'item-1',
        name: 'bash',
        tree: { type: 'terminal' as const, paneId: 'pane-1', sessionId: 'sess-1' },
        focusedPaneId: 'pane-1',
        userRenamed: false,
      },
    ]
    const sessions = new Map([['sess-1', { shellType: 'bash' }]])
    const schema = buildWorkspaceSchema(items, null, sessions)
    expect(schema?.a).toBe(-1)
  })

  it('defaults shell to "default" when session not found', () => {
    const items: WorkspaceItem[] = [
      {
        id: 'item-1',
        name: 'shell',
        tree: { type: 'terminal' as const, paneId: 'pane-1', sessionId: 'sess-1' },
        focusedPaneId: 'pane-1',
        userRenamed: false,
      },
    ]
    const sessions = new Map<string, { shellType?: string; cwd?: string }>()
    const schema = buildWorkspaceSchema(items, null, sessions)
    expect(schema?.i[0]).toEqual({ n: 'shell', t: { sh: 'default' }, fp: 0 })
  })

  it('includes cwd when session has cwd', () => {
    const items: WorkspaceItem[] = [
      {
        id: 'item-1',
        name: 'project',
        tree: { type: 'terminal' as const, paneId: 'pane-1', sessionId: 'sess-1' },
        focusedPaneId: 'pane-1',
        userRenamed: false,
      },
    ]
    const sessions = new Map([['sess-1', { shellType: 'bash', cwd: '/home/user/project' }]])
    const schema = buildWorkspaceSchema(items, 'item-1', sessions)
    expect(schema?.i[0]).toEqual({
      n: 'project',
      t: { sh: 'bash', c: '/home/user/project' },
      fp: 0,
    })
  })

  it('sets userRenamed flag when item is renamed', () => {
    const items: WorkspaceItem[] = [
      {
        id: 'item-1',
        name: 'My Custom Name',
        tree: { type: 'terminal' as const, paneId: 'pane-1', sessionId: 'sess-1' },
        focusedPaneId: 'pane-1',
        userRenamed: true,
      },
    ]
    const sessions = new Map([['sess-1', { shellType: 'bash' }]])
    const schema = buildWorkspaceSchema(items, 'item-1', sessions)
    expect(schema?.i[0].ur).toBe(true)
  })
})

// ── countSchemaSessions ───────────────────────────────────────────────

describe('countSchemaSessions', () => {
  it('counts single-leaf items', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: [
        { n: 'bash', t: { sh: 'bash' } },
        { n: 'zsh', t: { sh: 'zsh' } },
      ],
    }
    expect(countSchemaSessions(schema)).toBe(2)
  })

  it('counts leaves in split tree', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: [{ n: 'Dev', t: { d: 'h', r: 0.5, 1: { sh: 'bash' }, 2: { sh: 'zsh' } } }],
    }
    expect(countSchemaSessions(schema)).toBe(2)
  })

  it('counts mixed workspace', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: [
        { n: 'bash', t: { sh: 'bash' } },
        {
          n: 'Dev',
          t: {
            d: 'h', r: 0.5,
            1: { d: 'v', r: 0.5, 1: { sh: 'bash' }, 2: { sh: 'zsh' } },
            2: { d: 'v', r: 0.5, 1: { sh: 'fish' }, 2: { sh: 'default' } },
          },
        },
      ],
    }
    expect(countSchemaSessions(schema)).toBe(5) // 1 + 4
  })

  it('returns 0 for empty workspace', () => {
    expect(countSchemaSessions({ v: 2, a: -1, i: [] })).toBe(0)
  })
})

// ── URL length worst-case ─────────────────────────────────────────────

describe('URL length', () => {
  it('5 layouts x 8 panes each stays under 2000 chars', () => {
    // Build an 8-pane tree: H50(V50(H50(b,z),H50(b,z)),V50(H50(b,z),H50(b,z)))
    const leaf = (sh: string) => ({ sh })
    const split = (d: 'h' | 'v', n1: any, n2: any) => ({ d, r: 0.5, 1: n1, 2: n2 })
    const eightPaneTree = split('h',
      split('v', split('h', leaf('bash'), leaf('zsh')), split('h', leaf('bash'), leaf('zsh'))),
      split('v', split('h', leaf('bash'), leaf('zsh')), split('h', leaf('bash'), leaf('zsh'))),
    )

    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: Array.from({ length: 5 }, (_, i) => ({
        n: `Layout ${i + 1}`,
        t: eightPaneTree,
      })),
    }
    const url = buildWorkspaceURL(schema)
    expect(url.length).toBeLessThan(2000)
  })
})

// ── tmux per-leaf metadata ───────────────────────────────────────────

describe('workspace codec tmux extension', () => {
  it('encodes leaf with tmux metadata', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: [{ n: 'tmux-work', t: { sh: 'tmux', tm: 'work', tw: 0 } }],
    }
    const encoded = encodeWorkspace(schema)
    const decoded = decodeWorkspace(encoded)
    expect(decoded).toEqual(schema)
    const leaf = decoded!.i[0].t as { sh: string; tm?: string; tw?: number }
    expect(leaf.tm).toBe('work')
    expect(leaf.tw).toBe(0)
  })

  it('encodes leaf with tmux name and non-zero window index', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: [{ n: 'tmux-dev', t: { sh: 'tmux', tm: 'dev', tw: 3 } }],
    }
    const encoded = encodeWorkspace(schema)
    const decoded = decodeWorkspace(encoded)
    expect(decoded).toEqual(schema)
    const leaf = decoded!.i[0].t as { sh: string; tm?: string; tw?: number }
    expect(leaf.tm).toBe('dev')
    expect(leaf.tw).toBe(3)
  })

  it('round-trips leaf without tmux metadata', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: [{ n: 'zsh', t: { sh: 'zsh' } }],
    }
    const encoded = encodeWorkspace(schema)
    const decoded = decodeWorkspace(encoded)
    expect(decoded).toEqual(schema)
    const leaf = decoded!.i[0].t as { sh: string; tm?: string; tw?: number }
    expect(leaf.tm).toBeUndefined()
    expect(leaf.tw).toBeUndefined()
  })

  it('round-trips split tree with tmux and regular leaves', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: [
        { n: 'bash', t: { sh: 'bash' } },
        {
          n: 'Dev',
          t: {
            d: 'h', r: 0.5,
            1: { sh: 'tmux', tm: 'work', tw: 0 },
            2: { sh: 'zsh' },
          },
        },
        { n: 'tmux-monitor', t: { sh: 'tmux', tm: 'monitor', tw: 2 } },
      ],
    }
    const encoded = encodeWorkspace(schema)
    const decoded = decodeWorkspace(encoded)
    expect(decoded).toEqual(schema)
  })

  it('handles tmux session name with dots, hyphens, underscores', () => {
    const schema: WorkspaceURLSchema = {
      v: 2,
      a: 0,
      i: [{ n: 'project', t: { sh: 'tmux', tm: 'my-project_v2.1', tw: 0 } }],
    }
    const encoded = encodeWorkspace(schema)
    const decoded = decodeWorkspace(encoded)
    expect(decoded).toEqual(schema)
  })
})

describe('buildWorkspaceSchema with tmux metadata', () => {
  it('includes tmux metadata in leaf when session has tmuxSessionName', () => {
    const items: WorkspaceItem[] = [
      {
        id: 'item-1',
        name: 'tmux-work',
        tree: { type: 'terminal' as const, paneId: 'pane-1', sessionId: 'sess-1' },
        focusedPaneId: 'pane-1',
        userRenamed: false,
      },
    ]
    const sessions = new Map([['sess-1', { shellType: 'zsh', tmuxSessionName: 'work' }]])
    const schema = buildWorkspaceSchema(items, 'item-1', sessions)

    expect(schema).toEqual({
      v: 2,
      a: 0,
      i: [{ n: 'tmux-work', t: { sh: 'tmux', tm: 'work' }, fp: 0 }],
    })
  })

  it('omits tmux metadata when session has no tmuxSessionName', () => {
    const items: WorkspaceItem[] = [
      {
        id: 'item-1',
        name: 'bash',
        tree: { type: 'terminal' as const, paneId: 'pane-1', sessionId: 'sess-1' },
        focusedPaneId: 'pane-1',
        userRenamed: false,
      },
    ]
    const sessions = new Map([['sess-1', { shellType: 'bash' }]])
    const schema = buildWorkspaceSchema(items, 'item-1', sessions)

    expect(schema).toEqual({
      v: 2,
      a: 0,
      i: [{ n: 'bash', t: { sh: 'bash' }, fp: 0 }],
    })
  })

  it('handles mixed workspace with tmux and regular sessions', () => {
    const items: WorkspaceItem[] = [
      {
        id: 'item-1',
        name: 'bash',
        tree: { type: 'terminal' as const, paneId: 'pane-1', sessionId: 'sess-1' },
        focusedPaneId: 'pane-1',
        userRenamed: false,
      },
      {
        id: 'item-2',
        name: 'tmux-dev',
        tree: { type: 'terminal' as const, paneId: 'pane-2', sessionId: 'sess-2' },
        focusedPaneId: 'pane-2',
        userRenamed: false,
      },
    ]
    const sessions = new Map([
      ['sess-1', { shellType: 'bash' }],
      ['sess-2', { shellType: 'zsh', tmuxSessionName: 'dev' }],
    ])
    const schema = buildWorkspaceSchema(items, 'item-2', sessions)

    expect(schema?.i[0]).toEqual({ n: 'bash', t: { sh: 'bash' }, fp: 0 })
    expect(schema?.i[1]).toEqual({ n: 'tmux-dev', t: { sh: 'tmux', tm: 'dev' }, fp: 0 })
  })
})
