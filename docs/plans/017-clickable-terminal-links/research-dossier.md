# Research Report: Clickable Terminal Links

**Generated**: 2026-02-13T00:00:00Z
**Research Query**: "Make links clickable within the terminal — URLs, file paths, IPs, emails, custom patterns"
**Mode**: Pre-Plan
**Location**: docs/plans/017-clickable-terminal-links/research-dossier.md
**FlowSpace**: Not Available (GraphConfig missing — standard tools used)
**Findings**: ~65 findings across 8 subagents

---

## Executive Summary

### What It Does
Terminal output in trex currently renders all text as plain, unclickable content. This feature will detect URLs, file paths, IP addresses, email addresses, and custom regex patterns within terminal output, making them visually distinct on hover and actionable via Cmd/Ctrl+Click, context menu, and in-app preview.

### Business Purpose
Every modern terminal (VS Code, iTerm2, Hyper, Warp) supports clickable links. This is a quality-of-life feature that eliminates copy-paste friction when working with terminal output containing URLs (build logs, error messages, API endpoints, documentation links).

### Key Insights
1. **xterm.js natively supports link providers** — `registerLinkProvider()` is a public API in v6.0.0 (no addon required for basic link detection)
2. **`@xterm/addon-web-links` is NOT installed** but was recommended in the project's own research dossier (`docs/research/frontend-terminal-libraries.md`)
3. **Terminal caching preserves addons** — link addons loaded on init survive React remounts through the terminal cache system
4. **Rich context menu infrastructure exists** — shadcn/ui ContextMenu components + established patterns in SessionContextMenu/LayoutContextMenu
5. **Settings store has backwards-compatible merge** — new link settings integrate cleanly following the existing pattern

### Quick Stats
- **Components to modify**: ~5 files (Terminal.tsx, settings.ts, ui.ts, PaneContainer.tsx, App.tsx)
- **New components**: ~5 files (LinkContextMenu, LinkPreviewPanel, MarkdownPreview, useTerminalLinks hook, link settings UI)
- **New dependencies**: `@xterm/addon-web-links`, `react-markdown`, `rehype-sanitize`, `rehype-raw`
- **Test Coverage**: Fakes-only per ADR-0004; store tests + hook tests + integration tests
- **Prior Learnings**: 8 relevant discoveries from previous plans

---

## User Requirements (From Q&A)

| # | Requirement | Decision |
|---|-------------|----------|
| 1 | Link target | System browser + in-app preview (side panel or new pane, configurable) |
| 2 | Link types | Everything: URLs, file paths, IPs, emails, custom regex patterns |
| 3 | Activation | Cmd/Ctrl+Click (matches VS Code/iTerm2) |
| 4 | Visual style | Underline on hover with modifier held |
| 5 | File paths | `vscode://` protocol for code files; configurable editor is wishlist |
| 6 | Custom patterns | Settings UI with regex → URL template pairs |
| 7 | Context menu | Full: Open Link, Copy URL, Open in Preview, Copy as Markdown |
| 8 | In-app preview | Side panel OR new pane (selectable in settings) |
| 9 | Scope | All content including scrollback buffer |
| 10 | Long URLs | Detect full URL including line-wrapped |
| 11 | Markdown preview | In-scope: render markdown files in a new pane via trex's own server |

---

## How It Currently Works

### Entry Points
The terminal has ZERO link detection or mouse click handling infrastructure.

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| `Terminal.tsx` | Component | `frontend/src/components/Terminal.tsx` | xterm.js wrapper — init, addons, events |
| `PaneContainer.tsx` | Component | `frontend/src/components/PaneContainer.tsx` | Wraps Terminal + title bar + overlays |
| `useCentralWebSocket` | Hook | `frontend/src/hooks/useCentralWebSocket.ts` | Singleton WS, routes output to terminals |
| Settings store | Store | `frontend/src/stores/settings.ts` | Persisted terminal settings |

### Core Terminal Initialization Flow (Terminal.tsx:148-287)
```
1. Check cache: getCachedTerminal(sessionId)
2. If new: Create XTerm({ cursorBlink: true, ...getTerminalOptions() })
3. Load FitAddon → terminal.loadAddon(fitAddon)
4. Create unmanaged DOM container → terminal.open(container)
5. Acquire WebGL from pool → terminal.loadAddon(webglAddon)
6. Fit to container → fitAddon.fit()
7. Set up ResizeObserver (per-terminal, NOT global)
8. Register event handlers: onData, onTitleChange
```

**Link addon would slot in between steps 3 and 4** (or after step 5 for new terminals, and automatically preserved for cached terminals).

### Current xterm.js Options
```typescript
// Terminal.tsx:179-183
const initialOptions = getTerminalOptions()  // theme, fontSize, fontFamily
terminal = new XTerm({
  cursorBlink: true,
  ...initialOptions,
})
```
**Missing**: `allowProposedApi: true` (needed for `registerLinkProvider()`)

### Current Addons
| Addon | Package | Version | Lifecycle |
|-------|---------|---------|-----------|
| FitAddon | `@xterm/addon-fit` | ^0.11.0 | Permanent — loaded on init |
| WebglAddon | `@xterm/addon-webgl` | ^0.19.0 | Pool-managed — acquire on mount, release on unmount |
| **WebLinksAddon** | `@xterm/addon-web-links` | **NOT INSTALLED** | — |

### Terminal Caching (terminalCache.ts)
```typescript
interface CachedTerminal {
  terminal: Terminal
  fitAddon: FitAddon
  container: HTMLDivElement
}
```
Addons loaded into the Terminal instance are **preserved through cache/restore cycles** because the Terminal object itself is cached. This means a link addon loaded during init will survive splits and layout restructuring.

### WebSocket → Terminal Output Flow
```
Backend 'output' message
  → WebSocket message handler (useCentralWebSocket)
  → sessionHandlers.get(sessionId).onOutput(data)
  → Terminal.tsx onOutput callback
  → xtermRef.current.write(data) [or buffer if unfocused]
  → xterm.js renders to canvas/DOM
  → Link detection happens in xterm.js render pipeline (post-addon-load)
```

---

## Architecture & Design

### Component Map

#### Existing Components (to modify)
- **Terminal.tsx** (399 lines) — Load link addon, register link provider, handle click callbacks
- **PaneContainer.tsx** (~150 lines) — Wrap with context menu, handle link actions
- **settings.ts** — Add link-related settings
- **ui.ts** — Add link preview panel state
- **App.tsx** — Render LinkPreviewPanel alongside SettingsPanel

#### New Components
- **`useTerminalLinks.ts`** — Hook managing link addon lifecycle + settings subscriptions
- **`LinkContextMenu.tsx`** — Right-click menu for detected links
- **`LinkPreviewPanel.tsx`** — Side panel for URL/markdown preview
- **`MarkdownPreview.tsx`** — Rendered markdown content viewer
- **Link settings section** in SettingsPanel — toggles, custom patterns UI

### Design Patterns to Follow

**Addon lifecycle** (PS-01): Create → `loadAddon()` → dispose in cleanup
```typescript
// Follow FitAddon pattern at Terminal.tsx:185-186
const webLinksAddon = new WebLinksAddon(handler, options)
terminal.loadAddon(webLinksAddon)
```

**Event disposables** (PS-02): Return `.dispose()` in cleanup
```typescript
const disposable = terminal.registerLinkProvider(provider)
return () => disposable.dispose()
```

**Settings hook** (PS-05): Subscribe to scalar selectors, apply in useEffect
```typescript
export function useTerminalLinks(terminal: Terminal | null) {
  const linksEnabled = useSettingsStore(selectLinksEnabled)
  // ...
}
```

**Context menu** (PS-06): Compose with shadcn/ui ContextMenu primitives
```typescript
<ContextMenu>
  <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onClick={() => onOpen(url)}>
      <ExternalLink className="mr-2 size-4" /> Open Link
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

---

## xterm.js Link API (v6.0.0)

### Two Approaches Available

#### 1. `@xterm/addon-web-links` (Simple URL detection)
```typescript
import { WebLinksAddon } from '@xterm/addon-web-links'

const addon = new WebLinksAddon((event, uri) => {
  // event: MouseEvent — check event.metaKey || event.ctrlKey
  // uri: string — the detected URL
  window.open(uri, '_blank')
})
terminal.loadAddon(addon)
```
- Automatically detects HTTP/HTTPS URLs
- Handles hover underline decoration
- Version 0.12.0 compatible with @xterm/xterm 6.0.0
- Does NOT handle file paths, IPs, emails, or custom patterns

#### 2. `terminal.registerLinkProvider()` (Custom detection)
```typescript
// Requires: allowProposedApi: true in terminal options
terminal.registerLinkProvider({
  provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void) {
    const line = terminal.buffer.active.getLine(bufferLineNumber)
    const text = line?.translateToString() ?? ''
    const links: ILink[] = []
    // Custom regex matching for file paths, IPs, emails, etc.
    for (const match of text.matchAll(pattern)) {
      links.push({
        range: { start: { x: match.index! + 1, y: bufferLineNumber }, end: { x: match.index! + match[0].length, y: bufferLineNumber } },
        text: match[0],
        activate(event, text) { /* handle click */ },
        hover(event, text) { /* show tooltip */ },
        leave(event, text) { /* hide tooltip */ },
      })
    }
    callback(links)
  }
})
```
- Full control over what is detected
- Multiple providers can be registered (checked in order)
- Returns IDisposable for cleanup
- **Note**: v6 removed `registerLinkMatcher()` — only `registerLinkProvider()` is available

### Recommended Approach: Both
1. Use `@xterm/addon-web-links` for standard URL detection (proven, maintained)
2. Use `registerLinkProvider()` for custom patterns (file paths, IPs, emails, user-defined regex)

### xterm.js v6 Breaking Changes (Relevant)
- Canvas renderer removed (WebGL or DOM only) — not a problem, we use WebGL
- `registerLinkMatcher()` removed in favor of `registerLinkProvider()`
- OSC 8 hyperlink improvements (better semicolon and whitespace handling)
- Bundle size reduced 30% (379kb → 265kb)

---

## Dependencies & Integration

### New NPM Dependencies Required

| Package | Purpose | Size (approx) |
|---------|---------|---------------|
| `@xterm/addon-web-links` | URL detection in terminal | ~5kb |
| `react-markdown` | Markdown rendering for preview | ~40kb |
| `rehype-sanitize` | XSS prevention for rendered markdown | ~10kb |
| `rehype-raw` | HTML-in-markdown support | ~5kb |
| `remark-gfm` | GitHub Flavored Markdown (tables, etc.) | ~15kb |

### Existing Dependencies to Leverage
- `@xterm/xterm` v6.0.0 — `registerLinkProvider()` API
- `radix-ui` — ContextMenu primitives
- `lucide-react` — ExternalLink, Copy, Globe, File, Mail icons
- `zustand` — Settings + UI store
- `react-resizable-panels` — If preview opens as split pane

### Backend Integration (Optional/Future)
- **Link preview proxy**: `/api/link-preview?url=...` endpoint for fetching URL metadata (title, description, favicon) — avoids CORS issues
- **Markdown serving**: Backend already serves static files; markdown files could be served via existing API

---

## Settings Design

### New Settings Fields
```typescript
interface SettingsState {
  // ... existing settings ...

  // Link detection
  linksEnabled: boolean                    // default: true
  linkActivation: 'cmdClick' | 'click'    // default: 'cmdClick'

  // Link preview
  linkPreviewMode: 'panel' | 'pane'       // default: 'panel'

  // Custom patterns (regex → URL template)
  linkCustomPatterns: LinkPattern[]        // default: []
}

interface LinkPattern {
  name: string          // e.g., "Jira Tickets"
  regex: string         // e.g., "[A-Z]+-\\d+"
  urlTemplate: string   // e.g., "https://jira.example.com/browse/$0"
  enabled: boolean
}
```

### Settings UI Sections
1. **Links** toggle (enable/disable all link detection)
2. **Activation mode** selector (Cmd/Ctrl+Click vs single click)
3. **Preview mode** selector (side panel vs new pane)
4. **Custom Patterns** list with add/edit/remove

---

## Context Menu Design

### Link Context Menu Items
| Icon | Label | Action | Shortcut |
|------|-------|--------|----------|
| ExternalLink | Open in Browser | `window.open(url, '_blank')` | — |
| PanelRight | Open Preview | Opens side panel or pane with URL | — |
| Copy | Copy URL | `navigator.clipboard.writeText(url)` | — |
| FileText | Copy as Markdown | `navigator.clipboard.writeText(`[${text}](${url})`)` | — |

### For File Paths
| Icon | Label | Action |
|------|-------|--------|
| Code | Open in VS Code | `window.open('vscode://file' + path)` |
| Eye | Preview | Opens markdown preview if .md file |

---

## Quality & Testing

### Testing Strategy (per ADR-0004: Fakes Only)

1. **Link detection logic**: Pure function tests for URL/file/IP/email regex matching
2. **Custom link provider**: Test `provideLinks()` with known terminal buffer content
3. **Settings store**: Factory function + FakeStorage (existing pattern)
4. **useTerminalLinks hook**: `renderHook()` with fake terminal object
5. **Context menu**: Component test with userEvent clicks
6. **Integration**: Terminal + link handler + store interaction

### Test Files to Create
- `frontend/src/lib/__tests__/linkDetection.test.ts` — regex pattern tests
- `frontend/src/hooks/__tests__/useTerminalLinks.test.ts` — hook lifecycle
- `frontend/src/stores/__tests__/settings-links.test.ts` — link settings persistence
- `frontend/src/components/__tests__/LinkContextMenu.test.tsx` — UI interaction

### Pre-Push CI Check
```bash
cd frontend && npm run build   # tsc -b && vite build
```

---

## Prior Learnings (From Previous Implementations)

### PL-01: WebglAddon Cannot Be Reattached
**Source**: Plan 004 (WebGL Context Pooling), Phase 1
**Type**: gotcha
**Original**: "WebglAddon cannot be reattached. Pool must dispose on release, create fresh on acquire."
**Relevance**: Unlike WebGL, the WebLinksAddon does NOT need pool management — it's a lightweight addon that can be permanently loaded. However, if implementing a "link provider" that uses DOM overlays, be aware that DOM state doesn't survive terminal.dispose().
**Action**: Load WebLinksAddon permanently in init effect. Do NOT pool it.

### PL-02: Pool Owns All Addon Disposal
**Source**: Plan 004, Phase 1
**Type**: decision
**Original**: "Pool OWNS all addons. Terminal never calls dispose() directly."
**Relevance**: The link addon should follow a different pattern — Terminal.tsx owns it directly (like FitAddon), not a pool. Keep the ref and dispose in cleanup only if session is truly closing.
**Action**: Store addon in ref (`webLinksAddonRef`), dispose only on session close (not cache).

### PL-03: Terminal Caching Preserves State
**Source**: Plan 015 (Pane Splitting)
**Type**: insight
**Original**: Terminal cache preserves XTerm instance + DOM container across React remounts.
**Relevance**: Addons loaded into the terminal survive cache/restore. No special handling needed for link addon during splits.
**Action**: Load addon during init only (not on restore from cache — it's already there).

### PL-04: React-Resizable-Panels Causes Remounts
**Source**: Plan 015, Phase 2
**Type**: gotcha
**Original**: react-resizable-panels restructures the Panel tree on split, causing all children to unmount/remount.
**Relevance**: The terminal cache was created to solve this. Link addon benefits from same caching.
**Action**: Ensure link addon is part of the cached terminal state (it is — it's loaded into the Terminal instance).

### PL-05: Zustand Selector Infinite Loops
**Source**: Multiple plans (015, 016)
**Type**: gotcha
**Original**: "Never subscribe to store methods returning new arrays/objects."
**Relevance**: `linkCustomPatterns` is an array. If subscribing to it in a React component, MUST use `useShallow` or `getState()`.
**Action**: Use `useShallow` for custom patterns array selector, or read imperatively.

### PL-06: Settings Store Merge for Backwards Compat
**Source**: Plan 016 (Sidebar URL Overhaul)
**Type**: insight
**Original**: Settings persist with `merge` callback that handles new/removed fields gracefully.
**Relevance**: New link settings must have defaults in the merge function.
**Action**: Add defaults for all new link settings in the `merge` callback.

### PL-07: WebGL Pool No Deferred Release on Layout Switch
**Source**: Plan 016
**Type**: discovery
**Original**: "WebGL Pool — No Deferred Release on Layout Switch"
**Relevance**: When switching workspace items, WebGL is released and re-acquired. Link addon is NOT affected (permanent, not pooled).
**Action**: No action needed — link addon is independent of WebGL lifecycle.

### PL-08: Research Dossier Recommended @xterm/addon-web-links
**Source**: `docs/research/frontend-terminal-libraries.md`
**Type**: insight
**Original**: "The @xterm/addon-fit, @xterm/addon-webgl, and @xterm/addon-web-links addons are essential for production-quality terminal experiences."
**Relevance**: The project's founding research already identified this addon as essential. It was planned from the start but never implemented.
**Action**: Install and load `@xterm/addon-web-links` as originally recommended.

---

## Critical Discoveries

### 🚨 Critical Finding 01: registerLinkProvider Requires allowProposedApi
**Impact**: Critical
**Source**: IA-03, IA-09
**What**: Custom link providers via `terminal.registerLinkProvider()` require `allowProposedApi: true` in terminal options.
**Why It Matters**: Without this flag, calling `registerLinkProvider()` throws an error.
**Required Action**: Add `allowProposedApi: true` to the XTerm constructor options (Terminal.tsx:180).

### 🚨 Critical Finding 02: v6 Removed registerLinkMatcher
**Impact**: Critical
**Source**: External research (xterm.js v6 changelog)
**What**: `registerLinkMatcher()` was removed in xterm.js v6. Only `registerLinkProvider()` is available.
**Why It Matters**: Any code examples or tutorials referencing `registerLinkMatcher` are outdated. Must use `registerLinkProvider` exclusively.
**Required Action**: Use `registerLinkProvider()` API only. Do not reference old link matcher API.

### 🚨 Critical Finding 03: Context Menu Must Intercept xterm.js Mouse Events
**Impact**: High
**Source**: External research (xterm.js issue #312)
**What**: xterm.js captures mouse events internally. A right-click context menu must be attached to the xterm container element, not via React's `onContextMenu`.
**Why It Matters**: If the context menu is on a parent React element, it won't fire when right-clicking inside the terminal canvas.
**Required Action**: Attach contextmenu event listener to `xtermContainerRef.current` in Terminal.tsx or use xterm's `element` property.

### 🚨 Critical Finding 04: Markdown Preview Needs XSS Protection
**Impact**: High
**Source**: External research (react-markdown security)
**What**: Rendering markdown from terminal output or files could contain malicious content. Must use `rehype-sanitize` to prevent XSS.
**Why It Matters**: Terminal output can contain user-supplied data. Rendering it as HTML without sanitization is a security vulnerability.
**Required Action**: Use `react-markdown` with `rehypePlugins={[rehypeRaw, rehypeSanitize]}` for all markdown rendering.

---

## Modification Considerations

### ✅ Safe to Modify
1. **settings.ts** — Adding new fields with defaults; merge handles backwards compat
2. **ui.ts** — Adding transient panel state (not persisted)
3. **Terminal.tsx init effect** — Adding addon loading follows established pattern

### ⚠️ Modify with Caution
1. **PaneContainer.tsx** — Wrapping with context menu; must not break existing click-to-focus
2. **Terminal.tsx options** — Adding `allowProposedApi: true` changes terminal behavior subtly
3. **App.tsx layout** — Adding preview panel must not break existing sidebar + settings panel

### Extension Points
1. **xterm addon loading** (Terminal.tsx:185-208) — Well-established pattern for adding new addons
2. **Settings sections** (SettingsPanel.tsx) — Clear pattern for adding new setting groups
3. **Workspace item types** (types/workspace.ts) — Could add preview pane type in future

---

## Markdown Preview Architecture

### Approach: In-App Rendering
For markdown files (detected via `.md` extension in file path links), render content in a new pane or side panel using `react-markdown`.

```typescript
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

function MarkdownPreview({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeSanitize]}
    >
      {content}
    </ReactMarkdown>
  )
}
```

### Content Source Options
1. **Local files**: Read via backend API endpoint (e.g., `GET /api/file?path=/path/to/file.md`)
2. **URLs**: Fetch markdown content via backend proxy to avoid CORS
3. **Terminal output**: Extract markdown from terminal buffer (edge case)

### Security
- `rehype-sanitize` strips dangerous HTML (script, style, event handlers)
- `react-markdown` is safe by default (no `dangerouslySetInnerHTML`)
- URL validation via `urlTransform` prop (allow only http/https/mailto)

---

## External Research Opportunities

### Research Opportunity 1: Multi-Line URL Detection in xterm.js

**Why Needed**: Long URLs that wrap across terminal lines are tricky to detect. The `provideLinks()` callback receives one line at a time.
**Impact on Plan**: May need to implement cross-line URL joining logic.
**Source Findings**: IA-05, IC-01

### Research Opportunity 2: File Path Opening Across Platforms

**Why Needed**: `vscode://file/path` works for VS Code, but users may use different editors. Need to understand OS-level file opening APIs.
**Impact on Plan**: Affects file link handler implementation.
**Source Findings**: User requirement #5

---

## Appendix: File Inventory

### Core Files to Modify
| File | Purpose | Lines |
|------|---------|-------|
| `frontend/src/components/Terminal.tsx` | xterm.js wrapper | 399 |
| `frontend/src/components/PaneContainer.tsx` | Terminal container | ~150 |
| `frontend/src/stores/settings.ts` | Terminal settings | ~195 |
| `frontend/src/stores/ui.ts` | Transient UI state | ~50 |
| `frontend/src/App.tsx` | Main layout | ~111 |

### New Files to Create
| File | Purpose |
|------|---------|
| `frontend/src/hooks/useTerminalLinks.ts` | Link addon lifecycle + settings |
| `frontend/src/components/LinkContextMenu.tsx` | Right-click menu for links |
| `frontend/src/components/LinkPreviewPanel.tsx` | Side panel / pane preview |
| `frontend/src/components/MarkdownPreview.tsx` | Rendered markdown viewer |
| `frontend/src/lib/linkDetection.ts` | Regex patterns for link types |

### Related Existing Files
| File | Relevance |
|------|-----------|
| `frontend/src/hooks/useTerminalTheme.ts` | Pattern for settings → terminal hook |
| `frontend/src/components/SessionContextMenu.tsx` | Pattern for context menu |
| `frontend/src/components/SettingsPanel.tsx` | Pattern for side panel |
| `frontend/src/lib/terminalCache.ts` | Terminal caching (addons preserved) |
| `frontend/src/stores/webglPool.ts` | Addon pool pattern (NOT to follow for links) |

---

## Next Steps

1. Run `/plan-1b-specify` to create the feature specification from these findings
2. Then `/plan-3-architect` to create the phased implementation plan

---

**Research Complete**: 2026-02-13
**Report Location**: docs/plans/017-clickable-terminal-links/research-dossier.md
