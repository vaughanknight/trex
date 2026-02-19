# gotmux Library Evaluation

**Source**: Perplexity Deep Research (2026-02-18)
**Query**: Evaluate gotmux Go library for production web terminal application use

## Key Findings

### Recommendation: Raw CLI calls are sufficient for Plan 018

gotmux is a solid library (26 stars, v0.4.0, MIT licensed, active maintenance), but for trex's needs, **raw CLI calls remain the better choice**:

1. **We already have the pattern**: `TmuxDetector` already does `exec.Command("tmux", ...)` — extending with `ListSessions()` is trivial
2. **No thread safety built in**: gotmux provides no mutexes/synchronization — we'd need to add our own anyway (same as raw CLI)
3. **Same performance profile**: Both approaches spawn subprocesses per call. No advantage from gotmux
4. **Additional dependency**: gotmux is maintained by a single developer (McGill student). Our `exec.Command` calls have zero external deps
5. **Feature coverage we need is tiny**: We only need `list-sessions`, `list-clients`, and `attach`. gotmux's comprehensive API (pane management, key sending, etc.) is overkill

### gotmux API Coverage (for reference)

- Sessions: create, rename, delete, attach, detach, list, metadata
- Windows: create, move, layout, navigate, activity tracking
- Panes: split, resize, capture, sync, command execution
- Server/Client: status, version, client listing, socket config
- Socket support: default, named (`-L`), full path (`-S`)

### Performance Characteristics (applies to both gotmux and raw CLI)

- Process creation: hundreds of microseconds to several milliseconds
- Typical operation latency: 10-50ms (list sessions), 20-100ms (create session)
- For polling at 5s intervals: overhead is negligible (<1% of interval)

### Alternative Go Libraries

| Library | Stars | Last Update | Assessment |
|---------|-------|-------------|------------|
| **gotmux** | 26 | 2025 (active) | Most comprehensive, good maintenance |
| **go-tmux** | ~few | 2021 (stale) | Less active, compatibility concerns |
| **gomux** | ~few | Older | Minimal API, focused on automation |

### Thread Safety Note

All CLI-based approaches (gotmux, go-tmux, raw exec) are inherently thread-safe at the Go level — each subprocess is independent. Race conditions only emerge at the tmux server level (sequential command processing). trex's existing `sync.RWMutex` in `SessionRegistry` handles this.

### Decision

**Stay with raw CLI calls** (extend `TmuxDetector`). gotmux is good but adds a dependency we don't need. If we ever need deep tmux management (pane splitting, key sending, etc.), reconsider gotmux at that point.
