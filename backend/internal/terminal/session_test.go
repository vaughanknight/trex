package terminal

import (
	"encoding/json"
	"io"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Test Doc:
// - Why: Verify Session correctly bridges PTY ↔ WebSocket with proper lifecycle
// - Contract: Session forwards input to PTY, output to WebSocket, handles resize
// - Usage Notes: Run in goroutine, call Stop() to terminate
// - Quality Contribution: Core integration test for terminal functionality
// - Worked Example: Client sends input "ls\n" → PTY receives "ls\n"

func TestSession_InputTowardsPTY(t *testing.T) {
	fakePTY := NewFakePTY()
	fakeWS := NewFakeWebSocket()

	// Queue an input message
	inputMsg := ClientMessage{Type: MsgTypeInput, Data: "ls\n"}
	msgBytes, _ := json.Marshal(inputMsg)
	fakeWS.QueueMessage(websocket.TextMessage, msgBytes)

	// Set read error to end the session after processing
	fakeWS.ReadErr = io.EOF
	fakePTY.ReadErr = io.EOF

	session := NewSession(fakePTY, fakeWS)

	// Run session in background
	done := make(chan struct{})
	go func() {
		session.Run()
		close(done)
	}()

	// Wait for session to process
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Session did not terminate")
	}

	// Verify input was written to PTY
	if got := fakePTY.GetInput(); got != "ls\n" {
		t.Errorf("PTY input = %q, want %q", got, "ls\n")
	}
}

func TestSession_OutputTowardsWebSocket(t *testing.T) {
	fakePTY := NewFakePTY()
	fakeWS := NewFakeWebSocket()

	// Simulate terminal output
	fakePTY.SimulateOutput("hello world")

	session := NewSession(fakePTY, fakeWS)

	// Run session in background
	done := make(chan struct{})
	go func() {
		session.Run()
		close(done)
	}()

	// Wait for output to be written (poll with timeout)
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		written := fakeWS.GetWrittenMessages()
		// Look for output message
		for _, w := range written {
			var msg ServerMessage
			if err := json.Unmarshal(w.Data, &msg); err == nil {
				if msg.Type == MsgTypeOutput && msg.Data == "hello world" {
					// Success! Stop session and return
					session.Stop()
					<-done
					return
				}
			}
		}
		time.Sleep(10 * time.Millisecond)
	}

	// Cleanup
	session.Stop()
	<-done

	t.Fatal("No output message written to WebSocket")
}

func TestSession_ResizeForwardsToPTY(t *testing.T) {
	fakePTY := NewFakePTY()
	fakeWS := NewFakeWebSocket()

	// Queue a resize message
	resizeMsg := ClientMessage{Type: MsgTypeResize, Cols: 120, Rows: 40}
	msgBytes, _ := json.Marshal(resizeMsg)
	fakeWS.QueueMessage(websocket.TextMessage, msgBytes)

	// Set read error to end the session after processing
	fakeWS.ReadErr = io.EOF
	fakePTY.ReadErr = io.EOF

	session := NewSession(fakePTY, fakeWS)

	// Run session in background
	done := make(chan struct{})
	go func() {
		session.Run()
		close(done)
	}()

	// Wait for session to process
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Session did not terminate")
	}

	// Verify resize was applied to PTY
	if fakePTY.LastResize.Cols != 120 {
		t.Errorf("PTY Cols = %d, want 120", fakePTY.LastResize.Cols)
	}
	if fakePTY.LastResize.Rows != 40 {
		t.Errorf("PTY Rows = %d, want 40", fakePTY.LastResize.Rows)
	}
}

func TestSession_StopCleanup(t *testing.T) {
	fakePTY := NewFakePTY()
	fakeWS := NewFakeWebSocket()

	session := NewSession(fakePTY, fakeWS)

	// Run session in background
	done := make(chan struct{})
	go func() {
		session.Run()
		close(done)
	}()

	// Give it a moment to start
	time.Sleep(10 * time.Millisecond)

	// Stop the session
	session.Stop()

	// Wait for session to terminate
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Session did not terminate after Stop()")
	}

	// Verify cleanup
	if !fakePTY.Closed {
		t.Error("PTY was not closed")
	}
	if !fakeWS.Closed {
		t.Error("WebSocket was not closed")
	}
}

func TestSession_InvalidMessageFormat(t *testing.T) {
	fakePTY := NewFakePTY()
	fakeWS := NewFakeWebSocket()

	// Queue invalid JSON
	fakeWS.QueueMessage(websocket.TextMessage, []byte("not json"))

	// Set read error to end the session
	fakeWS.ReadErr = io.EOF
	fakePTY.ReadErr = io.EOF

	session := NewSession(fakePTY, fakeWS)

	// Run session in background
	done := make(chan struct{})
	go func() {
		session.Run()
		close(done)
	}()

	// Wait for session to process
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Session did not terminate")
	}

	// Verify error was sent to client
	written := fakeWS.GetWrittenMessages()
	foundError := false
	for _, w := range written {
		var msg ServerMessage
		if err := json.Unmarshal(w.Data, &msg); err == nil {
			if msg.Type == MsgTypeError {
				foundError = true
				break
			}
		}
	}

	if !foundError {
		t.Error("Expected error message to be sent for invalid JSON")
	}
}
