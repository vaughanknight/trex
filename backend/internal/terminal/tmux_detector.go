package terminal

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

// TmuxDetector detects which tmux sessions are attached to which TTY devices.
// This interface isolates tmux CLI calls for future replacement with the tmax
// library per ADR-0001.
//
// NOTE: Direct tmux CLI call - to be replaced with tmax library per ADR-0001 when available.
type TmuxDetector interface {
	// ListClients returns a map of ttyPath → tmux session name for all active
	// tmux clients. Returns an empty map when no clients are connected.
	ListClients() (map[string]string, error)

	// IsAvailable returns true if tmux is installed and accessible.
	IsAvailable() bool
}

// RealTmuxDetector implements TmuxDetector using the tmux CLI.
//
// NOTE: Direct tmux CLI call - to be replaced with tmax library per ADR-0001 when available.
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

// FakeTmuxDetector is a test double for TmuxDetector.
type FakeTmuxDetector struct {
	clients   map[string]string
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

// SetError configures ListClients to return an error.
func (f *FakeTmuxDetector) SetError(err error) {
	f.err = err
}

// Verify interface compliance at compile time.
var (
	_ TmuxDetector = (*RealTmuxDetector)(nil)
	_ TmuxDetector = (*FakeTmuxDetector)(nil)
)
