/**
 * layoutCodec.ts — URL-safe compact layout serializer/parser.
 *
 * Uses prefix notation with no delimiters:
 *   split = direction(H|V) + ratio(2 digits) + first + second
 *   leaf  = shell char (b|z|f|d)
 *
 * Example: H50bz = horizontal split at 50%, bash left, zsh right
 *
 * @see /docs/plans/015-pane-splitting/external-research/url-layout-serialization.md
 */

// --- URL tree types (distinct from runtime PaneLayout which uses sessionId) ---

export type URLPaneLayout = URLPaneLeaf | URLPaneSplit

export interface URLPaneLeaf {
  readonly type: 'leaf'
  readonly shell: Shell
}

export interface URLPaneSplit {
  readonly type: 'split'
  readonly direction: 'h' | 'v'
  readonly ratio: number // 0.01–0.99
  readonly first: URLPaneLayout
  readonly second: URLPaneLayout
}

export type Shell = 'bash' | 'zsh' | 'fish' | 'default'

// --- Constants ---

const SHELL_TO_CHAR: Record<Shell, string> = {
  bash: 'b',
  zsh: 'z',
  fish: 'f',
  default: 'd',
}

const CHAR_TO_SHELL: Record<string, Shell> = {
  b: 'bash',
  z: 'zsh',
  f: 'fish',
  d: 'default',
}

const DIRECTION_TO_CHAR: Record<'h' | 'v', string> = {
  h: 'H',
  v: 'V',
}

const CHAR_TO_DIRECTION: Record<string, 'h' | 'v'> = {
  H: 'h',
  V: 'v',
}

const SHELL_CHARS = new Set(Object.keys(CHAR_TO_SHELL))
const DIRECTION_CHARS = new Set(Object.keys(CHAR_TO_DIRECTION))

// --- Serializer ---

export function serializeLayout(layout: URLPaneLayout): string {
  if (layout.type === 'leaf') {
    const ch = SHELL_TO_CHAR[layout.shell]
    if (!ch) throw new Error(`Unknown shell: ${layout.shell}`)
    return ch
  }

  const ratioPercent = Math.round(layout.ratio * 100)
  if (ratioPercent < 1 || ratioPercent > 99) {
    throw new Error(`Ratio out of range: ${layout.ratio} (must be 0.01-0.99)`)
  }

  const dirChar = DIRECTION_TO_CHAR[layout.direction]
  if (!dirChar) throw new Error(`Unknown direction: ${layout.direction}`)

  const ratioStr = String(ratioPercent).padStart(2, '0')
  return dirChar + ratioStr + serializeLayout(layout.first) + serializeLayout(layout.second)
}

// --- Parser ---

class LayoutParser {
  pos = 0
  input: string
  constructor(input: string) {
    this.input = input
  }

  parse(): URLPaneLayout {
    const result = this.parseNode()
    if (this.pos !== this.input.length) {
      throw new ParseError(
        `Unexpected trailing characters at position ${this.pos}: "${this.input.slice(this.pos)}"`,
        this.pos,
      )
    }
    return result
  }

  parseNode(): URLPaneLayout {
    if (this.pos >= this.input.length) {
      throw new ParseError('Unexpected end of input', this.pos)
    }

    const ch = this.input[this.pos]

    if (DIRECTION_CHARS.has(ch)) {
      return this.parseSplit()
    }

    if (SHELL_CHARS.has(ch)) {
      return this.parseLeaf()
    }

    throw new ParseError(
      `Unexpected character '${ch}' at position ${this.pos}. Expected H, V, b, z, f, or d.`,
      this.pos,
    )
  }

  parseLeaf(): URLPaneLeaf {
    const ch = this.input[this.pos]
    this.pos++
    const shell = CHAR_TO_SHELL[ch]
    return { type: 'leaf', shell }
  }

  parseSplit(): URLPaneSplit {
    const dirChar = this.input[this.pos]
    const direction = CHAR_TO_DIRECTION[dirChar]
    this.pos++

    if (this.pos + 2 > this.input.length) {
      throw new ParseError('Unexpected end of input while reading ratio', this.pos)
    }

    const r1 = this.input[this.pos]
    const r2 = this.input[this.pos + 1]
    this.pos += 2

    if (!/[0-9]/.test(r1) || !/[0-9]/.test(r2)) {
      throw new ParseError(
        `Invalid ratio digits '${r1}${r2}' at position ${this.pos - 2}. Expected two digits (01-99).`,
        this.pos - 2,
      )
    }

    const ratioPercent = parseInt(r1 + r2, 10)
    if (ratioPercent < 1 || ratioPercent > 99) {
      throw new ParseError(
        `Ratio ${ratioPercent}% is out of range (must be 01-99)`,
        this.pos - 2,
      )
    }

    const ratio = ratioPercent / 100
    const first = this.parseNode()
    const second = this.parseNode()

    return { type: 'split', direction, ratio, first, second }
  }
}

export class ParseError extends Error {
  position: number
  constructor(message: string, position: number) {
    super(message)
    this.name = 'LayoutParseError'
    this.position = position
  }
}

export function parseLayout(input: string): URLPaneLayout {
  if (!input || input.length === 0) {
    throw new ParseError('Empty layout string', 0)
  }
  return new LayoutParser(input).parse()
}

// --- Convenience ---

/** Count total leaf panes in a URL layout tree */
export function countURLPanes(layout: URLPaneLayout): number {
  if (layout.type === 'leaf') return 1
  return countURLPanes(layout.first) + countURLPanes(layout.second)
}

/** Validate a layout string, returning either the parsed layout or an error message */
export function validateLayout(
  input: string,
): { ok: true; layout: URLPaneLayout } | { ok: false; error: string } {
  try {
    const layout = parseLayout(input)
    const paneCount = countURLPanes(layout)
    if (paneCount > 8) {
      return { ok: false, error: `Too many panes: ${paneCount} (max 8)` }
    }
    return { ok: true, layout }
  } catch (e) {
    if (e instanceof ParseError) {
      return { ok: false, error: e.message }
    }
    return { ok: false, error: String(e) }
  }
}

/** Verify that serialize(parse(s)) === s */
export function verifyRoundTrip(input: string): boolean {
  try {
    const parsed = parseLayout(input)
    const reserialized = serializeLayout(parsed)
    return reserialized === input
  } catch {
    return false
  }
}

// --- Tree transformation: runtime <-> URL ---

import type { PaneLayout, PaneLeaf } from '../types/layout'

/**
 * Map shell type strings to Shell codec type.
 * Handles common shell names and falls back to 'default'.
 */
function shellTypeToShell(shellType: string | undefined): Shell {
  if (!shellType) return 'default'
  const lower = shellType.toLowerCase()
  if (lower === 'bash' || lower.endsWith('/bash')) return 'bash'
  if (lower === 'zsh' || lower.endsWith('/zsh')) return 'zsh'
  if (lower === 'fish' || lower.endsWith('/fish')) return 'fish'
  return 'default'
}

/**
 * Convert a runtime layout tree to a URL tree.
 * Maps sessionId -> shell type using the provided map.
 */
export function layoutToURLTree(
  layout: PaneLayout,
  sessionShellMap: Map<string, string>,
): URLPaneLayout {
  if (layout.type === 'leaf') {
    const shellType = sessionShellMap.get(layout.sessionId)
    return { type: 'leaf', shell: shellTypeToShell(shellType) }
  }
  return {
    type: 'split',
    direction: layout.direction,
    ratio: layout.ratio,
    first: layoutToURLTree(layout.first, sessionShellMap),
    second: layoutToURLTree(layout.second, sessionShellMap),
  }
}

/**
 * Convert a URL tree to a runtime layout tree.
 * Generates fresh paneIds and uses placeholder sessionIds (pending-<paneId>).
 */
export function urlTreeToLayout(urlTree: URLPaneLayout): PaneLayout {
  if (urlTree.type === 'leaf') {
    const paneId = crypto.randomUUID()
    return {
      type: 'leaf',
      paneId,
      sessionId: `pending-${paneId}`,
    } as PaneLeaf
  }
  return {
    type: 'split',
    direction: urlTree.direction,
    ratio: urlTree.ratio,
    first: urlTreeToLayout(urlTree.first),
    second: urlTreeToLayout(urlTree.second),
  }
}

/**
 * Build a session-to-shell map from the session store state.
 */
export function buildSessionShellMap(
  sessions: Map<string, { shellType?: string }>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const [id, session] of sessions) {
    if (session.shellType) {
      map.set(id, session.shellType)
    }
  }
  return map
}
