/**
 * URL Parameter Parsing Tests
 *
 * Tests for parseSessionParams and buildSessionParams pure functions.
 * These are the lightweight v1 tests; the test harness in
 * hooks/__tests__/useURLSync.test.ts provides infrastructure for
 * future inflation scenarios.
 *
 * Per Plan 009: URL Routing (T008)
 */

import { describe, it, expect } from 'vitest'
import { parseSessionParams, buildSessionParams } from '../urlParams'

describe('parseSessionParams', () => {
  it('parses valid params ?s=3&a=1', () => {
    const result = parseSessionParams('?s=3&a=1')
    expect(result).toEqual({ sessionCount: 3, activeIndex: 1 })
  })

  it('returns null for negative session count ?s=-1', () => {
    const result = parseSessionParams('?s=-1')
    expect(result).toEqual({ sessionCount: null, activeIndex: null })
  })

  it('returns null for non-numeric session count ?s=abc', () => {
    const result = parseSessionParams('?s=abc')
    expect(result).toEqual({ sessionCount: null, activeIndex: null })
  })

  it('returns null for zero session count ?s=0', () => {
    const result = parseSessionParams('?s=0')
    expect(result).toEqual({ sessionCount: null, activeIndex: null })
  })

  it('returns null for empty search string', () => {
    const result = parseSessionParams('')
    expect(result).toEqual({ sessionCount: null, activeIndex: null })
  })

  it('clamps activeIndex when >= sessionCount', () => {
    const result = parseSessionParams('?s=3&a=5')
    expect(result).toEqual({ sessionCount: 3, activeIndex: 2 })
  })

  it('handles s param without a param', () => {
    const result = parseSessionParams('?s=3')
    expect(result).toEqual({ sessionCount: 3, activeIndex: null })
  })

  it('handles a=0 as valid', () => {
    const result = parseSessionParams('?s=3&a=0')
    expect(result).toEqual({ sessionCount: 3, activeIndex: 0 })
  })
})

describe('buildSessionParams', () => {
  it('builds correct query string', () => {
    const result = buildSessionParams(3, 1)
    expect(result).toBe('s=3&a=1')
  })
})

describe('round-trip', () => {
  it('parse(build(5, 2)) returns original values', () => {
    const params = buildSessionParams(5, 2)
    const parsed = parseSessionParams('?' + params)
    expect(parsed).toEqual({ sessionCount: 5, activeIndex: 2 })
  })
})
