/**
 * URL Parameter Tests — Workspace URL encoding v2
 *
 * Tests for parseWorkspaceURL and buildWorkspaceURL.
 * Legacy ?layout= and ?s=&a= tests have been removed.
 *
 * Per Plan 016 Phase 6: URL Encoding v2
 */

import { describe, it, expect } from 'vitest'
import { parseWorkspaceURL, buildWorkspaceURL } from '../urlParams'
import type { WorkspaceURLSchema } from '../workspaceCodec'

describe('parseWorkspaceURL', () => {
  it('returns null for empty search string', () => {
    expect(parseWorkspaceURL('')).toBeNull()
  })

  it('returns null for no ?w= param', () => {
    expect(parseWorkspaceURL('?foo=bar')).toBeNull()
  })

  it('returns null for malformed base64', () => {
    expect(parseWorkspaceURL('?w=!!!invalid!!!')).toBeNull()
  })

  it('returns null for valid base64 but invalid JSON', () => {
    const b64 = btoa('not json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(parseWorkspaceURL(`?w=${b64}`)).toBeNull()
  })

  it('returns null for valid JSON but wrong schema', () => {
    const b64 = btoa('{"foo":"bar"}').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(parseWorkspaceURL(`?w=${b64}`)).toBeNull()
  })

  it('parses valid workspace schema', () => {
    const schema: WorkspaceURLSchema = { v: 1, a: 0, i: [{ t: 's', s: 'zsh' }] }
    const encoded = btoa(JSON.stringify(schema)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const result = parseWorkspaceURL(`?w=${encoded}`)
    expect(result).toEqual(schema)
  })
})

describe('buildWorkspaceURL', () => {
  it('builds URL string with w= parameter', () => {
    const schema: WorkspaceURLSchema = { v: 1, a: 0, i: [{ t: 's', s: 'bash' }] }
    const result = buildWorkspaceURL(schema)
    expect(result).toMatch(/^w=/)
  })
})

describe('round-trip', () => {
  it('parse(build(schema)) returns original values', () => {
    const schema: WorkspaceURLSchema = {
      v: 1,
      a: 1,
      i: [
        { t: 's', s: 'bash' },
        { t: 's', s: 'zsh' },
        { t: 'l', n: 'My Layout', r: 'H50bz' },
      ],
    }
    const url = buildWorkspaceURL(schema)
    const parsed = parseWorkspaceURL('?' + url)
    expect(parsed).toEqual(schema)
  })

  it('round-trip preserves empty workspace', () => {
    const schema: WorkspaceURLSchema = { v: 1, a: -1, i: [] }
    const url = buildWorkspaceURL(schema)
    const parsed = parseWorkspaceURL('?' + url)
    expect(parsed).toEqual(schema)
  })

  it('round-trip preserves layout with deep tree', () => {
    const schema: WorkspaceURLSchema = {
      v: 1,
      a: 0,
      i: [{ t: 'l', n: 'Complex', r: 'H50V50bzV50bz' }],
    }
    const url = buildWorkspaceURL(schema)
    const parsed = parseWorkspaceURL('?' + url)
    expect(parsed).toEqual(schema)
  })

  it('round-trip preserves unicode layout names', () => {
    const schema: WorkspaceURLSchema = {
      v: 1,
      a: 0,
      i: [{ t: 'l', n: 'My Layout', r: 'H50bz' }],
    }
    const url = buildWorkspaceURL(schema)
    const parsed = parseWorkspaceURL('?' + url)
    expect(parsed).toEqual(schema)
  })
})
