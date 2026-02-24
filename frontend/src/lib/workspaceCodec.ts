/**
 * workspaceCodec.ts — Workspace URL encoding/decoding.
 *
 * Encodes complete workspace state into a gzip-compressed, base64url-encoded
 * JSON string for the `?w=` URL parameter. Full per-pane metadata (shell type,
 * cwd, tmux session name, tmux window index) is stored in a JSON tree.
 *
 * Encoding pipeline: WorkspaceState → JSON → fflate.gzip → base64url
 * Decoding pipeline: base64url → fflate.gunzip → JSON → WorkspaceState
 *
 * @see /docs/plans/023-tmux-session-reconnect/tmux-session-reconnect-plan.md
 * @see /docs/adr/0012-compressed-json-url-encoding.md
 */

import { gzipSync, gunzipSync } from 'fflate'
import { getTerminalLeaves } from './layoutTree'
import type { PaneLayout } from '../types/layout'
import type { WorkspaceItem } from '../types/workspace'

// ── Schema types (JSON tree encoding) ─────────────────────────────────

export interface WorkspaceURLSchema {
  v: 2
  a: number // active item index (-1 if none)
  i: URLItem[]
}

/** Per-pane leaf metadata in URL tree */
export interface URLTerminalLeaf {
  /** shell type (bash, zsh, fish, etc.) */
  sh: string
  /** current working directory */
  c?: string
  /** tmux session name */
  tm?: string
  /** tmux window index */
  tw?: number
}

/** Split node in URL tree */
export interface URLSplitNode {
  /** split direction */
  d: 'h' | 'v'
  /** ratio (0.1-0.9) */
  r: number
  /** first child (left/top) */
  1: URLTreeNode
  /** second child (right/bottom) */
  2: URLTreeNode
}

/** Preview leaf in URL tree */
export interface URLPreviewLeaf {
  /** content type */
  p: 'markdown' | 'text' | 'url'
  /** source */
  s: string
}

export type URLTreeNode = URLTerminalLeaf | URLSplitNode | URLPreviewLeaf

/** Workspace item in URL */
export interface URLItem {
  /** item name */
  n: string
  /** user renamed flag */
  ur?: boolean
  /** tree (JSON structure) */
  t: URLTreeNode
  /** focused pane index (leaf index in pre-order traversal, -1 if none) */
  fp?: number
}

// ── Encode ────────────────────────────────────────────────────────────

/** Compress and base64url-encode a workspace schema */
export function encodeWorkspace(schema: WorkspaceURLSchema): string {
  const json = JSON.stringify(schema)
  const bytes = new TextEncoder().encode(json)
  const compressed = gzipSync(bytes)
  return uint8ToBase64url(compressed)
}

/** Convert runtime PaneLayout tree to URL tree node */
function layoutToURLTree(
  tree: PaneLayout,
  sessions: Map<string, { shellType?: string; cwd?: string; tmuxSessionName?: string }>,
): URLTreeNode {
  if (tree.type === 'terminal') {
    const session = sessions.get(tree.sessionId)
    const leaf: URLTerminalLeaf = { sh: session?.shellType ?? 'default' }
    if (session?.cwd) leaf.c = session.cwd
    if (session?.tmuxSessionName) {
      leaf.tm = session.tmuxSessionName
      leaf.sh = 'tmux'
    }
    return leaf
  }
  if (tree.type === 'preview') {
    return { p: tree.contentType, s: tree.source }
  }
  return {
    d: tree.direction,
    r: tree.ratio,
    1: layoutToURLTree(tree.first, sessions),
    2: layoutToURLTree(tree.second, sessions),
  }
}

/** Get the pre-order leaf index of a pane by its paneId */
function getFocusedPaneIndex(tree: PaneLayout, focusedPaneId: string | null): number {
  if (!focusedPaneId) return -1
  let index = 0
  function walk(node: PaneLayout): boolean {
    if (node.type === 'terminal' || node.type === 'preview') {
      if (node.paneId === focusedPaneId) return true
      index++
      return false
    }
    if (walk(node.first)) return true
    return walk(node.second)
  }
  return walk(tree) ? index : -1
}

/**
 * Build a WorkspaceURLSchema from the current workspace + session state.
 * Returns null if any layout has pending (not-yet-created) sessions.
 */
export function buildWorkspaceSchema(
  items: WorkspaceItem[],
  activeItemId: string | null,
  sessions: Map<string, { shellType?: string; cwd?: string; tmuxSessionName?: string }>,
): WorkspaceURLSchema | null {
  const activeIndex = activeItemId
    ? items.findIndex(i => i.id === activeItemId)
    : -1

  const urlItems: URLItem[] = []
  for (const item of items) {
    const leaves = getTerminalLeaves(item.tree)
    if (leaves.some(l => l.sessionId.startsWith('pending-'))) return null

    const urlTree = layoutToURLTree(item.tree, sessions)
    const urlItem: URLItem = { n: item.name, t: urlTree }
    if (item.userRenamed) urlItem.ur = true
    const fp = getFocusedPaneIndex(item.tree, item.focusedPaneId)
    if (fp >= 0) urlItem.fp = fp

    urlItems.push(urlItem)
  }

  return { v: 2, a: activeIndex, i: urlItems }
}

// ── Decode ────────────────────────────────────────────────────────────

/** Decode a base64url-encoded, gzip-compressed workspace schema */
export function decodeWorkspace(encoded: string): WorkspaceURLSchema | null {
  try {
    const compressed = base64urlToUint8(encoded)
    const decompressed = gunzipSync(compressed)
    const json = new TextDecoder().decode(decompressed)
    const parsed = JSON.parse(json)
    return validateSchema(parsed) ? parsed : null
  } catch {
    return null
  }
}

function validateSchema(obj: unknown): obj is WorkspaceURLSchema {
  if (!obj || typeof obj !== 'object') return false
  const schema = obj as Record<string, unknown>
  if (schema.v !== 2) return false
  if (typeof schema.a !== 'number') return false
  if (!Array.isArray(schema.i)) return false
  for (const item of schema.i) {
    if (!item || typeof item !== 'object') return false
    const it = item as Record<string, unknown>
    if (typeof it.n !== 'string') return false
    if (!it.t || typeof it.t !== 'object') return false
  }
  return true
}

/** Convert a URL tree node back to a runtime PaneLayout */
export function urlTreeToLayout(node: URLTreeNode): PaneLayout {
  if ('sh' in node) {
    // Terminal leaf
    const paneId = crypto.randomUUID()
    return {
      type: 'terminal' as const,
      paneId,
      sessionId: `pending-${paneId}`,
    }
  }
  if ('p' in node) {
    // Preview leaf
    const paneId = crypto.randomUUID()
    return {
      type: 'preview' as const,
      paneId,
      contentType: node.p,
      source: node.s,
    }
  }
  // Split node
  return {
    type: 'split' as const,
    direction: node.d,
    ratio: node.r,
    first: urlTreeToLayout(node[1]),
    second: urlTreeToLayout(node[2]),
  }
}

/** Get the paneId of the Nth leaf (pre-order) in a tree */
export function getPaneIdByIndex(tree: PaneLayout, targetIndex: number): string | null {
  let index = 0
  function walk(node: PaneLayout): string | null {
    if (node.type === 'terminal' || node.type === 'preview') {
      if (index === targetIndex) return node.paneId
      index++
      return null
    }
    const r = walk(node.first)
    if (r) return r
    return walk(node.second)
  }
  return walk(tree)
}

/** Collect terminal leaf metadata from URL tree (for session creation) */
export function collectLeafMetadata(node: URLTreeNode): URLTerminalLeaf[] {
  if ('sh' in node) return [node]
  if ('p' in node) return []
  return [...collectLeafMetadata(node[1]), ...collectLeafMetadata(node[2])]
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Count total sessions needed to recreate a workspace from a URL schema */
export function countSchemaSessions(schema: WorkspaceURLSchema): number {
  let count = 0
  for (const item of schema.i) {
    count += collectLeafMetadata(item.t).length
  }
  return count
}

// ── Base64url ↔ Uint8Array utilities ──────────────────────────────────

function uint8ToBase64url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64urlToUint8(str: string): Uint8Array {
  let s = str.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const binary = atob(s)
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

// Legacy exports for backward compat during migration (will be removed)
export const toBase64url = (str: string) => {
  const bytes = new TextEncoder().encode(str)
  return uint8ToBase64url(bytes)
}
export const fromBase64url = (str: string) => {
  const bytes = base64urlToUint8(str)
  return new TextDecoder().decode(bytes)
}
