# Clickable Terminal Links — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-13
**Spec**: [./clickable-terminal-links-spec.md](./clickable-terminal-links-spec.md)
**Research**: [./research-dossier.md](./research-dossier.md)
**Status**: DRAFT
**Mode**: Full
**File Management**: Legacy

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Documentation Strategy](#documentation-strategy)
6. [Phase 1: Core Link Detection & Settings](#phase-1-core-link-detection--settings)
7. [Phase 2: Click Handling & Context Menu](#phase-2-click-handling--context-menu)
8. [Phase 3: Link Preview Side Panel](#phase-3-link-preview-side-panel)
9. [Phase 4: Markdown Rendering & Backend File API](#phase-4-markdown-rendering--backend-file-api)
10. [Phase 5: Custom Pattern Settings UI & Documentation](#phase-5-custom-pattern-settings-ui--documentation)
11. [Cross-Cutting Concerns](#cross-cutting-concerns)
12. [Complexity Tracking](#complexity-tracking)
13. [Progress Tracking](#progress-tracking)
14. [ADR Ledger](#adr-ledger)
15. [Deviation Ledger](#deviation-ledger)
16. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

Terminal output in trex currently renders all text as plain, unclickable content. Every modern terminal
emulator (VS Code, iTerm2, Hyper, Warp) supports clickable links — their absence is a notable gap.

**Solution approach**:
- Install `@xterm/addon-web-links` for standard URL detection + custom `registerLinkProvider()` for
  file paths, IPs, emails, and user-defined regex patterns
- Cmd/Ctrl+Click activation with hover underline decoration
- Right-click context menu on detected links (Open, Copy, Preview, Copy as Markdown)
- In-app preview: side panel first (like SettingsPanel), then pane mode via new `preview` layout
  tree leaf type
- Markdown rendering via `react-markdown` + `rehype-sanitize` for XSS-safe file preview
- Backend `GET /api/file` endpoint for reading local files with path traversal protection
- Hardcoded built-in link providers + separate user-defined custom regex patterns in Settings

**Expected outcomes**:
- Eliminates copy-paste friction for URLs, file paths, IPs, and emails in terminal output
- Brings trex to parity with other modern terminal emulators
- Fulfills the project's founding research recommendation to integrate `@xterm/addon-web-links`

**Success metrics**:
- All 34 acceptance criteria from spec pass
- Link detection works in both WebGL and DOM renderer modes
- Link addon survives terminal cache/restore cycles (pane splits, layout restructuring)
- No degradation of terminal input latency (<50ms)

---

## Technical Context

### Current system state
- **Terminal.tsx** (399 lines): xterm.js v6.0.0 wrapper with FitAddon + WebGL pool addon. No link
  detection, no click handling, no `allowProposedApi` flag.
- **Settings store**: Zustand persist with merge callback. No link-related fields.
- **UI store**: Transient `settingsPanelOpen` boolean. No preview panel state.
- **Backend**: Go HTTP server (`net/http` mux) with `/api/health`, `/api/sessions`, `/ws`. No file
  reading endpoint.
- **Layout tree**: Binary tree of `PaneLeaf | PaneSplit`. No non-terminal leaf types.

### Integration requirements
- `@xterm/addon-web-links` v0.12.0 compatible with `@xterm/xterm` v6.0.0 (confirmed by research)
- `registerLinkProvider()` requires `allowProposedApi: true` on XTerm constructor
- Terminal cache preserves loaded addons — link addon survives React remounts without reinit
- Context menu must attach to xterm container element (xterm captures mouse events internally)
- Settings merge callback handles backwards compat for new fields automatically

### Constraints and limitations
- `registerLinkProvider()` callback receives one terminal line at a time — multi-line URL detection
  is limited (known xterm.js constraint, documented as accepted limitation)
- Custom user regex patterns can cause ReDoS — must validate on save
- File path links are relative to session CWD, which is mutable — best-effort resolution
- Markdown rendering must sanitize HTML to prevent XSS

### Assumptions
- `@xterm/addon-web-links` v0.12.0 is stable (official xterm.js monorepo package)
- Users have VS Code installed when clicking file path links (graceful degradation if not)
- Vite proxy handles `/api/file` route automatically (matches existing `/api` proxy rule)

---

## Critical Research Findings

Synthesized from 30 discoveries across 2 research subagents (Implementation Strategist + Risk &
Mitigation Planner), combined with 65 prior findings from research dossier.

### 01: registerLinkProvider Requires allowProposedApi
**Impact**: Critical | **Sources**: [I1-02, R1-05, Dossier CF-01]
**Problem**: Custom link providers via `terminal.registerLinkProvider()` require `allowProposedApi: true`
in terminal options. Without this flag, calling `registerLinkProvider()` throws an error at runtime.
**Solution**: Add `allowProposedApi: true` to XTerm constructor in Terminal.tsx:180.
**Action Required**: First task of Phase 1.
**Affects Phases**: 1

### 02: Context Menu Must Attach to xterm Container, NOT React Parent
**Impact**: Critical | **Sources**: [I1-11, R1-01, Dossier CF-03]
**Problem**: xterm.js captures mouse events internally. `onContextMenu` on a parent React element won't
fire when right-clicking inside the terminal canvas. Must use native `addEventListener('contextmenu')`
on `xtermContainerRef.current` and render menu via React portal.
**Solution**: Attach contextmenu listener in Terminal.tsx useEffect, track hovered link via ref, render
`LinkContextMenu` in portal at click coordinates.
**Action Required**: Central integration pattern for Phase 2.
**Affects Phases**: 2, 3

### 03: ReDoS from User-Defined Regex Patterns
**Impact**: Critical | **Sources**: [R1-02, Dossier Risk-2]
**Problem**: Pathological regex (e.g., `(a+)+$`) in custom patterns causes catastrophic backtracking,
freezing the UI thread during `provideLinks()` execution.
**Solution**: Validate regex on save (reject nested quantifiers, test against known-bad input with
timeout). Add 100ms timeout in link provider callback. Reject patterns that fail validation.
**Action Required**: Phase 5 settings validation + Phase 1 provider timeout.
**Affects Phases**: 1, 5

### 04: File API Path Traversal Vulnerability
**Impact**: Critical | **Sources**: [R1-07, Spec Risk-7]
**Problem**: `GET /api/file?path=../../etc/passwd` could leak sensitive system files.
**Solution**: Canonicalize path via `filepath.Abs()`, verify result starts with allowed base directory
(`TREX_FILE_ROOT` env var or user home), reject paths containing `..` after resolution, enforce 5MB
size limit, reject directories.
**Action Required**: Phase 4 backend implementation.
**Affects Phases**: 4

### 05: Markdown XSS via Unsanitized HTML
**Impact**: Critical | **Sources**: [R1-03, Dossier CF-04]
**Problem**: Rendering markdown from terminal output or files without sanitization allows XSS via
`<script>`, `<img onerror>`, etc.
**Solution**: ALWAYS use `react-markdown` with `rehypePlugins={[rehypeRaw, rehypeSanitize]}`. Never
render markdown without the sanitize pipeline. Customize schema to allow `className` on `code` elements
for syntax highlighting.
**Action Required**: Phase 4 markdown renderer.
**Affects Phases**: 4

### 06: Terminal Cache Preserves Addons Across Remounts
**Impact**: High | **Sources**: [I1-03, I1-04, Dossier PL-03, PL-04]
**Problem**: Terminal caching (terminalCache.ts) caches the XTerm instance with all loaded addons. Link
addon loaded during init survives pane splits and layout restructuring without reinit.
**Solution**: Load link addon during init only (not on cache restore). For new terminals: load after
WebGL acquisition. For cached terminals: addon already loaded, skip.
**Action Required**: Phase 1 addon loading logic.
**Affects Phases**: 1

### 07: Zustand Infinite Loop from Array Subscription
**Impact**: High | **Sources**: [R1-08, Dossier PL-05, CLAUDE.md]
**Problem**: `linkCustomPatterns` is an array. Subscribing directly causes infinite re-renders because
array reference changes on every store update.
**Solution**: Use `useShallow` from `zustand/shallow` for array selectors, or read imperatively via
`getState()` inside callbacks/effects.
**Action Required**: All components subscribing to custom patterns.
**Affects Phases**: 1, 5

### 08: Settings Backwards Compatibility for New Link Fields
**Impact**: High | **Sources**: [I1-05, R1-13]
**Problem**: Existing users have localStorage without link fields. Must provide defaults.
**Solution**: New fields get defaults in `defaultSettings`. The existing `merge` callback pattern
(`{ ...current, ...persisted }`) automatically provides defaults for missing fields. Clean stale
keys if needed.
**Action Required**: Phase 1 settings additions.
**Affects Phases**: 1

### 09: UI Store Transient State Pattern for Preview Panel
**Impact**: High | **Sources**: [I1-06]
**Problem**: Link preview panel open/close state should NOT persist to localStorage.
**Solution**: Add `linkPreviewOpen` and `linkPreviewContent` to UIState as transient fields (not
included in `partialize`), following the exact pattern of `settingsPanelOpen`.
**Action Required**: Phase 3 UI store additions.
**Affects Phases**: 3

### 10: Phase Dependency Graph — Parallelization Opportunities
**Impact**: High | **Sources**: [I1-01]
**Problem**: The 5 phases have a dependency graph that differs from simple sequential ordering.
**Solution**:
```
Phase 1 (Core detection) ──→ Phase 2 (Click + menu) ──→ Phase 3 (Preview panel) ──→ Phase 4 (Markdown + pane)
Phase 5 (Settings UI) depends on Phase 1 (settings fields exist)
```
Phase 5 can be implemented after Phase 1 without waiting for Phases 2-4.
**Action Required**: Phase ordering in plan.
**Affects Phases**: All

### 11: Large File Preview Performance
**Impact**: High | **Sources**: [R1-04]
**Problem**: Previewing 10MB+ markdown files freezes the UI.
**Solution**: Backend enforces 5MB limit (413 Payload Too Large). Frontend truncates display at 100k
chars with warning. Fetch timeout of 3 seconds via AbortController.
**Action Required**: Phase 4 backend and frontend safeguards.
**Affects Phases**: 4

### 12: Relative Path Resolution is Best-Effort
**Impact**: High | **Sources**: [R1-06, Spec Q5]
**Problem**: File path links are relative to session CWD, which is mutable and unknown to frontend.
**Solution**: Absolute paths work directly. Relative paths resolved against session CWD if available
via future backend metadata (outside Plan 017 scope). Fallback: show path resolution error with hint.
**Action Required**: Phase 2 link activation, documented limitation.
**Affects Phases**: 2, 4

### 13: react-markdown ESM Compatibility with Vite
**Impact**: Medium | **Sources**: [R1-12]
**Problem**: `react-markdown` and plugins are ESM-only. Potential Vite bundling issues.
**Solution**: Add to `optimizeDeps.include` in vite.config.ts if needed. Run `npm run build` to verify
before pushing (standard pre-push CI check).
**Action Required**: Phase 4 dependency installation.
**Affects Phases**: 4

### 14: Vite Proxy Handles New /api/file Route Automatically
**Impact**: Medium | **Sources**: [R1-14]
**Problem**: New backend route needs to work through Vite dev proxy.
**Solution**: Existing `/api` proxy rule in vite.config.ts matches `/api/file` automatically. No
proxy config changes needed.
**Action Required**: None (verify during Phase 4).
**Affects Phases**: 4

### 15: Multi-Line URL Detection Limitation
**Impact**: Medium | **Sources**: [R1-15, Dossier Research Opp 1]
**Problem**: `provideLinks()` receives one line at a time. URLs wrapping across terminal lines are only
partially detected.
**Solution**: Accepted limitation. `@xterm/addon-web-links` handles wrapped URLs via `isWrapped` flag
expansion (up to 2048 chars) for standard HTTP URLs. Custom providers process single lines only.
Document limitation in user guide.
**Action Required**: Document in Phase 5.
**Affects Phases**: 1, 5

---

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Hybrid (from spec)
- **Rationale**: Mixed complexity — pure regex logic and store persistence warrant TDD; UI components,
  hooks, and addon integration are better served by lightweight tests
- **Focus Areas**: Link detection regex (TDD), custom provider logic (TDD), settings persistence (TDD),
  context menu UI (lightweight), hook lifecycle (lightweight)

### Hybrid Testing Strategy

**TDD Phases** (write tests FIRST):
- Phase 1: Link pattern regex, custom provider `provideLinks()`, settings store persistence
- Phase 5: Regex validation (ReDoS prevention), custom pattern CRUD

**Lightweight Phases** (implement first, validate after):
- Phase 2: Context menu rendering, click handler dispatching
- Phase 3: Preview panel rendering, preview state management
- Phase 4: Markdown rendering, preview pane integration

### Mock Usage
- **Fakes only** (ADR-0004, non-negotiable)
- FakeStorage for settings store persistence tests
- Factory functions for isolated store instances
- No vi.mock() or jest.mock() — ever

### Test Documentation
Every promoted test includes:
```typescript
/**
 * Test Doc:
 * - Why: <business/regression reason>
 * - Contract: <what invariant this asserts>
 * - Usage Notes: <gotchas>
 * - Quality Contribution: <what failures it catches>
 * - Worked Example: <inputs/outputs>
 */
```

---

## Documentation Strategy

### Location
- **docs/how/ only** (from spec)
- Target file: `docs/how/clickable-links.md`

### Discovery
Existing docs/how/ files are flat (not in subdirectories):
- `terminal-architecture.md`, `terminal-development.md`, `webgl-pooling.md`
- `idle-indicators.md`, `authentication.md`, `oauth-setup.md`, etc.

### Placement Decision
Create new file `docs/how/clickable-links.md` (flat, following existing convention).

### Content Outline
- Supported link types (URL, file path, IP, email, OSC 8)
- Activation methods (Cmd/Ctrl+Click, single click option)
- Context menu actions
- Custom pattern syntax (regex + URL templates with `$0`-`$9` capture groups)
- Preview panel usage (side panel + pane mode)
- Settings reference
- Known limitations (multi-line URLs, relative path resolution)

---

## Phase 1: Core Link Detection & Settings

### Objective
Install link detection dependencies, add `allowProposedApi` flag, create link pattern library,
implement `useTerminalLinks` hook, and add link settings to the settings store.

### Deliverables
- `@xterm/addon-web-links` installed and loaded for URL detection
- Custom `registerLinkProvider()` for file paths, IPs, emails
- Link-related settings fields in settings store with backwards compat
- TDD test suites for regex patterns and settings persistence

### Dependencies
- None (foundational phase)

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `allowProposedApi` side effects | Low | Medium | Pin xterm.js to exact version, document flag |
| Addon loading order conflicts | Low | Medium | Load after WebGL, verified by research |
| Settings merge regression | Low | High | TDD with FakeStorage covers edge cases |

### Tasks (Hybrid: TDD for logic, lightweight for integration)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Install npm dependencies | 1 | `@xterm/addon-web-links`, `react-markdown`, `rehype-sanitize`, `rehype-raw`, `remark-gfm` added to package.json, `npm install` succeeds, `npm run build` passes | - | All 5 packages for full plan |
| 1.2 | [ ] | Write TDD tests for link pattern regex library | 2 | Tests cover: HTTP/HTTPS URLs with fragments/query/ports, absolute/relative file paths with line:col, IPv4 addresses, email addresses. All tests RED initially | - | `lib/__tests__/linkPatterns.test.ts` |
| 1.3 | [ ] | Implement link pattern regex library | 2 | All tests from 1.2 pass. Exports: `URL_PATTERN`, `FILE_PATH_PATTERN`, `IPV4_PATTERN`, `EMAIL_PATTERN`, `detectLinks(text)` function | - | `lib/linkPatterns.ts` |
| 1.4 | [ ] | Write TDD tests for custom link provider | 2 | Tests cover: provideLinks with fake buffer content, multiple pattern types, empty lines, links at line boundaries. All tests RED | - | `lib/__tests__/linkProvider.test.ts` |
| 1.5 | [ ] | Implement custom link provider | 2 | All tests from 1.4 pass. Exports: `createLinkProvider(patterns, activation)` returning ILinkProvider. Includes 100ms timeout guard | - | `lib/linkProvider.ts` |
| 1.6 | [ ] | Write TDD tests for link settings persistence | 2 | Tests cover: default values, persist/restore cycle, backwards compat (old state without link fields), custom patterns array. FakeStorage pattern | - | `stores/__tests__/linkSettings.test.ts` |
| 1.7 | [ ] | Add link settings to settings store | 2 | All tests from 1.6 pass. Fields: `linksEnabled`, `linkActivation`, `linkCustomPatterns[]`. **DYK-07: No `linkPreviewMode` field** — preview is always a pane (side panel eliminated). Selectors exported. Merge callback explicitly handles `linkCustomPatterns` array (follow `idleThresholds` pattern at settings.ts:174-178): `linkCustomPatterns: (p as Partial<SettingsState>)?.linkCustomPatterns ?? []` | - | Modify `stores/settings.ts` |
| 1.8 | [ ] | Add `allowProposedApi: true` to XTerm constructor | 1 | Terminal.tsx:180 includes flag. Existing terminal functionality unaffected. Build passes | - | Modify `Terminal.tsx` |
| 1.9 | [ ] | Create `useTerminalLinks` hook | 2 | Hook loads WebLinksAddon for new terminals (skips cached), registers custom link provider, subscribes to `linksEnabled` setting. Disposes on cleanup. **DYK-05: Must guard against double-loading on cached terminal restore** — pane splits trigger unmount+remount via react-resizable-panels restructuring. Use a `WeakSet<Terminal>` (module-level) to track which XTerm instances already have the link addon loaded. Hook checks WeakSet before loading; adds to WeakSet after loading. Prevents duplicate link handlers (double underlines, double context menu triggers) | - | `hooks/useTerminalLinks.ts` |
| 1.10 | [ ] | Integrate hook into Terminal.tsx | 1 | Hook called in Terminal component. Link detection visually works: hover over URL shows underline. Build passes, no regressions | - | Modify `Terminal.tsx` |
| 1.11 | [ ] | Verify addon survives terminal cache/restore | 1 | Manual test: split pane, verify link detection still works in both panes. Verify cached terminal skips addon reload | - | Integration verification |

### Test Examples (Phase 1)

```typescript
// lib/__tests__/linkPatterns.test.ts
describe('URL_PATTERN', () => {
  test('matches HTTP URLs with path and query', () => {
    /**
     * Test Doc:
     * - Why: URLs in build output often include paths and query strings
     * - Contract: URL_PATTERN matches full URL including path, query, fragment
     * - Usage Notes: Pattern requires scheme (http/https), won't match bare domains
     * - Quality Contribution: Prevents partial URL detection in terminal output
     * - Worked Example: "https://example.com/path?q=1#section" → full match
     */
    const text = 'Visit https://example.com/path?q=1&r=2#section for details'
    const matches = detectLinks(text, 'url')
    expect(matches).toHaveLength(1)
    expect(matches[0].text).toBe('https://example.com/path?q=1&r=2#section')
  })

  test('matches file paths with line and column numbers', () => {
    const text = 'Error at ./src/app.ts:42:10'
    const matches = detectLinks(text, 'file')
    expect(matches).toHaveLength(1)
    expect(matches[0].text).toBe('./src/app.ts:42:10')
  })
})
```

### Non-Happy-Path Coverage
- [ ] Empty terminal line produces no links
- [ ] Overlapping patterns (URL containing IP) — provider prioritization
- [ ] Extremely long lines (10k+ chars) — timeout guard activates
- [ ] Invalid regex in custom patterns — graceful skip, no crash
- [ ] Settings store with corrupted localStorage — defaults applied

### Acceptance Criteria
- [ ] All TDD tests passing (patterns, provider, settings)
- [ ] URLs visually detected in terminal output (underline on hover)
- [ ] Link addon survives pane split (cache/restore)
- [ ] `linksEnabled: false` disables all link detection
- [ ] `npm run build` passes with zero errors

---

## Phase 2: Click Handling & Context Menu

### Objective
Implement Cmd/Ctrl+Click link activation and right-click context menu on detected links.

### Deliverables
- Click handler dispatching links to browser/VS Code/mailto based on type
- `LinkContextMenu` component with Open, Copy URL, Open Preview, Copy as Markdown
- Context menu integration with xterm.js via native DOM event listener
- Link action utility functions

### Dependencies
- Phase 1 must be complete (link detection must work first)

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| xterm captures mouse events | High | High | Attach to xterm container via addEventListener, not React onContextMenu |
| CSP blocks vscode:// protocol | Medium | Medium | No CSP headers in current backend; document for future |
| Context menu positioning | Low | Medium | Use click coordinates + React portal |

### Tasks (Lightweight testing)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Create link action utility functions | 2 | Exports: `openInBrowser(url)`, `openInVSCode(path, line?, col?)`, `openMailto(email)`, `copyToClipboard(text)`, `copyAsMarkdown(text, url)`. Each handles its protocol correctly | - | `lib/linkActions.ts` |
| 2.2 | [ ] | Wire Cmd/Ctrl+Click activation into link providers | 2 | Click handler in `activate()` callback checks `event.metaKey \|\| event.ctrlKey`. Dispatches to correct action based on link type (URL→browser, file→VS Code, email→mailto, IP→http) | - | Modify `lib/linkProvider.ts` |
| 2.3 | [ ] | Create `LinkContextMenu` component | 2 | Uses shadcn/ui ContextMenu. Items: Open in Browser, Copy URL, Open Preview, Copy as Markdown. For file links: additional "Open in VS Code" item. Icons from lucide-react | - | `components/LinkContextMenu.tsx` |
| 2.4 | [ ] | Implement context menu trigger via native DOM listener | 3 | Attaches `contextmenu` event listener to the xterm terminal's unmanaged container div (accessed via `terminal.element`, NOT `containerRef.current` — see Terminal.tsx init where it creates an unmanaged div for xterm). Tracks currently hovered link via ref. Shows LinkContextMenu at click coordinates via React portal. Non-link right-click passes through to default. **DYK-06: Must auto-dismiss context menu on scroll/resize/blur/keypress** — terminals are live-output surfaces where content moves constantly. Register dismiss listeners: `terminal.onScroll` (output scrolls link off-screen), ResizeObserver callback (pane resize), `terminal.textarea.addEventListener('blur')` (focus change), `document.addEventListener('keydown')` (any keypress). All listeners cleaned up when menu closes | - | Modify `Terminal.tsx` or new hook |
| 2.5 | [ ] | Track hovered link state for context menu | 2 | Link provider's `hover`/`leave` callbacks update a ref with current link data (url, text, type, range). Context menu reads from this ref on right-click | - | Part of `useTerminalLinks` hook |
| 2.6 | [ ] | Write lightweight tests for LinkContextMenu | 1 | Tests: menu renders with correct items, click handlers fire, file-specific item appears for file links | - | `components/__tests__/LinkContextMenu.test.tsx` |
| 2.7 | [ ] | Write lightweight tests for link actions | 1 | Tests: `openInBrowser` calls `window.open`, `copyToClipboard` calls `navigator.clipboard.writeText`, `openInVSCode` formats correct protocol URL | - | `lib/__tests__/linkActions.test.ts` |

### Test Examples (Phase 2)

```typescript
// components/__tests__/LinkContextMenu.test.tsx
describe('LinkContextMenu', () => {
  test('renders all standard menu items for URL link', () => {
    render(
      <LinkContextMenu
        link={{ type: 'url', text: 'https://example.com', url: 'https://example.com' }}
        position={{ x: 100, y: 200 }}
        onClose={() => {}}
      />
    )
    expect(screen.getByText('Open in Browser')).toBeInTheDocument()
    expect(screen.getByText('Copy URL')).toBeInTheDocument()
    expect(screen.getByText('Open Preview')).toBeInTheDocument()
    expect(screen.getByText('Copy as Markdown')).toBeInTheDocument()
  })

  test('shows VS Code option for file links', () => {
    render(
      <LinkContextMenu
        link={{ type: 'file', text: './src/app.ts:42', url: 'vscode://file/src/app.ts:42' }}
        position={{ x: 100, y: 200 }}
        onClose={() => {}}
      />
    )
    expect(screen.getByText('Open in VS Code')).toBeInTheDocument()
  })
})
```

### Non-Happy-Path Coverage
- [ ] Right-click on non-link text — no link context menu, default behavior
- [ ] Cmd/Ctrl+Click on text that looks like but isn't a link — no action
- [ ] `window.open` blocked by popup blocker — graceful fallback
- [ ] Clipboard API unavailable — show toast/notification

### Acceptance Criteria
- [ ] Cmd/Ctrl+Click on URL opens browser
- [ ] Cmd/Ctrl+Click on file path opens VS Code
- [ ] Right-click on link shows context menu with 4+ options
- [ ] Right-click on non-link shows default terminal context menu
- [ ] All menu actions work (Open, Copy URL, Copy as Markdown)
- [ ] `npm run build` passes

---

## Phase 3: ~~Link Preview Side Panel~~ ELIMINATED (DYK-07)

> **DYK-07 Decision**: Preview is always a pane (PreviewLeaf), never a side panel. The side panel
> approach was eliminated because it would become throwaway code when standalone preview items
> (WorkspacePreviewItem) are added later. Users position previews wherever they want via the
> existing pane split/drag/resize mechanics.
>
> **Impact**: No LinkPreviewPanel component, no UI store preview state, no mutual exclusion with
> settings panel, no `linkPreviewMode` setting. "Open Preview" from context menu always creates a
> PreviewLeaf pane via workspace store's `insertPreviewPane()` (Phase 4). If user is on a
> standalone session, it converts to a layout (session + preview pane).
>
> **Tasks redistributed to Phase 4**: Preview pane rendering (4.9, 4.10), "Open Preview" wiring (4.11).
> Phase 2 proceeds directly to Phase 4.

---

## Phase 4: Markdown Rendering & Backend File API

### Objective
Add markdown rendering for file preview, implement backend file-reading API with path traversal
protection, and add preview pane mode via new layout tree leaf type.

### Deliverables
- `MarkdownPreview` component with `react-markdown` + XSS sanitization
- Backend `GET /api/file` endpoint with security hardening
- `PreviewLeaf` layout tree type for rendering previews in split panes
- Preview pane rendering in `PaneLayout.tsx`
- File size limits and error handling

### Dependencies
- Phase 2 must be complete (context menu "Open Preview" action exists)
- npm packages from Phase 1.1 already installed
- Phase 3 eliminated (DYK-07) — preview pane is now the only preview mode

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Path traversal attack | High | Critical | Canonicalize, restrict to baseDir, reject `..` |
| Markdown XSS | Medium | Critical | rehype-sanitize in pipeline, no dangerouslySetInnerHTML |
| Large file performance | Medium | High | 5MB backend limit, 100k char frontend truncation |
| ESM compatibility | Medium | Medium | Verify with `npm run build`, add to optimizeDeps if needed |

### Tasks (Lightweight testing + security verification)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Create `MarkdownPreview` component | 2 | Uses react-markdown with remarkGfm, rehypeRaw, rehypeSanitize. Renders headings, lists, code blocks, tables, inline formatting. XSS-safe | - | `components/MarkdownPreview.tsx` |
| 4.2 | [ ] | Write TDD tests for backend file API (security-critical) | 2 | Tests FIRST (TDD — path traversal is OWASP Top 10): valid path reads file, `../` traversal blocked (403), absolute path outside base blocked, directories rejected (404), empty path (400), oversized file (413). Uses `t.TempDir()` and `httptest`. Fakes only. All tests RED initially | - | `backend/internal/server/file_test.go` |
| 4.3 | [ ] | Implement backend `GET /api/file` endpoint | 3 | All tests from 4.2 pass. Reads file from disk. Path traversal protection: canonicalize via `filepath.Abs`, verify within baseDir (`TREX_FILE_ROOT` env var, fallback `os.UserHomeDir()`, 500 if both fail with log warning). Reject dirs, 5MB size limit. Returns content with Content-Type based on extension (.md → text/markdown, .ts/.js/.go → text/plain, others → application/octet-stream). **DYK-10: Add TODO comment in handler**: "// TODO: If trex ever supports multi-user deployments, this endpoint must be scoped per-session CWD. Currently baseDir is user home — any authenticated user can read any file within it. Single-user/trusted-sharing only." | - | `backend/internal/server/file.go` |
| 4.4 | [ ] | Register file API route in server.go | 1 | `s.mux.HandleFunc("/api/file", s.handleFileRead())` in routes(). Auth middleware applies if enabled | - | Modify `backend/internal/server/server.go` |
| 4.5 | [ ] | Wire markdown rendering into PreviewContent | 2 | When preview type is `file` and URL ends in `.md`: fetch via `/api/file?path=...`, render with MarkdownPreview. Non-.md files show raw text. Size truncation at 100k chars with warning | - | Modify `components/PreviewContent.tsx` |
| 4.6 | [ ] | Add `PreviewLeaf` type, rename `PaneLeaf.type`, and add `LeafFactory` pattern | 3 | **DYK-09: Rename `PaneLeaf.type` from `'leaf'` to `'terminal'`** — `'leaf'` is a tree concept that conflicts with PreviewLeaf also being a leaf. Breaking change (alpha, no backwards compat needed). Update all references: `types/layout.ts`, `lib/layoutTree.ts`, `lib/layoutCodec.ts`, `lib/workspaceCodec.ts`, `stores/workspace.ts`, `components/PaneLayout.tsx`, `components/DropZoneOverlay.tsx`, and all tests. New leaf type: `PreviewLeaf = { type: 'preview', paneId, contentType, source }`. Add base `LayoutLeaf` interface (`{ readonly type: string; readonly paneId: string }`) that both `PaneLeaf` and `PreviewLeaf` extend. Update `PaneLayout` type union to `PaneLeaf \| PreviewLeaf \| PaneSplit`. **DYK-08: Add `LeafFactory` type**: `type LeafFactory = (paneId: string) => PaneLeaf \| PreviewLeaf` — callers provide a factory to create any leaf type, keeping workspace store content-agnostic. Add `getTerminalLeaves(tree): PaneLeaf[]` (filters `type === 'terminal'` only) alongside `getAllLeaves` which returns the broader union. Most existing call sites switch to `getTerminalLeaves`. **DYK-01: `countTerminalPanes()` counts `type: 'terminal'` only** — previews excluded from 8-pane cap. DropZoneOverlay and workspace store cap checks use `countTerminalPanes()` | - | Modify `types/layout.ts`, `lib/layoutTree.ts`, and all files referencing `type: 'leaf'` |
| 4.7 | [ ] | Update workspace store with `LeafFactory` pattern and PreviewLeaf support | 3 | **DYK-08: Generalize split/convert actions with `LeafFactory` pattern**. Add `splitPaneWith(itemId, paneId, direction, createLeaf: LeafFactory)` — generic action where caller provides a factory function to create any leaf type. Refactor existing `splitPane(itemId, paneId, direction, newSessionId)` to delegate to `splitPaneWith` internally (existing callers untouched). Add `convertToLayoutWith(itemId, direction, createLeaf: LeafFactory)` — generic version of `convertToLayout`. Refactor existing `convertToLayout(itemId, direction, newSessionId)` to delegate to `convertToLayoutWith`. Workspace store becomes content-agnostic — no method explosion for future leaf types. Update tree-walking functions (`closePane`, `countLeaves`, auto-dissolve) to handle PreviewLeaf (no sessionId). **DYK-01: `splitPaneWith` uses `countTerminalPanes()` for cap check** — preview leaves bypass 8-terminal-pane cap. **DYK-02: `dissolveLayout()` must filter out preview leaves** before mapping to `WorkspaceSessionItem[]` (previews have no standalone representation — they simply close). **`closeLayout()` must filter preview leaves** from returned sessionId array. **DYK-04: `maybeAutoDissolve()` when sole remaining leaf is a preview → remove item entirely** (standalone preview items deferred to future plan, see wishlist). Design PreviewLeaf structurally ready for future `WorkspacePreviewItem` upgrade. Tests: mixed leaf types, 8 terminal panes + preview insert succeeds, dissolve discards previews, close excludes previews from session list, auto-dissolve with sole preview removes item, `splitPaneWith` with custom factory, `convertToLayoutWith` with preview factory | - | Modify `stores/workspace.ts`, add tests to `stores/__tests__/workspace.test.ts` |
| 4.8 | [ ] | Update workspace codec for PreviewLeaf serialization | 2 | Update `workspaceCodec.ts` to encode/decode PreviewLeaf nodes in the v2 base64url JSON format. Ensure URL round-trip preserves preview panes. Add codec tests for layout trees containing preview leaves | - | Modify `lib/workspaceCodec.ts`, add tests to `lib/__tests__/workspaceCodec.test.ts` |
| 4.9 | [ ] | Create `PreviewPaneContainer` component | 2 | Renders preview content inside a layout pane. Title bar showing source URL/path. Close button removes preview leaf from tree. Matches PaneContainer structure | - | `components/PreviewPaneContainer.tsx` |
| 4.10 | [ ] | Render preview leaves in PaneLayout.tsx | 2 | Recursive renderer handles `node.type === 'preview'` by rendering PreviewPaneContainer instead of PaneContainer. Existing terminal leaves unaffected | - | Modify `components/PaneLayout.tsx` |
| 4.11 | [ ] | Wire "Open Preview" context menu action to pane creation | 2 | **DYK-07: Always pane, no side panel**. "Open Preview" uses the `LeafFactory` pattern (DYK-08): creates a preview factory `(paneId) => ({ type: 'preview', paneId, contentType, source })` and passes it to workspace store. If active item is a standalone session → calls `convertToLayoutWith(itemId, 'h', previewFactory)`. If active item is already a layout → calls `splitPaneWith(itemId, focusedPaneId, 'h', previewFactory)`. No preview-specific methods needed on workspace store — callers provide the factory | - | Modify `LinkContextMenu.tsx` action dispatch |
| 4.12 | [ ] | Write lightweight tests for MarkdownPreview | 1 | Tests: renders GFM table, renders code block, verifies sanitization pipeline strips script tags (integration contract test — verifying our rehype config, not the library), renders headings | - | `components/__tests__/MarkdownPreview.test.tsx` |
| 4.13 | [ ] | Verify ESM compatibility | 1 | `npm run build` passes with all new markdown packages. No CJS fallback warnings. Dev server works | - | Build verification |

### Test Examples (Phase 4)

```go
// backend/internal/server/file_test.go
func TestHandleFileRead_PathTraversal(t *testing.T) {
    // Test Doc:
    // - Why: Path traversal is OWASP Top 10 — must prevent /etc/passwd reads
    // - Contract: Any path resolving outside baseDir returns 403
    // - Quality Contribution: Prevents sensitive file leakage
    // - Worked Example: "../../etc/passwd" → 403 Forbidden

    srv := newTestServer(t, withFileRoot(t.TempDir()))
    req := httptest.NewRequest("GET", "/api/file?path=../../etc/passwd", nil)
    w := httptest.NewRecorder()
    srv.ServeHTTP(w, req)
    if w.Code != http.StatusForbidden {
        t.Errorf("expected 403, got %d", w.Code)
    }
}
```

### Non-Happy-Path Coverage
- [ ] File not found → 404 with clear message
- [ ] File too large (>5MB) → 413 with size info
- [ ] Directory path → 404
- [ ] Empty path parameter → 400
- [ ] Binary file (not text) → raw text display, no crash
- [ ] Markdown with nested HTML → sanitized correctly
- [ ] Network error fetching file → error state in preview

### Acceptance Criteria
- [ ] Markdown files render with formatted headings, lists, code blocks, tables
- [ ] `<script>` and `onerror` handlers stripped from rendered output
- [ ] Path traversal attempts blocked with 403
- [ ] Files >5MB rejected with 413
- [ ] Preview pane mode works (content in split layout)
- [ ] Both Go and TypeScript builds pass
- [ ] ADR-0004: No mocks in tests

---

## Phase 5: Custom Pattern Settings UI & Documentation

### Objective
Build the custom pattern editor in Settings, implement regex validation with ReDoS prevention,
and create user documentation.

### Deliverables
- `LinkDetectionSettings` section in SettingsPanel
- `CustomPatternEditor` for add/edit/delete pattern operations
- Regex validation with ReDoS detection
- `docs/how/clickable-links.md` user guide

### Dependencies
- Phase 1 must be complete (settings fields exist in store)
- Phases 2-4 should be complete for full documentation coverage

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ReDoS via user regex | Medium | Critical | Validate on save, test against known-bad patterns, timeout |
| Zustand array loop | High | High | Use useShallow for linkCustomPatterns subscription |
| Complex UI state | Medium | Medium | Keep pattern editor simple — list with add/edit/delete |

### Tasks (Hybrid: TDD for validation, lightweight for UI)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Write TDD tests for regex validation | 2 | Tests: valid regex passes, invalid syntax rejected, nested quantifiers detected, timeout on pathological input. Factory pattern | - | `lib/__tests__/linkValidation.test.ts` |
| 5.2 | [ ] | Implement regex validation library | 2 | Exports: `validateRegexPattern(pattern): { valid, error? }`. Checks: syntax, nested quantifiers, execution timeout (50ms against test string). Clear error messages | - | `lib/linkValidation.ts` |
| 5.3 | [ ] | Create `LinkDetectionSettings` component | 2 | Section in SettingsPanel with: links enabled toggle, activation mode selector (Cmd/Ctrl+Click vs single click). **DYK-07: No preview mode selector** — preview is always a pane. Uses scalar selectors | - | `components/LinkDetectionSettings.tsx` |
| 5.4 | [ ] | Create `CustomPatternEditor` component | 3 | Sub-section with: list of patterns (name, regex, template, enabled toggle), add button, edit inline, delete with confirmation. Pattern validation on save. Uses `useShallow` for array subscription | - | `components/CustomPatternEditor.tsx` |
| 5.5 | [ ] | Add LinkDetectionSettings to SettingsPanel | 1 | New section rendered in SettingsPanel between existing sections. Visual style matches other sections | - | Modify `components/SettingsPanel.tsx` |
| 5.6 | [ ] | Write lightweight tests for settings components | 1 | Tests: toggle renders, selector works, pattern list displays, add/edit/delete flows | - | `components/__tests__/LinkDetectionSettings.test.tsx` |
| 5.7 | [ ] | Create user documentation | 2 | `docs/how/clickable-links.md` covering: link types, activation, context menu, custom patterns (regex syntax + URL templates with $0-$9), preview modes, settings reference, known limitations | - | New file |
| 5.8 | [ ] | Final build verification | 1 | `cd frontend && npm run build` passes. `cd backend && go test ./...` passes. All new tests pass | - | Pre-push CI check |

### Test Examples (Phase 5)

```typescript
// lib/__tests__/linkValidation.test.ts
describe('validateRegexPattern', () => {
  test('accepts valid URL-like pattern', () => {
    /**
     * Test Doc:
     * - Why: Users create patterns like JIRA-\d+ for ticket links
     * - Contract: Well-formed regex passes validation
     * - Quality Contribution: Confirms normal user patterns aren't blocked
     * - Worked Example: "JIRA-\\d+" → { valid: true }
     */
    const result = validateRegexPattern('JIRA-\\d+')
    expect(result.valid).toBe(true)
  })

  test('rejects pathological pattern with nested quantifiers', () => {
    const result = validateRegexPattern('(a+)+$')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('ReDoS')
  })

  test('rejects invalid regex syntax', () => {
    const result = validateRegexPattern('[unclosed')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid regex')
  })
})
```

### Non-Happy-Path Coverage
- [ ] Add pattern with invalid regex → validation error shown, not saved
- [ ] Add pattern with ReDoS risk → rejected with explanation
- [ ] Delete last pattern → empty list displayed
- [ ] Edit pattern name to empty → validation prevents save
- [ ] 50+ custom patterns → settings panel scrolls, no performance issue

### Acceptance Criteria
- [ ] Link settings section appears in Settings panel
- [ ] Toggle, activation mode, and preview mode work correctly
- [ ] Custom patterns: add, edit, delete, enable/disable
- [ ] Regex validation catches invalid and pathological patterns
- [ ] Documentation covers all link features
- [ ] Both builds pass (frontend + backend)
- [ ] No Zustand infinite loops from array subscriptions

---

## Cross-Cutting Concerns

### Security Considerations
- **Path traversal**: Backend file API canonicalizes paths, restricts to base directory
- **XSS prevention**: All markdown rendering uses `rehype-sanitize`; no `dangerouslySetInnerHTML`
- **ReDoS protection**: User regex validated on save with timeout and nested quantifier detection
- **Input validation**: Custom patterns have name length limits, regex syntax validation
- **Protocol safety**: Only `http://`, `https://`, `vscode://`, `mailto:` protocols allowed

### Observability
- **Logging**: Console warnings for link provider timeouts, regex validation failures
- **Error tracking**: Preview panel shows clear error states (file not found, too large, network error)
- **Performance**: Link detection should not degrade terminal input latency (<50ms)

### Documentation
- **Location**: `docs/how/clickable-links.md` (Phase 5)
- **Content**: Link types, activation, context menu, custom patterns, preview, settings
- **Target audience**: trex users configuring link detection
- **Maintenance**: Update when new link types or preview capabilities added

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|-------------------------|---------------|------------|
| Overall Plan | 3 | Medium | S=2,I=2,D=1,N=0,F=1,T=1 | Many files modified + new dependencies + backend API + security concerns | Phased delivery, TDD for risky logic |
| Backend File API (Phase 4) | 2 | Small | S=1,I=0,D=0,N=0,F=1,T=1 | New endpoint with path traversal security | Standard Go patterns, comprehensive test coverage |
| Custom Pattern Editor (Phase 5) | 2 | Small | S=1,I=0,D=0,N=1,F=0,T=1 | UI for pattern CRUD, ReDoS validation | Keep UI simple, TDD for validation |
| Context Menu Integration (Phase 2) | 2 | Small | S=1,I=1,D=0,N=0,F=0,T=1 | Must work with xterm mouse capture | Native DOM listener, React portal |
| Preview Pane (Phase 4) | 3 | Medium | S=2,I=1,D=1,N=0,F=0,T=1 | New layout tree leaf type + recursive renderer update | Follow existing PaneContainer pattern |

---

## Progress Tracking

### Phase Completion Checklist
- [ ] Phase 1: Core Link Detection & Settings — NOT STARTED
- [ ] Phase 2: Click Handling & Context Menu — NOT STARTED
- [x] Phase 3: ~~Link Preview Side Panel~~ — ELIMINATED (DYK-07: preview is always a pane)
- [ ] Phase 4: Markdown Rendering & Backend File API — NOT STARTED
- [ ] Phase 5: Custom Pattern Settings UI & Documentation — NOT STARTED

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 (Fakes Only Testing) | Accepted | All | No mocks — FakeStorage for store tests, factory functions for isolation |
| ADR-0008 (Split Panel Library) | Accepted | 4 | react-resizable-panels used for split pane rendering |
| ADR-0009 (DnD Library) | Accepted | 4 | @atlaskit/pragmatic-drag-and-drop for pane drag operations |
| ADR-0010 (URL Layout Format) | Accepted | 4 | Current codec is v2 base64url JSON (`workspaceCodec.ts`, per Plan 016 Phase 6), not the original prefix notation from ADR-0010. PreviewLeaf requires codec extension (task 4.8) |

No ADR exists for link detection strategy or markdown library. Consider running `/plan-3a-adr` for
ADR Seed 1 (Link Detection Strategy) or ADR Seed 2 (Markdown Rendering Library) if architectural
decisions need formal documentation before implementation.

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| Layout tree contract (all leaves are terminal sessions) | PreviewLeaf extends layout tree beyond terminal-only leaves to support in-pane preview rendering | Side-panel-only preview (rejected: spec requires pane mode) | Change is additive and backward-compatible. Tree helpers updated explicitly (task 4.6). Workspace store updated (task 4.7). Codec updated (task 4.8). Tests cover mixed leaf types |

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]
[^4]: [To be added during implementation via plan-6a]
[^5]: [To be added during implementation via plan-6a]

---

## Critical Insights (2026-02-13)

| # | Insight | Decision |
|---|---------|----------|
| DYK-01 | PreviewLeaf + 8-pane cap = silent failure on "Open Preview" | Exclude PreviewLeaf from cap — `countTerminalPanes()` counts only `type: 'terminal'` |
| DYK-02 | `dissolveLayout()` and `closeLayout()` crash on PreviewLeaf (no sessionId) | Filter out preview leaves — previews simply close on dissolve/close |
| DYK-03 | WebGL pool appears hardcoded to 4 | No action — already dynamic via GPU detection (Apple: 6, discrete: 8, Intel: 4) |
| DYK-04 | `maybeAutoDissolve()` breaks when sole remaining leaf is PreviewLeaf | Remove item entirely; standalone preview items deferred to wishlist |
| DYK-05 | Terminal cache causes double-load of link addon on pane split | WeakSet guard in `useTerminalLinks` hook prevents duplicate handlers |
| DYK-06 | Context menu stuck at stale coordinates while terminal scrolls | Auto-dismiss on scroll/resize/blur/keypress added to task 2.4 |
| DYK-07 | Side panel preview becomes throwaway when standalone previews are added later | Eliminated Phase 3 entirely — preview is always a pane, no side panel ever |
| DYK-08 | `convertToLayout()` only accepts sessionId, can't create preview panes | `LeafFactory` pattern — `splitPaneWith` and `convertToLayoutWith` accept any leaf factory |
| DYK-09 | `getAllLeaves()` returns `PaneLeaf[]`, type `'leaf'` ambiguous with PreviewLeaf | Rename `PaneLeaf.type` from `'leaf'` to `'terminal'`; add `getTerminalLeaves()` helper |
| DYK-10 | File API exposes entire home directory to all authenticated users | Single-user is fine; TODO in handler + wishlist entry for multi-user scoping |

Action items: Phase 3 eliminated (7 tasks removed). Wishlist updated with standalone preview items and multi-user file API scoping.
