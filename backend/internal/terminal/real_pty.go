package terminal

import (
	"os"
	"os/exec"
	"syscall"

	"github.com/creack/pty"
)

// RealPTY wraps creack/pty for actual terminal functionality.
type RealPTY struct {
	ptmx *os.File
	cmd  *exec.Cmd

	// TtyPath is the device path of the secondary PTY (e.g., "/dev/ttys010" on macOS,
	// "/dev/pts/5" on Linux). Used by tmux monitor to match trex sessions to tmux clients.
	TtyPath string
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
// Uses pty.Open() to capture the TTY device path for tmux session tracking,
// then manually wires cmd streams and starts the process — replicating what
// pty.Start() does internally (see creack/pty start.go).
func NewRealPTYWithShell(shell string) (*RealPTY, error) {
	// Open PTY pair — ptmx is the primary, tty is the secondary
	ptmx, tty, err := pty.Open()
	if err != nil {
		return nil, err
	}

	// Capture the TTY device path before closing the secondary fd.
	// e.g., "/dev/ttys010" (macOS) or "/dev/pts/5" (Linux)
	ttyPath := tty.Name()

	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	// Wire the secondary TTY as the child process's stdin/stdout/stderr.
	// This replicates what pty.Start() does internally.
	cmd.Stdin = tty
	cmd.Stdout = tty
	cmd.Stderr = tty
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid:  true, // Create new session
		Setctty: true, // Set controlling terminal (uses stdin fd 0)
	}

	if err := cmd.Start(); err != nil {
		_ = ptmx.Close()
		_ = tty.Close()
		return nil, err
	}

	// Close the parent's copy of the secondary fd — the child inherits it.
	_ = tty.Close()

	return &RealPTY{
		ptmx:    ptmx,
		cmd:     cmd,
		TtyPath: ttyPath,
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
