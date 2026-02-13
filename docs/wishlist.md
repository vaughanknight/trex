# Wishlist

Future feature ideas and enhancements.

---

## Session Groups with Drag-and-Drop Pane Layouts

I want to be able to create "session groups" and drag sessions into a layout to have panes - side by side, above/below - and then drag another one into the pane.

**How it would work:**
- Start with a session open
- Drag another session in with highlights showing if it's vertical or horizontal split
- Drag in another session and it would show within those panes how it could divide vertical or horizontal
- Dividers could be moved around to resize panes
- A minimal, stylish title bar would show in each pane
- The sidebar menu item would become a "group" indicating multiple terminals within that one menu entry

**Inspiration:** Similar to VS Code's editor split, or tmux/iTerm2 pane layouts, but with modern drag-and-drop UX.

---

## Standalone Preview Items (Post Plan 017)

Upgrade preview panes to first-class workspace items that can exist standalone in the sidebar — like pinned reference documentation you can switch back to while working.

**How it would work:**
- Preview panes (from Plan 017's clickable links) can be dragged to the sidebar to become standalone items
- Dissolving a layout with preview panes creates standalone preview items (instead of discarding them)
- Sidebar shows preview items with a document icon, distinct from terminal items
- Clicking a standalone preview in the sidebar shows it full-width in the main area
- Context menu: Close, Refresh, Open in Browser/Editor

**Implementation readiness (from Plan 017 DYK-04):**
- `PreviewLeaf` type already exists in `types/layout.ts` with `{ type: 'preview', paneId, contentType, source }`
- Layout tree helpers already handle PreviewLeaf (no sessionId)
- Workspace store already filters preview leaves in dissolve/close paths
- **To add**: New `WorkspacePreviewItem` type in `types/workspace.ts`, handle in all `item.type` switches (~15 locations in workspace store), sidebar rendering, App.tsx main area rendering, URL codec `{ t: 'p', ... }` item type, tests
- Estimated: ~5-6 tasks, CS-2

**Context**: Plan 017 ships with PreviewLeaf structurally ready but previews only exist within layouts. This upgrades them to standalone first-class items.

---

## Configurable File Link Editor

When clicking a file path link in the terminal (from Plan 017), allow the user to configure which editor opens the file. Currently defaults to `vscode://` protocol.

- Settings UI dropdown: VS Code, Vim, Sublime Text, Custom command
- Custom command template: e.g., `subl {file}:{line}`, `nvim +{line} {file}`
- Detect installed editors on system (if possible)
- Per-file-type rules (e.g., `.md` opens preview, `.py` opens in editor)

**Context**: Plan 017 ships with `vscode://` as the default. This upgrades to configurable editor support.

---

## Freeform Keybinding Engine

Replace the preset-dropdown keyboard shortcut configuration (Plan 016 v1) with a full keybinding engine:
- "Press a key" capture UI for rebinding shortcuts
- Modifier key detection across OS (⌘ vs Ctrl, etc.)
- Conflict detection (warn when two actions share the same binding)
- Human-readable key labels (⌘+1, Ctrl+Shift+[, etc.)
- Import/export keybinding profiles

**Context**: Plan 016 ships with preset dropdowns for simplicity. This upgrades to freeform capture.

---

## Multi-User File API Security Scoping

If trex ever supports multi-user deployments (beyond trusted sharing), the `GET /api/file` endpoint (Plan 017) needs per-session or per-user scoping.

**Current state (single-user):**
- Base directory is `TREX_FILE_ROOT` env var or `os.UserHomeDir()` fallback
- Path traversal protection prevents escaping base dir
- Any authenticated user can read any file within the base directory
- Fine for local use and trusted sharing

**Multi-user requirements:**
- Scope file reads per session CWD (each terminal session has its own working directory)
- Or scope per user (each user can only read their own files)
- Consider read-only vs read-write permissions
- Audit logging for file access

**Context**: Plan 017 ships with single-user path traversal protection and a TODO in the handler. This upgrades to multi-user-safe file access.

---

## External Session Task List Inspector

Read the Claude Code session's task list (TodoWrite/TaskCreate) from outside the terminal without interrupting the agent's thinking.

- Claude Code writes the full conversation transcript to `~/.claude/projects/<project>/<session-id>.jsonl` in real-time
- A small script could tail the JSONL file, parse `TaskCreate`/`TaskUpdate` tool calls, and reconstruct current task state
- Display as a simple TUI, CLI one-liner, or even a small web dashboard
- Auto-detect active session (most recently modified `.jsonl` in the project directory)

**Approach**: Python or Node script — `tail -f` + JSON parse + state accumulation. No process memory inspection needed, just disk-based log parsing.

**Also works for GitHub Copilot**: Copilot Chat stores conversation history as JSON files at `~/Library/Application Support/Code/User/workspaceStorage/<workspace-hash>/chatSessions/*.json`. Same tail-and-parse approach, different JSON format. Community prior art: [VSCode Copilot Chat Viewer](https://github.com/Timcooking/VSCode-Copilot-Chat-Viewer).
