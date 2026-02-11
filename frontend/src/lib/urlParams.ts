/**
 * URL parameter parsing and building for workspace state.
 *
 * Only supports the ?w= format (base64url-encoded JSON workspace).
 * Legacy ?layout= and ?s=&a= formats have been removed (alpha project, no backward compat).
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 6
 */

import { decodeWorkspace, encodeWorkspace, type WorkspaceURLSchema } from './workspaceCodec'

/** Parse workspace from URL search string. Returns schema or null. */
export function parseWorkspaceURL(search: string): WorkspaceURLSchema | null {
  const params = new URLSearchParams(search)
  const w = params.get('w')
  if (!w) return null
  return decodeWorkspace(w)
}

/** Build URL search string from workspace schema. Returns string without leading '?'. */
export function buildWorkspaceURL(schema: WorkspaceURLSchema): string {
  const encoded = encodeWorkspace(schema)
  return `w=${encoded}`
}
