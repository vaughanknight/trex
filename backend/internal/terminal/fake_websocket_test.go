package terminal

import (
	"errors"
	"testing"

	"github.com/gorilla/websocket"
)

// Test Doc:
// - Why: Verify FakeWebSocket correctly implements Conn interface for testing
// - Contract: FakeWebSocket queues messages for read, captures writes
// - Usage Notes: Use QueueMessage to add read data, GetWrittenMessages to verify writes
// - Quality Contribution: Ensures test double is reliable for session tests
// - Worked Example: QueueMessage(TextMessage, "hi") → ReadMessage returns "hi"

func TestFakeWebSocket_ReadWrite(t *testing.T) {
	fake := NewFakeWebSocket()

	// Queue a message to read
	fake.QueueMessage(websocket.TextMessage, []byte(`{"type":"input","data":"hello"}`))

	// Read the message
	msgType, data, err := fake.ReadMessage()
	if err != nil {
		t.Fatalf("ReadMessage error: %v", err)
	}
	if msgType != websocket.TextMessage {
		t.Errorf("messageType = %d, want %d", msgType, websocket.TextMessage)
	}
	if string(data) != `{"type":"input","data":"hello"}` {
		t.Errorf("data = %q, want %q", string(data), `{"type":"input","data":"hello"}`)
	}

	// Write a message
	err = fake.WriteMessage(websocket.BinaryMessage, []byte("output"))
	if err != nil {
		t.Fatalf("WriteMessage error: %v", err)
	}

	// Verify written message
	written := fake.GetWrittenMessages()
	if len(written) != 1 {
		t.Fatalf("GetWrittenMessages len = %d, want 1", len(written))
	}
	if written[0].MessageType != websocket.BinaryMessage {
		t.Errorf("written MessageType = %d, want %d", written[0].MessageType, websocket.BinaryMessage)
	}
	if string(written[0].Data) != "output" {
		t.Errorf("written Data = %q, want %q", string(written[0].Data), "output")
	}
}

func TestFakeWebSocket_MultipleMessages(t *testing.T) {
	fake := NewFakeWebSocket()

	// Queue multiple messages
	fake.QueueMessage(websocket.TextMessage, []byte("first"))
	fake.QueueMessage(websocket.TextMessage, []byte("second"))

	// Read first
	_, data1, _ := fake.ReadMessage()
	if string(data1) != "first" {
		t.Errorf("first message = %q, want %q", string(data1), "first")
	}

	// Read second
	_, data2, _ := fake.ReadMessage()
	if string(data2) != "second" {
		t.Errorf("second message = %q, want %q", string(data2), "second")
	}
}

func TestFakeWebSocket_Close(t *testing.T) {
	fake := NewFakeWebSocket()

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

func TestFakeWebSocket_ReadErrorWhenEmpty(t *testing.T) {
	fake := NewFakeWebSocket()
	testErr := errors.New("connection closed")
	fake.ReadErr = testErr

	_, _, err := fake.ReadMessage()
	if err != testErr {
		t.Errorf("ReadMessage error = %v, want %v", err, testErr)
	}
}

func TestFakeWebSocket_WriteError(t *testing.T) {
	fake := NewFakeWebSocket()
	testErr := errors.New("write failed")
	fake.WriteErr = testErr

	err := fake.WriteMessage(websocket.TextMessage, []byte("test"))
	if err != testErr {
		t.Errorf("WriteMessage error = %v, want %v", err, testErr)
	}
}

func TestFakeWebSocket_ImplementsInterface(t *testing.T) {
	var _ Conn = (*FakeWebSocket)(nil)
}
