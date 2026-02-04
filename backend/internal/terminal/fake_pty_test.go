package terminal

import (
	"errors"
	"io"
	"testing"
)

// Test Doc:
// - Why: Verify FakePTY correctly implements PTY interface for testing
// - Contract: FakePTY captures writes, emits configured output, records resize
// - Usage Notes: Use SimulateOutput to add data, GetInput to read captured input
// - Quality Contribution: Ensures test double is reliable for session tests
// - Worked Example: SimulateOutput("hello") → Read returns "hello"

func TestFakePTY_ReadWrite(t *testing.T) {
	fake := NewFakePTY()

	// Write input
	n, err := fake.Write([]byte("hello"))
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	if n != 5 {
		t.Errorf("Write returned %d, want 5", n)
	}

	// Verify input was captured
	if got := fake.GetInput(); got != "hello" {
		t.Errorf("GetInput() = %q, want %q", got, "hello")
	}

	// Simulate output
	fake.SimulateOutput("world")

	// Read output
	buf := make([]byte, 10)
	n, err = fake.Read(buf)
	if err != nil {
		t.Fatalf("Read error: %v", err)
	}
	if string(buf[:n]) != "world" {
		t.Errorf("Read returned %q, want %q", string(buf[:n]), "world")
	}
}

func TestFakePTY_Resize(t *testing.T) {
	fake := NewFakePTY()

	err := fake.Resize(80, 24)
	if err != nil {
		t.Fatalf("Resize error: %v", err)
	}

	if fake.LastResize.Cols != 80 {
		t.Errorf("LastResize.Cols = %d, want 80", fake.LastResize.Cols)
	}
	if fake.LastResize.Rows != 24 {
		t.Errorf("LastResize.Rows = %d, want 24", fake.LastResize.Rows)
	}
}

func TestFakePTY_Close(t *testing.T) {
	fake := NewFakePTY()

	if fake.Closed {
		t.Error("Closed should be false initially")
	}

	err := fake.Close()
	if err != nil {
		t.Fatalf("Close error: %v", err)
	}

	if !fake.Closed {
		t.Error("Closed should be true after Close()")
	}
}

func TestFakePTY_ReadError(t *testing.T) {
	fake := NewFakePTY()
	fake.ReadErr = io.EOF

	_, err := fake.Read(make([]byte, 10))
	if err != io.EOF {
		t.Errorf("Read error = %v, want io.EOF", err)
	}
}

func TestFakePTY_WriteError(t *testing.T) {
	fake := NewFakePTY()
	testErr := errors.New("write failed")
	fake.WriteErr = testErr

	_, err := fake.Write([]byte("test"))
	if err != testErr {
		t.Errorf("Write error = %v, want %v", err, testErr)
	}
}

func TestFakePTY_ResizeError(t *testing.T) {
	fake := NewFakePTY()
	testErr := errors.New("resize failed")
	fake.ResizeErr = testErr

	err := fake.Resize(80, 24)
	if err != testErr {
		t.Errorf("Resize error = %v, want %v", err, testErr)
	}
}

func TestFakePTY_ImplementsInterface(t *testing.T) {
	var _ PTY = (*FakePTY)(nil)
}
