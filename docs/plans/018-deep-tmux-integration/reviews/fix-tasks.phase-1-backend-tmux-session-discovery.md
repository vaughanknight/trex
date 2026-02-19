# Phase 1: Backend tmux Session Discovery — Fix Tasks

**Review**: `reviews/review.phase-1-backend-tmux-session-discovery.md`
**Verdict**: REQUEST_CHANGES
**Date**: 2026-02-19
**Testing Approach**: TDD

---

## Fix Tasks (Severity-Ordered)

### FIX-1: Add RWMutex to protect `lastSessions` [HIGH — RACE-001]

**File**: `backend/internal/terminal/tmux_monitor.go`
**Lines**: Struct definition (16-33), `pollSessions()` (163-178), `GetLastSessions()` (182-189)

**Problem**: `lastSessions` is written by `pollSessions()` on the monitor goroutine and read by `GetLastSessions()` from WebSocket handler goroutines. No synchronization.

**TDD Approach**:
1. **RED**: Write a test that calls `GetLastSessions()` concurrently with `pollSessions()` — ideally use `go test -race` to detect the race.
2. **GREEN**: Add `sync.RWMutex` to the struct. Lock in `pollSessions()`, RLock in `GetLastSessions()`.
3. **REFACTOR**: Verify existing tests still pass.

**Patch**:
```diff
 type TmuxMonitor struct {
     detector TmuxDetector
     registry *SessionRegistry
     interval time.Duration
     onChange          func(updates map[string]string)
     onSessionsChanged func(sessions []TmuxSessionInfo)
+    mu           sync.RWMutex       // protects lastSessions
     lastSessions []TmuxSessionInfo

 func (m *TmuxMonitor) pollSessions() {
     sessions, err := m.detector.ListSessions()
     if err != nil {
         log.Printf("tmux list-sessions error: %v", err)
         return
     }

+    m.mu.RLock()
     if sessionsEqual(m.lastSessions, sessions) {
+        m.mu.RUnlock()
         return
     }
+    m.mu.RUnlock()

+    m.mu.Lock()
     m.lastSessions = sessions
+    m.mu.Unlock()
+
     if m.onSessionsChanged != nil {
-        m.onSessionsChanged(sessions)
+        // Pass a copy to prevent callback from mutating cached state
+        m.onSessionsChanged(append([]TmuxSessionInfo(nil), sessions...))
     }
 }

 func (m *TmuxMonitor) GetLastSessions() []TmuxSessionInfo {
+    m.mu.RLock()
+    defer m.mu.RUnlock()
     if len(m.lastSessions) == 0 {
         return nil
     }
     result := make([]TmuxSessionInfo, len(m.lastSessions))
     copy(result, m.lastSessions)
     return result
 }
```

**Validation**: `cd backend && go test -race ./internal/terminal/ -v`

---

### FIX-2: Remove `/api/file` route from Phase 1 scope [HIGH — SC-001]

**File**: `backend/internal/server/server.go`
**Line**: 133

**Problem**: `s.mux.HandleFunc("/api/file", s.handleFileRead())` belongs to Plan 017, not Plan 018 Phase 1.

**Options**:
1. **Preferred**: Acknowledge this is pre-existing Plan 017 work in the working tree. No action needed for Phase 1 — it will be committed separately under Plan 017.
2. **Alternative**: If creating a clean Phase 1 commit, `git add` only the Phase 1 files and exclude server.go's `/api/file` line.

**Note**: Since all Phase 1 changes are uncommitted, the scope violation can be resolved at commit time by only staging Phase 1-relevant changes to server.go (the `handleSessionsChanged()` method and `New()` monitor wiring).

**Validation**: Verify `git diff --cached` after staging only shows Phase 1 changes.

---

### FIX-3 (Optional): Remove dead backoff code [MEDIUM — DEAD-001]

**File**: `backend/internal/terminal/tmux_monitor.go`
**Lines**: 87-89, 110-112

**Problem**: `consecutiveFailures`, `maxConsecutiveFailures`, `backoffInterval` are declared but never incremented. The backoff conditional (lines 110-112) can never trigger.

**Note**: This is pre-existing from Plan 014. Consider as a separate cleanup task rather than blocking Phase 1.

**Patch** (remove dead code):
```diff
 func (m *TmuxMonitor) run() {
     defer m.wg.Done()

     ticker := time.NewTicker(m.interval)
     defer ticker.Stop()

-    consecutiveFailures := 0
-    const maxConsecutiveFailures = 3
-    backoffInterval := 30 * time.Second

     for {
         select {
         case <-m.ctx.Done():
             return
         case newInterval := <-m.intervalCh:
             m.interval = newInterval
             ticker.Reset(m.interval)
         case <-ticker.C:
             changes := m.poll()
             if changes != nil && len(changes) > 0 && m.onChange != nil {
                 m.onChange(changes)
             }
             m.pollSessions()
-
-            if consecutiveFailures >= maxConsecutiveFailures {
-                ticker.Reset(backoffInterval)
-            }
         }
     }
 }
```

**Validation**: `cd backend && go test ./internal/terminal/ -v`

---

### FIX-4 (Optional): Pass copy to `onSessionsChanged` callback [LOW — OBS-002]

**File**: `backend/internal/terminal/tmux_monitor.go`
**Line**: 176

**Problem**: Callback receives same slice reference as `m.lastSessions`. If callback mutates, it corrupts cache.

**Note**: Addressed in FIX-1 patch above (combined with mutex fix). If FIX-1 is applied as shown, this is already resolved.

---

## Fix Summary

| Priority | Fix | Effort | Blocking |
|----------|-----|--------|----------|
| 1 | FIX-1: Add RWMutex | 15 min | Yes |
| 2 | FIX-2: Scope separation | 5 min (at commit time) | Yes |
| 3 | FIX-3: Dead backoff code | 5 min | No |
| 4 | FIX-4: Copy to callback | 0 min (included in FIX-1) | No |

**Estimated total fix time**: ~25 minutes for blocking fixes.

---

*Generated by /plan-7-code-review on 2026-02-19*
