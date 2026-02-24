package terminal

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"

	"github.com/creack/pty"
)

// FilterTmuxEnv strips all environment variables whose key starts with "TMUX".
// Used for tmux-attach sessions to prevent "sessions should be nested with care" errors.
// Only the key part (before '=') is checked — values containing "TMUX" are preserved.
func FilterTmuxEnv(env []string) []string {
	var result []string
	for _, e := range env {
		key, _, _ := strings.Cut(e, "=")
		if !strings.HasPrefix(key, "TMUX") {
			result = append(result, e)
		}
	}
	return result
}

// RealPTY wraps creack/pty for actual terminal functionality.
type RealPTY struct {
	ptmx *os.File
	tty  *os.File   // secondary PTY fd; non-nil until StartShell() or Close()
	cmd  *exec.Cmd

	// TtyPath is the device path of the secondary PTY (e.g., "/dev/ttys010" on macOS,
	// "/dev/pts/5" on Linux). Used by tmux monitor to match trex sessions to tmux clients.
	TtyPath string
}

// NewRealPTY creates a new PTY running the user's shell at default size.
// Uses $SHELL environment variable, falling back to /bin/bash.
func NewRealPTY() (*RealPTY, error) {
	return NewRealPTYWithSize(0, 0)
}

// NewRealPTYWithSize creates a new PTY running the user's shell at the given size.
// Pass 0,0 to use the default (80x24).
func NewRealPTYWithSize(cols, rows uint16) (*RealPTY, error) {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}

	return NewRealPTYWithShell(shell, cols, rows)
}

// NewRealPTYWithShell creates a new PTY running the specified shell.
// Uses pty.Open() to capture the TTY device path for tmux session tracking,
// then manually wires cmd streams and starts the process — replicating what
// pty.Start() does internally (see creack/pty start.go).
//
// initialCols/initialRows set the PTY size BEFORE the shell starts.
// Pass 0,0 to use the default (80x24).
func NewRealPTYWithShell(shell string, initialCols, initialRows uint16) (*RealPTY, error) {
	// Open PTY pair — ptmx is the primary, tty is the secondary
	ptmx, tty, err := pty.Open()
	if err != nil {
		return nil, err
	}

	// Set PTY size BEFORE starting the shell so the shell's initial prompt
	// is drawn at the correct dimensions. Without this, the shell outputs
	// at the OS default size, which may differ from the actual terminal —
	// causing doubled/wrapped prompt text after the client sends a resize.
	cols := initialCols
	rows := initialRows
	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}
	_ = pty.Setsize(ptmx, &pty.Winsize{Cols: cols, Rows: rows})

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
		tty:     nil, // shell already started, tty closed
		cmd:     cmd,
		TtyPath: ttyPath,
	}, nil
}

// NewUnstartedPTY creates a PTY pair without starting a shell process.
// The shell is started later by calling StartShell() — typically after the
// frontend sends the first resize with the actual terminal dimensions.
// This prevents the doubled-prompt bug: the shell's first output is always
// at the correct size because the PTY is resized before the shell starts.
//
// Read() blocks until the shell starts and produces output.
// Resize() works immediately (sets kernel PTY size before shell reads it).
func NewUnstartedPTY() (*RealPTY, error) {
	ptmx, tty, err := pty.Open()
	if err != nil {
		return nil, err
	}

	// Default size — will be overwritten by Resize() before StartShell()
	_ = pty.Setsize(ptmx, &pty.Winsize{Cols: 80, Rows: 24})

	return &RealPTY{
		ptmx:    ptmx,
		tty:     tty,
		TtyPath: tty.Name(),
	}, nil
}

// StartShell launches the specified shell in this PTY.
// The PTY should be Resize()d to the correct dimensions first.
// Must be called at most once. After calling, tty is closed in the parent
// (the child process inherits it).
func (r *RealPTY) StartShell(shell string) error {
	return r.StartShellInDir(shell, "")
}

// StartShellInDir starts a login shell in the specified working directory.
// If dir is empty, starts in the default directory (user's home).
func (r *RealPTY) StartShellInDir(shell string, dir string) error {
	if r.tty == nil {
		return fmt.Errorf("PTY already started or closed")
	}

	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	if dir != "" {
		// Validate directory exists before using it
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			cmd.Dir = dir
		}
		// If dir doesn't exist, fall back to default (no cmd.Dir set)
	}

	cmd.Stdin = r.tty
	cmd.Stdout = r.tty
	cmd.Stderr = r.tty
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid:  true,
		Setctty: true,
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	// Close parent's copy of tty — child inherits it
	_ = r.tty.Close()
	r.tty = nil
	r.cmd = cmd
	return nil
}

// StartCommand launches a command with args and custom env in this PTY.
// Like StartShell, the PTY should be Resize()d to the correct dimensions first.
// Must be called at most once (mutually exclusive with StartShell).
func (r *RealPTY) StartCommand(name string, args []string, env []string) error {
	if r.tty == nil {
		return fmt.Errorf("PTY already started or closed")
	}

	cmd := exec.Command(name, args...)
	cmd.Env = env

	cmd.Stdin = r.tty
	cmd.Stdout = r.tty
	cmd.Stderr = r.tty
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid:  true,
		Setctty: true,
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	// Close parent's copy of tty — child inherits it
	_ = r.tty.Close()
	r.tty = nil
	r.cmd = cmd
	return nil
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

	// Close tty if shell was never started (StartShell sets tty to nil)
	if r.tty != nil {
		_ = r.tty.Close()
		r.tty = nil
	}

	// Kill and wait for process (if shell was started)
	if r.cmd != nil && r.cmd.Process != nil {
		_ = r.cmd.Process.Kill()
		_ = r.cmd.Wait()
	}

	return nil
}

// Verify RealPTY implements PTY interface
var _ PTY = (*RealPTY)(nil)

// GetPid returns the PID of the running process, or 0 if not started.
func (r *RealPTY) GetPid() int {
	if r.cmd != nil && r.cmd.Process != nil {
		return r.cmd.Process.Pid
	}
	return 0
}
