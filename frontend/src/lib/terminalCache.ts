/**
 * terminalCache.ts — Keeps xterm.js instances alive across React remounts.
 *
 * When react-resizable-panels restructures on a split, all Panel children
 * are unmounted and remounted. Without caching, every Terminal component
 * disposes its XTerm instance and creates a new one, losing scrollback
 * and causing a visible "Connecting to terminal..." flash.
 *
 * This cache preserves the XTerm instance and its DOM container between
 * React unmount/mount cycles. On remount, the cached DOM element is
 * re-parented into the new container — no XTerm disposal, no flicker.
 *
 * Entries are removed when a session is truly closed (not just remounted).
 */

import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

export interface CachedTerminal {
  terminal: Terminal
  fitAddon: FitAddon
  /** The div that was passed to terminal.open(). We own this, not React. */
  container: HTMLDivElement
}

const cache = new Map<string, CachedTerminal>()

/** Retrieve a cached terminal for a session. Returns undefined if none. */
export function getCachedTerminal(sessionId: string): CachedTerminal | undefined {
  return cache.get(sessionId)
}

/** Store a terminal in the cache (on React unmount). */
export function cacheTerminal(sessionId: string, entry: CachedTerminal): void {
  cache.set(sessionId, entry)
}

/** Remove and dispose a cached terminal (on session close). */
export function disposeCachedTerminal(sessionId: string): void {
  const entry = cache.get(sessionId)
  if (entry) {
    entry.terminal.dispose()
    cache.delete(sessionId)
  }
}

/** Remove a cached terminal without disposing (when we took ownership back). */
export function removeCachedTerminal(sessionId: string): void {
  cache.delete(sessionId)
}

/** Check if a session has a cached terminal. */
export function hasCachedTerminal(sessionId: string): boolean {
  return cache.has(sessionId)
}
