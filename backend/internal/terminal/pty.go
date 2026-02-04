// Package terminal provides PTY management and WebSocket bridging for terminal sessions.
package terminal

import "io"

// PTY represents a pseudo-terminal interface.
// This abstraction enables testing with FakePTY.
type PTY interface {
	// Read reads data from the PTY (terminal output).
	io.Reader

	// Write writes data to the PTY (terminal input).
	io.Writer

	// Resize changes the terminal dimensions.
	Resize(cols, rows uint16) error

	// Close terminates the PTY and its associated process.
	Close() error
}
