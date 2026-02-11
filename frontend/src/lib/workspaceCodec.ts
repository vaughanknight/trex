/**
 * workspaceCodec.ts — Workspace URL encoding/decoding.
 *
 * Encodes complete workspace state (items + active selection) into a
 * base64url-encoded JSON string for the `?w=` URL parameter.
 *
 * Layout subtrees reuse the existing prefix notation codec (layoutCodec.ts).
 *
 * Schema (v1) uses single-char keys for URL compactness:
 * {
 *   v: 1,                    // schema version
 *   a: number,               // active item index (-1 if none)
 *   i: [                     // items array
 *     { t: 's', s: 'zsh' },           // session: shell type
 *     { t: 'l', n: 'Name', r: 'H50bz' }  // layout: name, tree prefix notation
 *   ]
 * }
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 6
 */

import {
  serializeLayout,
  layoutToURLTree,
  parseLayout,
  countURLPanes,
  buildSessionShellMap,
} from './layoutCodec'
import { getAllLeaves } from './layoutTree'
import type { WorkspaceItem } from '../types/workspace'

// ── Base64url utilities ───────────────────────────────────────────────

export function toBase64url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function fromBase64url(str: string): string {
  let s = str.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const binary = atob(s)
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

// ── Schema types ──────────────────────────────────────────────────────

export interface WorkspaceURLSchema {
  v: 1
  a: number
  i: URLItem[]
}

export type URLItem = URLSessionItem | URLLayoutItem

export interface URLSessionItem {
  t: 's'
  s: string
}

export interface URLLayoutItem {
  t: 'l'
  n: string
  r: string
}

// ── Encode ────────────────────────────────────────────────────────────

export function encodeWorkspace(schema: WorkspaceURLSchema): string {
  return toBase64url(JSON.stringify(schema))
}

/**
 * Build a WorkspaceURLSchema from the current workspace + session state.
 * Returns null if any layout has pending (not-yet-created) sessions.
 */
export function buildWorkspaceSchema(
  items: WorkspaceItem[],
  activeItemId: string | null,
  sessions: Map<string, { shellType?: string }>,
): WorkspaceURLSchema | null {
  const shellMap = buildSessionShellMap(sessions)
  const activeIndex = activeItemId
    ? items.findIndex(i => i.id === activeItemId)
    : -1

  const urlItems: URLItem[] = []
  for (const item of items) {
    if (item.type === 'session') {
      const session = sessions.get(item.sessionId)
      urlItems.push({ t: 's', s: session?.shellType ?? 'default' })
    } else if (item.type === 'layout') {
      // Skip if any leaf has a pending session
      const leaves = getAllLeaves(item.tree)
      if (leaves.some(l => l.sessionId.startsWith('pending-'))) return null

      const urlTree = layoutToURLTree(item.tree, shellMap)
      const treeStr = serializeLayout(urlTree)
      urlItems.push({ t: 'l', n: item.name, r: treeStr })
    }
  }

  return { v: 1, a: activeIndex, i: urlItems }
}

// ── Decode ────────────────────────────────────────────────────────────

export function decodeWorkspace(encoded: string): WorkspaceURLSchema | null {
  try {
    const json = fromBase64url(encoded)
    const parsed = JSON.parse(json)
    return validateSchema(parsed) ? parsed : null
  } catch {
    return null
  }
}

function validateSchema(obj: unknown): obj is WorkspaceURLSchema {
  if (!obj || typeof obj !== 'object') return false
  const schema = obj as Record<string, unknown>
  if (schema.v !== 1) return false
  if (typeof schema.a !== 'number') return false
  if (!Array.isArray(schema.i)) return false
  for (const item of schema.i) {
    if (!item || typeof item !== 'object') return false
    const it = item as Record<string, unknown>
    if (it.t === 's') {
      if (typeof it.s !== 'string') return false
    } else if (it.t === 'l') {
      if (typeof it.n !== 'string') return false
      if (typeof it.r !== 'string') return false
    } else {
      return false
    }
  }
  return true
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Count total sessions needed to recreate a workspace from a URL schema */
export function countSchemaSessions(schema: WorkspaceURLSchema): number {
  let count = 0
  for (const item of schema.i) {
    if (item.t === 's') {
      count += 1
    } else if (item.t === 'l') {
      try {
        const tree = parseLayout(item.r)
        count += countURLPanes(tree)
      } catch {
        count += 1
      }
    }
  }
  return count
}
