package terminal

import (
	"bytes"
	"errors"
	"sync"
	"time"
)

// FakePTY is a test double for PTY that captures writes and emits canned responses.
type FakePTY struct {
	mu sync.Mutex

	// SimulatedTtyPath is the fake TTY device path for tmux monitor tests.
	// Set this before registering the session to simulate a real PTY device path.
	SimulatedTtyPath string

	// OutputBuffer contains data to be read (simulated terminal output)
	OutputBuffer *bytes.Buffer

	// InputBuffer captures data written to the PTY (simulated terminal input)
	InputBuffer *bytes.Buffer

	// LastResize records the most recent resize dimensions
	LastResize struct {
		Cols uint16
		Rows uint16
	}

	// Closed tracks whether Close was called
	Closed bool

	// ReadErr can be set to simulate read errors
	ReadErr error

	// WriteErr can be set to simulate write errors
	WriteErr error

	// ResizeErr can be set to simulate resize errors
	ResizeErr error

	// CloseErr can be set to simulate close errors
	CloseErr error

	// outputCond signals when output is available
	outputCond *sync.Cond
}

// NewFakePTY creates a new FakePTY for testing.
func NewFakePTY() *FakePTY {
	f := &FakePTY{
		OutputBuffer: &bytes.Buffer{},
		InputBuffer:  &bytes.Buffer{},
	}
	f.outputCond = sync.NewCond(&f.mu)
	return f
}

// Read reads from the output buffer (terminal output).
// Blocks if buffer is empty until data is available or ReadErr is set.
func (f *FakePTY) Read(p []byte) (n int, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	// Wait for data or error (with timeout to prevent deadlock in tests)
	deadline := time.Now().Add(100 * time.Millisecond)
	for f.OutputBuffer.Len() == 0 && f.ReadErr == nil && time.Now().Before(deadline) {
		// Brief unlock to allow other goroutines to add data
		f.mu.Unlock()
		time.Sleep(time.Millisecond)
		f.mu.Lock()
	}

	if f.ReadErr != nil {
		return 0, f.ReadErr
	}

	if f.OutputBuffer.Len() == 0 {
		// Timeout with no data - return 0, nil (non-blocking empty read)
		return 0, nil
	}

	return f.OutputBuffer.Read(p)
}

// Write captures data written to the PTY (terminal input).
func (f *FakePTY) Write(p []byte) (n int, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.WriteErr != nil {
		return 0, f.WriteErr
	}
	return f.InputBuffer.Write(p)
}

// Resize records the resize dimensions.
func (f *FakePTY) Resize(cols, rows uint16) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.ResizeErr != nil {
		return f.ResizeErr
	}

	f.LastResize.Cols = cols
	f.LastResize.Rows = rows
	return nil
}

// Close marks the PTY as closed.
func (f *FakePTY) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.CloseErr != nil {
		return f.CloseErr
	}

	f.Closed = true
	return nil
}

// SimulateOutput adds data to the output buffer for reading.
func (f *FakePTY) SimulateOutput(data string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.OutputBuffer.WriteString(data)
}

// GetInput returns all data written to the PTY.
func (f *FakePTY) GetInput() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.InputBuffer.String()
}

// Verify FakePTY implements PTY interface
var _ PTY = (*FakePTY)(nil)

// ErrPTYClosed is returned when operations are attempted on a closed PTY.
var ErrPTYClosed = errors.New("pty is closed")
