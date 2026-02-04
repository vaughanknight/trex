# trex Project Idioms

**Version**: 1.0.0-draft
**Status**: DRAFT - Pending constitution completion (Q16-Q20)
**Last Updated**: 2026-02-04

---

<!-- USER CONTENT START -->
<!-- This section preserves user customizations across idioms updates -->
<!-- USER CONTENT END -->

## Purpose

This document contains recurring patterns, examples, and idiomatic approaches for trex development.

---

## Project Structure

```
trex/
├── cmd/
│   └── trex/              # Main application entry point
├── internal/
│   ├── api/               # REST API handlers
│   ├── ws/                # WebSocket server
│   ├── persistence/       # Data storage (favorites, groups, preferences)
│   └── config/            # Configuration management
├── pkg/                   # Public packages (if any)
├── frontend/              # Next.js application
│   ├── app/               # Next.js app router
│   ├── components/        # React components
│   └── lib/               # Frontend utilities
├── tests/
│   ├── unit/              # Unit tests (with fakes)
│   ├── integration/       # Integration tests (real dependencies)
│   └── scratch/           # TDD exploration (excluded from CI)
├── docs/
│   ├── project-rules/     # Constitution, rules, idioms, architecture
│   ├── adr/               # Architecture Decision Records
│   └── protocols/         # WebSocket protocol documentation
└── .github/
    ├── ISSUE_TEMPLATE/    # Issue templates
    └── pull_request_template.md
```

---

## Commit Message Examples

### Good Commits

```
feat(api): add session list endpoint

fix(ws): resolve connection timeout on slow networks

docs(readme): update installation instructions

refactor(frontend): extract terminal component

test(api): add integration tests for session creation

chore(deps): update xterm.js to v5.4.0

perf(ws): reduce message serialization overhead

ci: add coverage threshold check
```

### Bad Commits

```
# Too vague
fix: bug fix
update: changes

# No type
added new feature

# Wrong format
FEAT: Add feature
feat - add feature
```

---

## Testing Idioms

### Fake vs Real Pattern

```go
// Unit test - uses fake
func TestSessionManager_List(t *testing.T) {
    fake := NewFakeTmux()
    fake.AddSession("dev", "idle")
    fake.AddSession("prod", "active")

    mgr := NewSessionManager(fake)
    sessions, err := mgr.List()

    assert.NoError(t, err)
    assert.Len(t, sessions, 2)
}

// Integration test - uses real tmux
func TestSessionManager_List_Integration(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test")
    }

    // Uses real tmux on system
    mgr := NewSessionManager(NewRealTmux())
    sessions, err := mgr.List()

    assert.NoError(t, err)
    // Assertions based on actual tmux state
}
```

### Test Doc Block Example (Go)

```go
func TestParseSessionName_HandlesSpecialCharacters(t *testing.T) {
    // Test Doc:
    // - Why: Regression guard for #42 where session names with colons caused panics
    // - Contract: ParseSessionName accepts any valid tmux session name and returns normalized string
    // - Usage Notes: Input must be non-empty; empty strings return error
    // - Quality Contribution: Prevents crashes on edge-case session names; documents valid name formats
    // - Worked Example: "my:session:name" → "my-session-name"; "project/branch" → "project-branch"

    tests := []struct {
        input    string
        expected string
    }{
        {"my:session", "my-session"},
        {"project/branch", "project-branch"},
    }

    for _, tc := range tests {
        result := ParseSessionName(tc.input)
        assert.Equal(t, tc.expected, result)
    }
}
```

### Test Doc Block Example (TypeScript)

```typescript
test('parseSessionName handles special characters', () => {
  /**
   * Test Doc:
   * - Why: Regression guard for #42 where colons in names caused UI crash
   * - Contract: parseSessionName normalizes any tmux session name to URL-safe string
   * - Usage Notes: Throws on empty input; preserves alphanumeric characters
   * - Quality Contribution: Prevents XSS via session names; documents normalization rules
   * - Worked Example: "my:session" → "my-session"; "project/branch" → "project-branch"
   */

  expect(parseSessionName('my:session')).toBe('my-session');
  expect(parseSessionName('project/branch')).toBe('project-branch');
});
```

### Scratch → Promote Workflow

```bash
# 1. Create scratch test for exploration
tests/scratch/test_new_feature.go

# 2. Run scratch tests locally (fast iteration)
go test ./tests/scratch/...

# 3. Once working, promote to proper location
mv tests/scratch/test_new_feature.go tests/unit/session/

# 4. Add Test Doc block before committing
# 5. Ensure CI includes the promoted test
```

---

## Complexity Estimation Examples

### CS-1 (Trivial) - Score: 0-2

**Example**: Rename a constant used in one file

| Factor | Score | Reason |
|--------|-------|--------|
| Surface Area | 0 | One file |
| Integration | 0 | Internal only |
| Data & State | 0 | None |
| Novelty | 0 | Well-specified |
| NFR | 0 | Standard |
| Testing | 0 | Unit only |
| **Total** | **0** | **CS-1** |

### CS-3 (Medium) - Score: 5-7

**Example**: Add new REST endpoint for session favorites

| Factor | Score | Reason |
|--------|-------|--------|
| Surface Area | 1 | Multiple files (handler, service, tests) |
| Integration | 1 | One external (persistence layer) |
| Data & State | 1 | Minor schema addition |
| Novelty | 1 | Some design decisions |
| NFR | 0 | Standard |
| Testing | 1 | Integration tests needed |
| **Total** | **5** | **CS-3** |

### CS-5 (Epic) - Score: 10-12

**Example**: Add multi-device sync capability

| Factor | Score | Reason |
|--------|-------|--------|
| Surface Area | 2 | Cross-cutting changes |
| Integration | 2 | Multiple externals (sync service, auth) |
| Data & State | 2 | Significant migration, conflict resolution |
| Novelty | 2 | Unclear specs, research needed |
| NFR | 1 | Performance constraints |
| Testing | 2 | Staged rollout, feature flags |
| **Total** | **11** | **CS-5** |

**Required for CS-5**:
- ✅ Feature flags
- ✅ Rollback plan
- ✅ ADR

---

## Keyboard Shortcut Patterns

### tmux-like Shortcuts in Browser

| Action | tmux | trex (in browser) |
|--------|------|-------------------|
| List all sessions | `Ctrl-B s` | `Ctrl-B s` or `Cmd-K` (command palette) |
| Next session | `Ctrl-B n` | `Ctrl-B n` or arrow keys in preview |
| Previous session | `Ctrl-B p` | `Ctrl-B p` |
| Detach | `Ctrl-B d` | `Ctrl-B d` or close tab |

---

## API Design Patterns

### REST Endpoint Naming

```
GET    /api/sessions          # List all sessions
GET    /api/sessions/:id      # Get session details
POST   /api/sessions          # Create new session
DELETE /api/sessions/:id      # Kill session

GET    /api/favorites         # List favorites
POST   /api/favorites         # Add favorite
DELETE /api/favorites/:id     # Remove favorite

GET    /api/groups            # List groups
POST   /api/groups            # Create group
PUT    /api/groups/:id        # Update group
DELETE /api/groups/:id        # Delete group
```

### WebSocket Message Format

```typescript
// Client → Server
interface ClientMessage {
  type: 'attach' | 'detach' | 'input' | 'resize';
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
}

// Server → Client
interface ServerMessage {
  type: 'output' | 'status' | 'error' | 'sessions';
  sessionId?: string;
  data?: string;
  sessions?: Session[];
  error?: string;
}
```

---

## Anti-Patterns

### What NOT to Do

**❌ Direct tmux calls in trex**
```go
// BAD - Don't do this in trex
cmd := exec.Command("tmux", "list-sessions")
```

```go
// GOOD - Use tmax library
sessions, err := tmax.ListSessions()
```

**❌ Using mocks**
```go
// BAD - No mocks
mockTmux := &MockTmux{}
mockTmux.On("ListSessions").Return(...)
```

```go
// GOOD - Use fakes
fakeTmux := NewFakeTmux()
fakeTmux.AddSession("dev", "idle")
```

**❌ Time estimates**
```
// BAD
"This will take about 2 hours"
"Quick fix, 30 minutes"
```

```
// GOOD
"CS-2 (Small) - Surface:1, Integration:0, Data:0, Novelty:1, NFR:0, Testing:1"
```

**❌ Orphan PRs**
```
// BAD - PR without linked issue
feat(api): add session endpoint
```

```
// GOOD - PR with linked issue
feat(api): add session endpoint

Closes #42
```

---

## Configuration Patterns

### XDG-Compliant Paths

```go
func ConfigDir() string {
    if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
        return filepath.Join(xdg, "trex")
    }
    home, _ := os.UserHomeDir()
    return filepath.Join(home, ".config", "trex")
}

func DataDir() string {
    if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
        return filepath.Join(xdg, "trex")
    }
    home, _ := os.UserHomeDir()
    return filepath.Join(home, ".local", "share", "trex")
}

func CacheDir() string {
    if xdg := os.Getenv("XDG_CACHE_HOME"); xdg != "" {
        return filepath.Join(xdg, "trex")
    }
    home, _ := os.UserHomeDir()
    return filepath.Join(home, ".cache", "trex")
}
```

---

See [Constitution](./constitution.md) for rationale and [Rules](./rules.md) for enforceable requirements.
