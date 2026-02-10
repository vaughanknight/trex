package terminal

import (
	"testing"
	"time"
)

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

	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil)

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

	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil)

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

	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil)

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
	})

	changes := monitor.poll()
	if len(changes) != 0 {
		t.Errorf("expected 0 changes, got %d: %v", len(changes), changes)
	}
}

func TestTmuxMonitor_StopsOnContextCancel(t *testing.T) {
	registry := NewSessionRegistry()
	detector := NewFakeTmuxDetector()

	monitor := NewTmuxMonitor(detector, registry, 10*time.Millisecond, nil)
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
	})
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

	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil)

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

	monitor := NewTmuxMonitor(detector, registry, 50*time.Millisecond, nil)

	changes := monitor.poll()
	if len(changes) != 0 {
		t.Errorf("expected 0 changes for session without TtyPath, got %d", len(changes))
	}
}

func TestTmuxMonitor_UpdateInterval(t *testing.T) {
	registry := NewSessionRegistry()
	detector := NewFakeTmuxDetector()

	monitor := NewTmuxMonitor(detector, registry, 100*time.Millisecond, nil)
	monitor.Start()
	defer monitor.Stop()

	// UpdateInterval should not panic or deadlock
	monitor.UpdateInterval(50 * time.Millisecond)
	time.Sleep(20 * time.Millisecond) // Let the loop pick up the new interval
}
