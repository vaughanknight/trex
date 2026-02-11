/**
 * Workspace Codec Tests
 *
 * Tests for workspace URL encoding/decoding including:
 * - Base64url utilities
 * - Schema encode/decode round-trips
 * - Schema validation
 * - buildWorkspaceSchema from workspace state
 * - URL length worst-case scenarios
 *
 * Per Plan 016 Phase 6: URL Encoding v2
 */

import { describe, it, expect } from 'vitest'
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
import type { WorkspaceSessionItem, WorkspaceLayoutItem } from '../../types/workspace'

// ── Base64url utilities ───────────────────────────────────────────────

describe('toBase64url / fromBase64url', () => {
  it('round-trips simple ASCII', () => {
    const input = 'hello world'
    expect(fromBase64url(toBase64url(input))).toBe(input)
  })

  it('round-trips JSON', () => {
    const input = '{"v":1,"a":0,"i":[{"t":"s","s":"bash"}]}'
    expect(fromBase64url(toBase64url(input))).toBe(input)
  })

  it('produces URL-safe characters (no +, /, =)', () => {
    // Use input that produces +, /, = in standard base64
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
    // Manually add padding
    const padded = encoded + '=='
    expect(fromBase64url(encoded)).toBe(input)
    expect(fromBase64url(padded)).toBe(input)
  })
})

// ── Schema encode/decode ──────────────────────────────────────────────

describe('encodeWorkspace / decodeWorkspace', () => {
  it('round-trips empty workspace', () => {
    const schema: WorkspaceURLSchema = { v: 1, a: -1, i: [] }
    const encoded = encodeWorkspace(schema)
    expect(decodeWorkspace(encoded)).toEqual(schema)
  })

  it('round-trips single session', () => {
    const schema: WorkspaceURLSchema = {
      v: 1,
      a: 0,
      i: [{ t: 's', s: 'zsh' }],
    }
    const encoded = encodeWorkspace(schema)
    expect(decodeWorkspace(encoded)).toEqual(schema)
  })

  it('round-trips single layout', () => {
    const schema: WorkspaceURLSchema = {
      v: 1,
      a: 0,
      i: [{ t: 'l', n: 'My Layout', r: 'H50bz' }],
    }
    const encoded = encodeWorkspace(schema)
    expect(decodeWorkspace(encoded)).toEqual(schema)
  })

  it('round-trips mixed workspace', () => {
    const schema: WorkspaceURLSchema = {
      v: 1,
      a: 2,
      i: [
        { t: 's', s: 'bash' },
        { t: 's', s: 'zsh' },
        { t: 'l', n: 'Dev', r: 'H50V50bzV50fd' },
        { t: 's', s: 'fish' },
      ],
    }
    const encoded = encodeWorkspace(schema)
    expect(decodeWorkspace(encoded)).toEqual(schema)
  })

  it('round-trips all shell types', () => {
    const schema: WorkspaceURLSchema = {
      v: 1,
      a: 0,
      i: [
        { t: 's', s: 'bash' },
        { t: 's', s: 'zsh' },
        { t: 's', s: 'fish' },
        { t: 's', s: 'default' },
      ],
    }
    const encoded = encodeWorkspace(schema)
    expect(decodeWorkspace(encoded)).toEqual(schema)
  })
})

// ── Schema validation ─────────────────────────────────────────────────

describe('decodeWorkspace validation', () => {
  it('rejects null', () => {
    expect(decodeWorkspace(toBase64url('null'))).toBeNull()
  })

  it('rejects missing version', () => {
    expect(decodeWorkspace(toBase64url('{"a":0,"i":[]}'))).toBeNull()
  })

  it('rejects wrong version', () => {
    expect(decodeWorkspace(toBase64url('{"v":2,"a":0,"i":[]}'))).toBeNull()
  })

  it('rejects missing active index', () => {
    expect(decodeWorkspace(toBase64url('{"v":1,"i":[]}'))).toBeNull()
  })

  it('rejects missing items', () => {
    expect(decodeWorkspace(toBase64url('{"v":1,"a":0}'))).toBeNull()
  })

  it('rejects item with unknown type', () => {
    expect(decodeWorkspace(toBase64url('{"v":1,"a":0,"i":[{"t":"x"}]}'))).toBeNull()
  })

  it('rejects session item missing shell', () => {
    expect(decodeWorkspace(toBase64url('{"v":1,"a":0,"i":[{"t":"s"}]}'))).toBeNull()
  })

  it('rejects layout item missing name', () => {
    expect(decodeWorkspace(toBase64url('{"v":1,"a":0,"i":[{"t":"l","r":"H50bz"}]}'))).toBeNull()
  })

  it('rejects layout item missing tree', () => {
    expect(decodeWorkspace(toBase64url('{"v":1,"a":0,"i":[{"t":"l","n":"foo"}]}'))).toBeNull()
  })

  it('rejects malformed base64', () => {
    expect(decodeWorkspace('!!!not-base64!!!')).toBeNull()
  })

  it('rejects non-JSON content', () => {
    expect(decodeWorkspace(toBase64url('not json'))).toBeNull()
  })
})

// ── buildWorkspaceSchema ──────────────────────────────────────────────

describe('buildWorkspaceSchema', () => {
  it('builds schema from single session', () => {
    const items: WorkspaceSessionItem[] = [
      { type: 'session', id: 'item-1', sessionId: 'sess-1' },
    ]
    const sessions = new Map([['sess-1', { shellType: 'zsh' }]])
    const schema = buildWorkspaceSchema(items, 'item-1', sessions)

    expect(schema).toEqual({
      v: 1,
      a: 0,
      i: [{ t: 's', s: 'zsh' }],
    })
  })

  it('builds schema from layout', () => {
    const items: WorkspaceLayoutItem[] = [
      {
        type: 'layout',
        id: 'item-1',
        name: 'Dev',
        tree: {
          type: 'split',
          direction: 'h',
          ratio: 0.5,
          first: { type: 'leaf', paneId: 'p1', sessionId: 'sess-1' },
          second: { type: 'leaf', paneId: 'p2', sessionId: 'sess-2' },
        },
        focusedPaneId: 'p1',
      },
    ]
    const sessions = new Map([
      ['sess-1', { shellType: 'bash' }],
      ['sess-2', { shellType: 'zsh' }],
    ])
    const schema = buildWorkspaceSchema(items, 'item-1', sessions)

    expect(schema).toEqual({
      v: 1,
      a: 0,
      i: [{ t: 'l', n: 'Dev', r: 'H50bz' }],
    })
  })

  it('returns null if layout has pending sessions', () => {
    const items: WorkspaceLayoutItem[] = [
      {
        type: 'layout',
        id: 'item-1',
        name: 'Dev',
        tree: {
          type: 'split',
          direction: 'h',
          ratio: 0.5,
          first: { type: 'leaf', paneId: 'p1', sessionId: 'pending-p1' },
          second: { type: 'leaf', paneId: 'p2', sessionId: 'sess-2' },
        },
        focusedPaneId: 'p1',
      },
    ]
    const sessions = new Map([['sess-2', { shellType: 'zsh' }]])
    expect(buildWorkspaceSchema(items, 'item-1', sessions)).toBeNull()
  })

  it('sets active index to -1 when no active item', () => {
    const items: WorkspaceSessionItem[] = [
      { type: 'session', id: 'item-1', sessionId: 'sess-1' },
    ]
    const sessions = new Map([['sess-1', { shellType: 'bash' }]])
    const schema = buildWorkspaceSchema(items, null, sessions)
    expect(schema?.a).toBe(-1)
  })

  it('defaults shell to "default" when session not found', () => {
    const items: WorkspaceSessionItem[] = [
      { type: 'session', id: 'item-1', sessionId: 'sess-1' },
    ]
    const sessions = new Map<string, { shellType?: string }>()
    const schema = buildWorkspaceSchema(items, null, sessions)
    expect(schema?.i[0]).toEqual({ t: 's', s: 'default' })
  })
})

// ── countSchemaSessions ───────────────────────────────────────────────

describe('countSchemaSessions', () => {
  it('counts sessions in standalone items', () => {
    const schema: WorkspaceURLSchema = {
      v: 1,
      a: 0,
      i: [{ t: 's', s: 'bash' }, { t: 's', s: 'zsh' }],
    }
    expect(countSchemaSessions(schema)).toBe(2)
  })

  it('counts panes in layout items', () => {
    const schema: WorkspaceURLSchema = {
      v: 1,
      a: 0,
      i: [{ t: 'l', n: 'Dev', r: 'H50bz' }],
    }
    expect(countSchemaSessions(schema)).toBe(2)
  })

  it('counts mixed workspace', () => {
    const schema: WorkspaceURLSchema = {
      v: 1,
      a: 0,
      i: [
        { t: 's', s: 'bash' },
        { t: 'l', n: 'Dev', r: 'H50V50bzV50fd' },
      ],
    }
    expect(countSchemaSessions(schema)).toBe(5) // 1 + 4
  })

  it('returns 0 for empty workspace', () => {
    expect(countSchemaSessions({ v: 1, a: -1, i: [] })).toBe(0)
  })
})

// ── URL length worst-case ─────────────────────────────────────────────

describe('URL length', () => {
  it('5 layouts x 8 panes each stays under 2000 chars', () => {
    // Worst case: 5 layouts each with 8 panes (deeply nested tree)
    const schema: WorkspaceURLSchema = {
      v: 1,
      a: 0,
      i: Array.from({ length: 5 }, (_, i) => ({
        t: 'l' as const,
        n: `Layout ${i + 1}`,
        // 8-pane tree: H50(V50(H50(b,z),H50(b,z)),V50(H50(b,z),H50(b,z)))
        r: 'H50V50H50bzH50bzV50H50bzH50bz',
      })),
    }
    const url = buildWorkspaceURL(schema)
    expect(url.length).toBeLessThan(2000)
  })
})
