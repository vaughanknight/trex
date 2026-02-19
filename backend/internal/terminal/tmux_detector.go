package terminal

import (
	"context"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// TmuxSessionInfo holds metadata about a single tmux session, as returned
// by `tmux list-sessions`.
type TmuxSessionInfo struct {
	Name     string `json:"name"`
	Windows  int    `json:"windows"`
	Attached int    `json:"attached"`
}

// TmuxDetector detects tmux sessions and clients on the system.
// Per Constitution v1.4.0, trex owns this integration directly as
// a composable internal library.
type TmuxDetector interface {
	// ListClients returns a map of ttyPath → tmux session name for all active
	// tmux clients. Returns an empty map when no clients are connected.
	ListClients() (map[string]string, error)

	// ListSessions returns metadata for all tmux sessions on the system.
	// Returns an empty slice (not error) when no tmux server is running.
	ListSessions() ([]TmuxSessionInfo, error)

	// IsAvailable returns true if tmux is installed and accessible.
	IsAvailable() bool
}

// RealTmuxDetector implements TmuxDetector using the tmux CLI.
// Per Constitution v1.4.0, trex owns this integration directly.
type RealTmuxDetector struct {
	// Timeout for each tmux command invocation.
	Timeout time.Duration
}

// NewRealTmuxDetector creates a detector with the given command timeout.
func NewRealTmuxDetector(timeout time.Duration) *RealTmuxDetector {
	return &RealTmuxDetector{Timeout: timeout}
}

// IsAvailable returns true if tmux is found on PATH.
func (d *RealTmuxDetector) IsAvailable() bool {
	_, err := exec.LookPath("tmux")
	return err == nil
}

// ListClients runs `tmux list-clients` and parses the output into a
// ttyPath → sessionName map.
func (d *RealTmuxDetector) ListClients() (map[string]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), d.Timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tmux", "list-clients", "-F", "#{client_tty}\t#{session_name}")
	output, err := cmd.Output()
	if err != nil {
		// tmux returns exit code 1 when no server is running — treat as empty
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 1 {
			return make(map[string]string), nil
		}
		return nil, err
	}

	return parseTmuxClients(string(output)), nil
}

// ListSessions runs `tmux list-sessions` and returns metadata for all sessions.
// Returns an empty slice (not error) when the tmux server is not running.
func (d *RealTmuxDetector) ListSessions() ([]TmuxSessionInfo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), d.Timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tmux", "list-sessions", "-F", "#{session_name}\t#{session_windows}\t#{session_attached}")
	output, err := cmd.Output()
	if err != nil {
		// tmux returns exit code 1 when no server is running — treat as empty
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 1 {
			return nil, nil
		}
		return nil, err
	}

	return parseTmuxSessions(string(output)), nil
}

// parseTmuxClients parses `tmux list-clients -F '#{client_tty}\t#{session_name}'`
// output into a ttyPath → sessionName map.
func parseTmuxClients(output string) map[string]string {
	result := make(map[string]string)
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 2)
		if len(parts) == 2 && parts[0] != "" && parts[1] != "" {
			result[parts[0]] = parts[1]
		}
	}
	return result
}

// parseTmuxSessions parses `tmux list-sessions -F '#{session_name}\t#{session_windows}\t#{session_attached}'`
// output into a TmuxSessionInfo slice. Malformed lines are skipped.
func parseTmuxSessions(output string) []TmuxSessionInfo {
	var result []TmuxSessionInfo
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) != 3 || parts[0] == "" {
			continue
		}
		windows, err := strconv.Atoi(parts[1])
		if err != nil {
			continue
		}
		attached, err := strconv.Atoi(parts[2])
		if err != nil {
			continue
		}
		result = append(result, TmuxSessionInfo{
			Name:     parts[0],
			Windows:  windows,
			Attached: attached,
		})
	}
	return result
}

// FakeTmuxDetector is a test double for TmuxDetector.
type FakeTmuxDetector struct {
	clients   map[string]string
	sessions  []TmuxSessionInfo
	available bool
	err       error
}

// NewFakeTmuxDetector creates an available fake with no clients.
func NewFakeTmuxDetector() *FakeTmuxDetector {
	return &FakeTmuxDetector{
		clients:   make(map[string]string),
		available: true,
	}
}

// IsAvailable returns the configured availability.
func (f *FakeTmuxDetector) IsAvailable() bool {
	return f.available
}

// ListClients returns the configured client map or error.
func (f *FakeTmuxDetector) ListClients() (map[string]string, error) {
	if f.err != nil {
		return nil, f.err
	}
	// Return a copy to prevent test mutation
	result := make(map[string]string, len(f.clients))
	for k, v := range f.clients {
		result[k] = v
	}
	return result, nil
}

// AddClient simulates a tmux client connecting on the given TTY path.
func (f *FakeTmuxDetector) AddClient(ttyPath, sessionName string) {
	f.clients[ttyPath] = sessionName
}

// RemoveClient simulates a tmux client disconnecting.
func (f *FakeTmuxDetector) RemoveClient(ttyPath string) {
	delete(f.clients, ttyPath)
}

// SetUnavailable makes the detector report tmux as not installed.
func (f *FakeTmuxDetector) SetUnavailable() {
	f.available = false
}

// SetError configures ListClients and ListSessions to return an error.
func (f *FakeTmuxDetector) SetError(err error) {
	f.err = err
}

// ListSessions returns the configured sessions or error.
// Returns a copy to prevent test mutation.
func (f *FakeTmuxDetector) ListSessions() ([]TmuxSessionInfo, error) {
	if f.err != nil {
		return nil, f.err
	}
	if len(f.sessions) == 0 {
		return nil, nil
	}
	result := make([]TmuxSessionInfo, len(f.sessions))
	copy(result, f.sessions)
	return result, nil
}

// AddSession adds a tmux session to the fake.
func (f *FakeTmuxDetector) AddSession(name string, windows, attached int) {
	f.sessions = append(f.sessions, TmuxSessionInfo{
		Name:     name,
		Windows:  windows,
		Attached: attached,
	})
}

// RemoveSession removes a tmux session by name from the fake.
func (f *FakeTmuxDetector) RemoveSession(name string) {
	for i, s := range f.sessions {
		if s.Name == name {
			f.sessions = append(f.sessions[:i], f.sessions[i+1:]...)
			return
		}
	}
}

// Verify interface compliance at compile time.
var (
	_ TmuxDetector = (*RealTmuxDetector)(nil)
	_ TmuxDetector = (*FakeTmuxDetector)(nil)
)
