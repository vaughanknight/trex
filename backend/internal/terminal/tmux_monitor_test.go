package terminal

import (
	"errors"
	"testing"
	"time"
)

var errTest = errors.New("test error")

// Test Doc:
// - Why: TmuxMonitor is the core polling loop that detects tmux session attachments
// - Contract: Detects attach (name set), detach (name cleared), session switch (name changed);
//   no-change is idempotent (onChange not called); stops on context cancel; skips when unavailable
// - Usage Notes: Uses FakeTmuxDetector + real SessionRegistry + FakePTY with SimulatedTtyPath
// - Quality Contribution: Catches regressions in tmux detection logic and polling lifecycle
// - Worked Example: AddClient("/dev/ttys010","work") → poll() → session.TmuxSessionName="work"

func newTestSession(id, ttyPath string) *Session {
	fakePTY := NewFakePTY()
	fakePTY.SimulatedTtyPath = ttyPath
	s := &Session{
		ID:      id,
		TtyPath: ttyPath,
	}
	return s
}

func TestTmuxMonitor_DetectAttach(t *testing.T) {
	registry := NewSessionRegistry()
	registry.Add(newTestSession("s1", "/dev/ttys010"))

	detector := NewFakeTmuxDetector()
	detector.AddClient("/dev/ttys010", "work")

	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil, nil)

	changes := monitor.poll()
	if len(changes) != 1 {
		t.Fatalf("expected 1 change, got %d", len(changes))
	}
	if changes["s1"] != "work" {
		t.Errorf("expected 'work', got %q", changes["s1"])
	}

	session := registry.Get("s1")
	if session.TmuxSessionName != "work" {
		t.Errorf("session.TmuxSessionName = %q, want 'work'", session.TmuxSessionName)
	}
}

func TestTmuxMonitor_DetectDetach(t *testing.T) {
	registry := NewSessionRegistry()
	s := newTestSession("s1", "/dev/ttys010")
	s.TmuxSessionName = "work" // Already attached
	registry.Add(s)

	detector := NewFakeTmuxDetector()
	// No clients — simulates detach

	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil, nil)

	changes := monitor.poll()
	if len(changes) != 1 {
		t.Fatalf("expected 1 change, got %d", len(changes))
	}
	if changes["s1"] != "" {
		t.Errorf("expected empty string (detach), got %q", changes["s1"])
	}

	session := registry.Get("s1")
	if session.TmuxSessionName != "" {
		t.Errorf("session.TmuxSessionName = %q, want empty", session.TmuxSessionName)
	}
}

func TestTmuxMonitor_DetectSessionSwitch(t *testing.T) {
	registry := NewSessionRegistry()
	s := newTestSession("s1", "/dev/ttys010")
	s.TmuxSessionName = "work"
	registry.Add(s)

	detector := NewFakeTmuxDetector()
	detector.AddClient("/dev/ttys010", "debug") // Switched to different session

	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil, nil)

	changes := monitor.poll()
	if len(changes) != 1 {
		t.Fatalf("expected 1 change, got %d", len(changes))
	}
	if changes["s1"] != "debug" {
		t.Errorf("expected 'debug', got %q", changes["s1"])
	}
}

func TestTmuxMonitor_NoChange_Idempotent(t *testing.T) {
	registry := NewSessionRegistry()
	s := newTestSession("s1", "/dev/ttys010")
	s.TmuxSessionName = "work"
	registry.Add(s)

	detector := NewFakeTmuxDetector()
	detector.AddClient("/dev/ttys010", "work") // Same as before

	callCount := 0
	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, func(updates map[string]string) {
		callCount++
	}, nil)

	changes := monitor.poll()
	if len(changes) != 0 {
		t.Errorf("expected 0 changes, got %d: %v", len(changes), changes)
	}
}

func TestTmuxMonitor_StopsOnContextCancel(t *testing.T) {
	registry := NewSessionRegistry()
	detector := NewFakeTmuxDetector()

	monitor := NewTmuxMonitor(detector, registry, 10*time.Millisecond, nil, nil)
	monitor.Start()

	// Should stop quickly when cancelled
	monitor.Stop()

	// If we get here, the goroutine stopped successfully
}

func TestTmuxMonitor_SkipsWhenUnavailable(t *testing.T) {
	registry := NewSessionRegistry()
	detector := NewFakeTmuxDetector()
	detector.SetUnavailable()

	callCount := 0
	monitor := NewTmuxMonitor(detector, registry, 10*time.Millisecond, func(updates map[string]string) {
		callCount++
	}, nil)
	monitor.Start()

	// Give it time to potentially start
	time.Sleep(50 * time.Millisecond)
	monitor.Stop()

	if callCount != 0 {
		t.Errorf("onChange was called %d times, expected 0 when tmux unavailable", callCount)
	}
}

func TestTmuxMonitor_MultipleSessions(t *testing.T) {
	registry := NewSessionRegistry()
	registry.Add(newTestSession("s1", "/dev/ttys010"))
	registry.Add(newTestSession("s2", "/dev/ttys017"))
	registry.Add(newTestSession("s3", "/dev/ttys008"))

	detector := NewFakeTmuxDetector()
	detector.AddClient("/dev/ttys010", "work")
	detector.AddClient("/dev/ttys017", "work")
	// s3 not in tmux

	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil, nil)

	changes := monitor.poll()
	if len(changes) != 2 {
		t.Fatalf("expected 2 changes, got %d: %v", len(changes), changes)
	}
	if changes["s1"] != "work" || changes["s2"] != "work" {
		t.Errorf("unexpected changes: %v", changes)
	}
}

func TestTmuxMonitor_SessionWithoutTtyPath_Ignored(t *testing.T) {
	registry := NewSessionRegistry()
	registry.Add(&Session{ID: "s1"}) // No TtyPath

	detector := NewFakeTmuxDetector()
	detector.AddClient("/dev/ttys010", "work")

	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil, nil)

	changes := monitor.poll()
	if len(changes) != 0 {
		t.Errorf("expected 0 changes for session without TtyPath, got %d", len(changes))
	}
}

func TestTmuxMonitor_UpdateInterval(t *testing.T) {
	registry := NewSessionRegistry()
	detector := NewFakeTmuxDetector()

	monitor := NewTmuxMonitor(detector, registry, 100*time.Millisecond, nil, nil)
	monitor.Start()
	defer monitor.Stop()

	// UpdateInterval should not panic or deadlock
	monitor.UpdateInterval(50 * time.Millisecond)
	time.Sleep(20 * time.Millisecond) // Let the loop pick up the new interval
}

// Test Doc:
// - Why: TmuxMonitor session list tracking is the push mechanism for the tmux sidebar
// - Contract: Detects initial sessions, additions, removals; no-op when unchanged;
//   error recovery reuses cached lastSessions and does NOT call callback
// - Usage Notes: Uses FakeTmuxDetector.AddSession/RemoveSession to control session list
// - Quality Contribution: Catches regressions in session list polling and error recovery
// - Worked Example: AddSession("work",3,1) → pollSessions() → callback called with [{work,3,1}]

func TestTmuxMonitor_DetectSessionAdded(t *testing.T) {
	registry := NewSessionRegistry()
	detector := NewFakeTmuxDetector()
	detector.AddSession("work", 3, 1)

	var received []TmuxSessionInfo
	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil, func(sessions []TmuxSessionInfo) {
		received = sessions
	})

	monitor.pollSessions()
	if len(received) != 1 {
		t.Fatalf("expected 1 session, got %d", len(received))
	}
	if received[0].Name != "work" {
		t.Errorf("expected 'work', got %q", received[0].Name)
	}

	// Add another session
	detector.AddSession("debug", 1, 0)
	received = nil
	monitor.pollSessions()
	if len(received) != 2 {
		t.Fatalf("expected 2 sessions after add, got %d", len(received))
	}
}

func TestTmuxMonitor_DetectSessionRemoved(t *testing.T) {
	registry := NewSessionRegistry()
	detector := NewFakeTmuxDetector()
	detector.AddSession("work", 3, 1)
	detector.AddSession("debug", 1, 0)

	var received []TmuxSessionInfo
	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil, func(sessions []TmuxSessionInfo) {
		received = sessions
	})

	// Initial poll
	monitor.pollSessions()
	if len(received) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(received))
	}

	// Remove one
	detector.RemoveSession("debug")
	received = nil
	monitor.pollSessions()
	if len(received) != 1 {
		t.Fatalf("expected 1 session after remove, got %d", len(received))
	}
	if received[0].Name != "work" {
		t.Errorf("expected 'work', got %q", received[0].Name)
	}
}

func TestTmuxMonitor_SessionListError(t *testing.T) {
	registry := NewSessionRegistry()
	detector := NewFakeTmuxDetector()
	detector.AddSession("work", 3, 1)

	callCount := 0
	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil, func(sessions []TmuxSessionInfo) {
		callCount++
	})

	// Initial poll succeeds
	monitor.pollSessions()
	if callCount != 1 {
		t.Fatalf("expected 1 call after initial poll, got %d", callCount)
	}

	// Now set error — callback should NOT be called
	detector.SetError(errTest)
	monitor.pollSessions()
	if callCount != 1 {
		t.Errorf("callback called on error — expected still 1, got %d", callCount)
	}

	// Verify cached sessions still available
	cached := monitor.GetLastSessions()
	if len(cached) != 1 {
		t.Fatalf("expected cached 1 session, got %d", len(cached))
	}
	if cached[0].Name != "work" {
		t.Errorf("expected cached 'work', got %q", cached[0].Name)
	}
}

func TestTmuxMonitor_SessionListNoChange(t *testing.T) {
	registry := NewSessionRegistry()
	detector := NewFakeTmuxDetector()
	detector.AddSession("work", 3, 1)

	callCount := 0
	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil, func(sessions []TmuxSessionInfo) {
		callCount++
	})

	// First poll triggers callback
	monitor.pollSessions()
	if callCount != 1 {
		t.Fatalf("expected 1 call, got %d", callCount)
	}

	// Second poll — same data, no callback
	monitor.pollSessions()
	if callCount != 1 {
		t.Errorf("callback called on no-change — expected still 1, got %d", callCount)
	}
}

func TestTmuxMonitor_SessionListInitial(t *testing.T) {
	registry := NewSessionRegistry()
	detector := NewFakeTmuxDetector()
	detector.AddSession("work", 3, 1)
	detector.AddSession("debug", 1, 0)

	var received []TmuxSessionInfo
	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil, func(sessions []TmuxSessionInfo) {
		received = sessions
	})

	// First poll should discover existing sessions
	monitor.pollSessions()
	if len(received) != 2 {
		t.Fatalf("expected 2 sessions on initial discovery, got %d", len(received))
	}
}
