package terminal

import (
	"os"
	"os/exec"

	"github.com/creack/pty"
)

// RealPTY wraps creack/pty for actual terminal functionality.
type RealPTY struct {
	ptmx *os.File
	cmd  *exec.Cmd
}

// NewRealPTY creates a new PTY running the user's shell.
// Uses $SHELL environment variable, falling back to /bin/bash.
func NewRealPTY() (*RealPTY, error) {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}

	return NewRealPTYWithShell(shell)
}

// NewRealPTYWithShell creates a new PTY running the specified shell.
func NewRealPTYWithShell(shell string) (*RealPTY, error) {
	cmd := exec.Command(shell)

	// Set environment for proper terminal behavior
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, err
	}

	return &RealPTY{
		ptmx: ptmx,
		cmd:  cmd,
	}, nil
}

// Read reads from the PTY (terminal output).
func (r *RealPTY) Read(p []byte) (n int, err error) {
	return r.ptmx.Read(p)
}

// Write writes to the PTY (terminal input).
func (r *RealPTY) Write(p []byte) (n int, err error) {
	return r.ptmx.Write(p)
}

// Resize changes the terminal dimensions.
func (r *RealPTY) Resize(cols, rows uint16) error {
	return pty.Setsize(r.ptmx, &pty.Winsize{
		Cols: cols,
		Rows: rows,
	})
}

// Close terminates the PTY and its associated process.
func (r *RealPTY) Close() error {
	// Close the PTY file descriptor first - this unblocks any pending reads
	if err := r.ptmx.Close(); err != nil {
		return err
	}

	// Kill the process to ensure it exits (SIGKILL for immediate termination)
	// This is safe to call even if process has already exited
	if r.cmd.Process != nil {
		_ = r.cmd.Process.Kill()
	}

	// Wait for the process to exit (don't check error - process may already be dead)
	_ = r.cmd.Wait()

	return nil
}

// Verify RealPTY implements PTY interface
var _ PTY = (*RealPTY)(nil)
