# Clickable Terminal Links

**Mode**: Full
**File Management**: Legacy

## Research Context

This specification incorporates findings from `research-dossier.md`.

- **Components affected**: Terminal.tsx (addon loading, click handlers), PaneContainer.tsx (context menu wrapping), settings.ts (new link settings), ui.ts (preview panel state), App.tsx (preview panel rendering)
- **Critical dependencies**: `@xterm/addon-web-links` (not installed), `react-markdown` + `rehype-sanitize` (not installed), xterm.js `registerLinkProvider()` API (requires `allowProposedApi: true`)
- **Modification risks**: Context menu must intercept xterm.js mouse events at the container level (xterm captures mouse internally); markdown preview needs XSS protection via `rehype-sanitize`; link addon must survive terminal cache/restore cycles
- **Link**: See `research-dossier.md` for full analysis (~65 findings across 8 subagents)

---

## Summary

Terminal output in trex currently renders all text as plain, unclickable content. Every modern terminal emulator (VS Code, iTerm2, Hyper, Warp) supports clickable links — their absence is a notable gap. This feature makes URLs, file paths, IP addresses, email addresses, and user-defined regex patterns detectable and actionable within terminal output. Users can Cmd/Ctrl+Click to open links, right-click for a context menu, and preview content (including rendered markdown) in a side panel or new pane.

**Why**: Eliminates copy-paste friction when working with terminal output containing URLs (build logs, error messages, API endpoints, documentation links, file paths in stack traces). This is a quality-of-life feature that brings trex to parity with other modern terminal emulators and fulfills the project's founding research recommendation to integrate `@xterm/addon-web-links`.

---

## Goals

- **Detect all common link types** via hardcoded built-in providers: HTTP/HTTPS URLs (via `@xterm/addon-web-links`), file paths (absolute and relative), IPv4 addresses, email addresses, and OSC 8 hyperlink escape sequences. Each built-in type has dedicated activation behavior (browser for URLs, `vscode://` for files, `mailto:` for emails)
- **Enable user-defined patterns** via a separate Settings UI where users can add custom regex patterns mapped to URL templates (e.g., `JIRA-\d+` maps to `https://jira.example.com/browse/$0`). Custom patterns are independent of built-in providers
- **Provide Cmd/Ctrl+Click activation** matching the convention established by VS Code and iTerm2, with visual hover indication (underline + pointer cursor when modifier key is held)
- **Offer a rich context menu** on right-click over a detected link: Open in Browser, Open Preview, Copy URL, Copy as Markdown
- **Support in-app preview** of link content in either a side panel or a new pane (user-configurable in Settings)
- **Render markdown files** with proper formatting, syntax highlighting, and XSS-safe sanitization when previewed via file path links
- **Work across the full terminal buffer** including scrollback history, and detect URLs that wrap across terminal lines
- **Survive terminal lifecycle events** — link detection persists through pane splits, layout restructuring, and terminal cache/restore cycles

---

## Non-Goals

- **Configurable editor selection** — File paths open via `vscode://` protocol only. A configurable editor chooser (Vim, Sublime, custom command template) is deferred to wishlist item "Configurable File Link Editor"
- **URL metadata proxy backend** — No new Go backend endpoints for fetching external URL metadata (title, description, favicon) or proxying external web content. A file-reading endpoint (`GET /api/file`) is in-scope for local markdown preview only
- **Automatic link following** — Links are never opened without explicit user action (click or context menu selection)
- **Terminal output rewriting** — Links are detected and overlaid; the underlying terminal buffer content is not modified
- **URL shortening or expansion** — Detected URLs are presented as-is without resolution of redirects or shorteners
- **Cross-pane link sharing** — Links detected in one pane cannot be "sent" to another pane; each pane's link detection is independent

---

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=2, D=1, N=0, F=1, T=1 (Total P=7)
- **Confidence**: 0.90 (up from 0.85 after clarifications resolved all open questions)
- **Note**: F stays at 1 — XSS and path traversal are real but well-mitigated by standard libraries (rehype-sanitize, filepath.Clean). Backend API endpoint adds scope but uses existing Go patterns.
- **Assumptions**:
  - `@xterm/addon-web-links` v0.12.0 is compatible with `@xterm/xterm` v6.0.0 (confirmed by research)
  - `registerLinkProvider()` works with `allowProposedApi: true` in xterm v6 (confirmed by type definitions)
  - Terminal cache preserves loaded addons across React remounts (confirmed by architecture analysis)
  - `react-markdown` with `rehype-sanitize` provides sufficient XSS protection for rendering untrusted markdown
- **Dependencies**:
  - NPM: `@xterm/addon-web-links`, `react-markdown`, `rehype-sanitize`, `rehype-raw`, `remark-gfm`
  - Optional: `rehype-highlight` or equivalent for code syntax highlighting in markdown preview
- **Risks**:
  - Context menu event interception with xterm.js mouse handling may require careful DOM event ordering
  - Custom regex patterns from user input could cause ReDoS if not validated
  - Markdown preview of large files could impact performance if not virtualized or size-limited
- **Phases** (suggested high-level):
  1. Core link detection (URL addon + custom providers + settings)
  2. Click handling + context menu
  3. Link preview panel (side panel mode)
  4. Markdown rendering + preview pane mode
  5. Custom pattern Settings UI

---

## Acceptance Criteria

### Link Detection

1. HTTP and HTTPS URLs in terminal output are detected and visually indicated with an underline and pointer cursor when the user holds Cmd (macOS) or Ctrl (Windows/Linux) and hovers over them
2. File paths in common formats (absolute paths like `/path/to/file.ts`, paths with line numbers like `./src/app.ts:42:10`) are detected as links
3. IPv4 addresses (e.g., `192.168.1.1`) are detected as links
4. Email addresses (e.g., `user@example.com`) are detected as links
5. OSC 8 hyperlink escape sequences emitted by terminal programs are rendered as clickable links
6. URLs that wrap across terminal lines (due to terminal width) are detected as a single link
7. Links are detected in both the visible viewport and the scrollback buffer
8. Link detection works identically whether the terminal is using the WebGL renderer or the DOM fallback renderer

### Link Activation

9. Cmd/Ctrl+Click on a URL opens it in the system's default browser in a new tab
10. Cmd/Ctrl+Click on a file path opens it in VS Code via the `vscode://file/{path}` protocol; if the path includes a line number, the `vscode://` URL includes the line parameter
11. Cmd/Ctrl+Click on an email address opens the system's default mail client via `mailto:` protocol
12. Cmd/Ctrl+Click on an IP address opens `http://{ip}` in the system browser
13. Cmd/Ctrl+Click on a custom pattern match opens the URL generated from the user's URL template

### Context Menu

14. Right-clicking on a detected link shows a context menu with at minimum: "Open in Browser", "Copy URL", "Open Preview", and "Copy as Markdown"
15. "Open in Browser" opens the link in the system browser
16. "Copy URL" copies the resolved URL to the clipboard
17. "Open Preview" opens the link content in the configured preview location (side panel or new pane)
18. "Copy as Markdown" copies the link in `[text](url)` format to the clipboard
19. For file path links, the context menu includes "Open in VS Code" as an additional option
20. Right-clicking on non-link terminal content does not show the link context menu (normal terminal context menu behavior is preserved)

### Link Preview

21. When "Open Preview" is selected, content opens in either a side panel or a new pane, depending on the user's `linkPreviewMode` setting
22. URL previews display the link target (at minimum, the URL itself; optionally an embedded view if same-origin)
23. Markdown file previews (`.md` extension) render the file content with formatted headings, lists, code blocks, tables (GitHub Flavored Markdown), and inline formatting
24. Markdown rendering sanitizes all HTML to prevent XSS (no script execution, no event handlers, no dangerous protocols)
25. Markdown code blocks include syntax highlighting

### Settings

26. A "Links" section in the Settings panel allows enabling/disabling all link detection
27. The link activation mode is configurable: Cmd/Ctrl+Click (default) or single click
28. The link preview mode is configurable: side panel (default) or new pane
29. A "Custom Patterns" subsection allows adding, editing, enabling/disabling, and removing custom regex-to-URL-template pattern pairs
30. Each custom pattern has a name, regex, URL template (with `$0` for full match, `$1`-`$9` for capture groups), and enabled toggle
31. All link settings persist across browser sessions (localStorage)

### Lifecycle & Resilience

32. Link detection is preserved when panes are split or the layout tree is restructured (terminal cache/restore)
33. Changing link settings (e.g., toggling links off then on, updating custom patterns) takes effect without requiring a page refresh or new terminal session
34. Link detection does not degrade terminal input latency or rendering performance in normal usage

---

## Testing Strategy

- **Approach**: Hybrid
- **Rationale**: Mixed complexity — pure regex logic (TDD), store persistence (TDD), UI/hook integration (lightweight/TAD)
- **Focus Areas**:
  - Link detection regex patterns (URL, file path, IP, email) — TDD with comprehensive edge cases
  - Custom link provider `provideLinks()` logic — TDD with fake terminal buffer content
  - Settings store (new link fields, merge backwards compat) — TDD with FakeStorage
  - Context menu rendering and actions — lightweight component tests
  - `useTerminalLinks` hook lifecycle — lightweight renderHook tests
- **Excluded**:
  - Visual rendering of link underlines (xterm.js addon handles this internally)
  - Markdown rendering correctness (delegated to react-markdown library)
  - OSC 8 hyperlink parsing (handled by xterm.js core)
- **Mock Usage**: Fakes only (ADR-0004). FakeStorage for persistence, factory functions for isolated stores. No mocking frameworks.

---

## Documentation Strategy

- **Location**: docs/how/ only
- **Rationale**: Feature has user-facing settings and custom pattern configuration that warrant a dedicated guide, but doesn't need README visibility.
- **Target File**: `docs/how/clickable-links.md`
- **Target Audience**: trex users configuring link detection, custom patterns, and preview behavior
- **Content**: Supported link types, activation methods, custom pattern syntax (regex + URL templates with capture groups), preview panel usage, settings reference
- **Maintenance**: Update when new link types or preview capabilities are added

---

## Risks & Assumptions

### Risks

- **Context menu event interception**: xterm.js captures mouse events internally. The link context menu must attach to the xterm container element or use xterm's `element` property, not a parent React element. Incorrect attachment means right-click won't fire on terminal content. Mitigation: research confirmed this is solvable by attaching `contextmenu` listener to the xterm container DOM element and rendering the menu in a React portal.
- **ReDoS from user-defined regex**: Users can enter arbitrary regex patterns in Settings. Pathological patterns (e.g., `(a+)+b`) could cause catastrophic backtracking. Mitigation: validate regex patterns on save (test against known-bad inputs, enforce a timeout, or use a safe regex library).
- **Markdown XSS**: Terminal output or linked files could contain malicious content. Rendering as HTML without sanitization is a security vulnerability. Mitigation: `rehype-sanitize` strips dangerous HTML by default; `react-markdown` avoids `dangerouslySetInnerHTML`.
- **Large file preview performance**: Previewing very large markdown files could freeze the UI. Mitigation: impose a file size limit for preview (e.g., 1MB) and show a warning for larger files.
- **`allowProposedApi` flag**: Enabling this flag on the xterm.js Terminal instance is required for `registerLinkProvider()`. This flag may enable other proposed APIs with unstable behavior. Mitigation: research confirms this is standard practice (VS Code and other embedders use it); the flag is documented in xterm.js v6 typings.
- **Relative path resolution**: File path links in terminal output are often relative (e.g., `./src/app.ts`). Resolving them requires the session's current working directory, which the backend must determine from the PTY process. This is OS-dependent and may fail for some shell configurations. Mitigation: support absolute paths first, add CWD resolution as best-effort with fallback to showing a "could not resolve path" message.
- **File API security (path traversal)**: The `GET /api/file` endpoint must prevent directory traversal attacks (e.g., `../../etc/passwd`). Mitigation: canonicalize paths, restrict to allowed directories, reject paths containing `..` after canonicalization.

### Assumptions

- Users have VS Code installed when clicking file path links (graceful degradation if not — browser shows protocol handler error)
- The Vite dev server's existing proxy configuration is sufficient for any backend API calls needed
- `@xterm/addon-web-links` v0.12.0 is stable and maintained (it is part of the official xterm.js monorepo)
- Terminal programs that emit OSC 8 hyperlinks do so correctly per the specification

---

## Open Questions

1. ~~**[RESOLVED: Markdown file source]**~~ — New backend API endpoint `GET /api/file?path=...` that reads files from disk. Must be secured (path traversal prevention, restrict to allowed directories). Relative paths require knowing the session's working directory — for absolute paths this is straightforward, for relative paths the backend needs the session's CWD (potentially via `/proc/{pid}/cwd` or `lsof` on the PTY process). See Clarifications Q5.

2. ~~**[RESOLVED: Preview pane architecture]**~~ — Both modes will be implemented: side panel overlay first (like SettingsPanel, no workspace model changes), then pane mode as a second iteration within this plan. Pane mode will use a new layout tree leaf type (`preview`) to render non-terminal content within existing split infrastructure. See Clarifications Q6.

---

## ADR Seeds (Optional)

### ADR Seed 1: Link Detection Strategy
- **Decision Drivers**: Need to detect URLs (standard), file paths, IPs, emails (custom), and user-defined patterns; performance on hover; xterm.js v6 API surface
- **Candidate Alternatives**:
  - A: `@xterm/addon-web-links` only (URLs only, no custom patterns)
  - B: Custom `registerLinkProvider()` only (full control, more code to maintain)
  - C: `@xterm/addon-web-links` for URLs + custom `registerLinkProvider()` for other patterns (hybrid, best of both)
- **Stakeholders**: Developer (primary user), maintainer (code complexity)

### ADR Seed 2: Markdown Rendering Library
- **Decision Drivers**: XSS safety, React integration, GFM support, syntax highlighting, bundle size
- **Candidate Alternatives**:
  - A: `react-markdown` + `remark-gfm` + `rehype-sanitize` + `rehype-highlight` (React-native, secure by default)
  - B: `marked` + `DOMPurify` + `dangerouslySetInnerHTML` (faster parsing, requires explicit sanitization)
  - C: `@mdx-js/react` (JSX in markdown, heavier, more powerful)
- **Stakeholders**: Developer (security), maintainer (dependency weight)

### ADR Seed 3: Link Preview Panel Architecture
- **Decision Drivers**: User preference for side panel vs new pane; workspace model simplicity; layout tree extensibility
- **Candidate Alternatives**:
  - A: Side panel overlay (like SettingsPanel) — simple, no workspace model changes
  - B: New workspace item type (`preview`) — clean model, heavier implementation
  - C: Split within current layout using a non-terminal pane leaf type — reuses split infrastructure, extends layout tree
- **Stakeholders**: Developer (UX flexibility), maintainer (architecture impact)
- **Direction** (from Q6): Both A (side panel, first) and C (preview leaf in layout tree, second iteration). Not B.

---

## Workshop Opportunities

Areas that benefit from detailed design exploration BEFORE architecture:

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Custom Link Provider Design | Integration Pattern | Multiple link types (URL, file, IP, email, custom) need coordinated detection with different activation behaviors. The provider chain ordering and regex validation strategy affect correctness and performance. | 1. How should multiple providers be prioritized when patterns overlap? 2. How to validate user regex patterns against ReDoS? 3. Should providers be hot-swappable when settings change? 4. How to handle the link-under-cursor tracking for context menu? |
| Link Preview Panel UX | State Machine | Preview can open as side panel or new pane, with content varying by link type (URL, markdown file, plain text). The state transitions (open, switch content, close, resize) and data flow need specification. | 1. What happens when user clicks a second link while preview is open — replace or stack? 2. How does preview panel interact with settings panel (both are side panels)? 3. Should preview pane remember its size/position? 4. How to handle preview of non-previewable content (binary files, large files)? |
| Context Menu Integration with xterm.js | Integration Pattern | xterm.js captures mouse events, so the context menu must be attached at the right DOM level. Need to track which link (if any) is under the cursor when right-click occurs. | 1. Should the context menu attach to xterm's `.element` property or the React container ref? 2. How to track the "currently hovered link" for context menu — ref updated by hover/leave callbacks? 3. How to handle right-click when no link is under cursor (pass through to default terminal context menu)? |

**Note**: Workshops can be created anytime during planning via `/plan-2c-workshop`

---

## Unresolved Research

- **Topics**:
  - Multi-line URL detection in xterm.js (how wrapped URLs are joined)
  - File path opening across platforms (OS-level file opening APIs beyond `vscode://`)
- **Impact**: Low — the xterm.js external research agent (aee9544) covered both topics in depth. Multi-line detection is handled natively by `WebLinkProvider` via `isWrapped` flag expansion (up to 2048 chars). File path opening is scoped to `vscode://` for this plan (configurable editor deferred to wishlist).
- **Recommendation**: No further research needed before architecture phase. Both topics are sufficiently understood.

---

## Clarifications

### Session 2026-02-13

**Q1: Workflow Mode** — Full
- Rationale: CS-3 feature with ~5 phases, multiple new components, and cross-cutting concerns (addon lifecycle, context menu, preview panel, settings). Full mode provides the structure needed for phased delivery with proper gates.

**Q2: Testing Strategy** — Hybrid
- Rationale: TDD for link detection regex logic + store persistence tests; TAD/lightweight for UI components + hook lifecycle + addon integration. Matches the mixed complexity profile.

**Q2a: Mock Usage** — Fakes only (pre-decided by ADR-0004)
- Rationale: Project constitution mandates fakes-only testing. FakeStorage, factory functions for isolated stores. No vi.mock() or jest.mock().

**Q3: Documentation Strategy** — docs/how/ only
- Rationale: Dedicated guide at `docs/how/clickable-links.md` covering supported link types, custom pattern syntax, and preview usage. Keeps README clean.

**Q4: File Management** — Legacy
- Rationale: Files in standard locations (hooks/, components/, lib/, stores/) consistent with existing codebase structure.

**Q5: Markdown file source** — New backend API endpoint (`GET /api/file?path=...`)
- Must be secured against path traversal attacks
- Absolute paths are straightforward
- Relative paths are tricky: requires knowing the session's working directory (CWD). The backend would need to resolve relative paths against the PTY process's CWD (e.g., via `/proc/{pid}/cwd` or similar OS mechanism)
- Consider restricting file reads to a configurable root directory or the session's CWD subtree

**Q6: Preview pane architecture** — Both panel + pane (full spec)
- Side panel overlay implemented first (like SettingsPanel, no workspace model changes)
- Pane mode added as second iteration within this plan
- Pane mode uses a new `preview` leaf type in the layout tree, reusing existing split infrastructure
- This extends PaneLayout types but avoids creating a new workspace item type

**Q7: Built-in link patterns** — Hardcoded built-in providers
- File paths, IPs, and emails detected by dedicated code (not user-editable regex)
- Custom patterns are a separate user-only feature for additional link types (e.g., JIRA tickets)
- Built-in providers are more reliable and can have type-specific activation behavior (vscode:// for files, mailto: for emails, etc.)

---

### Coverage Summary

| Category | Status | Details |
|----------|--------|---------|
| Workflow Mode | Resolved | Full (CS-3, multi-phase) |
| Testing Strategy | Resolved | Hybrid (TDD for logic, lightweight for UI) |
| Mock Usage | Resolved | Fakes only (ADR-0004, pre-decided) |
| Documentation | Resolved | docs/how/clickable-links.md |
| File Management | Resolved | Legacy (standard locations) |
| Markdown file source | Resolved | Backend API `GET /api/file` with path traversal security |
| Preview architecture | Resolved | Side panel first, then pane mode (preview leaf in layout tree) |
| Built-in vs custom patterns | Resolved | Hardcoded built-in providers + separate custom patterns |
| Relative path resolution | Deferred | Best-effort CWD detection from PTY process; fallback to error message |
| Questions asked | 7/8 | All critical ambiguities resolved |
