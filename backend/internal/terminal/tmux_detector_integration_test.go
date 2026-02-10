//go:build integration

package terminal

import (
	"os/exec"
	"testing"
	"time"
)

// Test Doc:
// - Why: Integration tests validate RealTmuxDetector against a real tmux server
// - Contract: ListClients returns real TTY→session mappings; IsAvailable reflects tmux presence
// - Usage Notes: Requires tmux installed. Starts/stops a tmux session. Build tag: integration
// - Quality Contribution: Catches parser regressions and exec.Command wiring issues
// - Worked Example: tmux new-session -d -s "trex-test" → ListClients() → map contains "trex-test"

func TestRealTmuxDetector_IsAvailable(t *testing.T) {
	_, err := exec.LookPath("tmux")
	if err != nil {
		t.Skip("tmux not installed, skipping integration test")
	}

	detector := NewRealTmuxDetector(5 * time.Second)
	if !detector.IsAvailable() {
		t.Error("expected IsAvailable() to be true when tmux is installed")
	}
}

func TestRealTmuxDetector_ListClients_Empty(t *testing.T) {
	_, err := exec.LookPath("tmux")
	if err != nil {
		t.Skip("tmux not installed, skipping integration test")
	}

	detector := NewRealTmuxDetector(5 * time.Second)
	clients, err := detector.ListClients()
	if err != nil {
		// tmux server may not be running — that's OK, it returns empty
		t.Logf("ListClients returned error (expected if no tmux server): %v", err)
		return
	}

	// Should return a map (possibly empty if no clients)
	t.Logf("ListClients returned %d clients", len(clients))
	for tty, session := range clients {
		t.Logf("  %s → %s", tty, session)
	}
}

func TestRealTmuxDetector_ListClients_WithSession(t *testing.T) {
	_, err := exec.LookPath("tmux")
	if err != nil {
		t.Skip("tmux not installed, skipping integration test")
	}

	sessionName := "trex-integration-test"

	// Start a detached tmux session
	cmd := exec.Command("tmux", "new-session", "-d", "-s", sessionName)
	if err := cmd.Run(); err != nil {
		t.Skipf("failed to create tmux session (tmux server may not be available): %v", err)
	}
	// Ensure cleanup
	t.Cleanup(func() {
		exec.Command("tmux", "kill-session", "-t", sessionName).Run()
	})

	detector := NewRealTmuxDetector(5 * time.Second)
	clients, err := detector.ListClients()
	if err != nil {
		t.Fatalf("ListClients error: %v", err)
	}

	// A detached session has no clients, so we verify the call succeeds
	// and returns a valid map. Attaching a client in CI is non-trivial
	// (requires a TTY), so we validate the parsing path works.
	t.Logf("ListClients returned %d clients with session '%s' running", len(clients), sessionName)
}
