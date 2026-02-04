package terminal

import (
	"io"
	"sync"
	"time"
)

// FakeWebSocket is a test double for WebSocket connections.
type FakeWebSocket struct {
	mu sync.Mutex

	// ReadMessages is a queue of messages to return from ReadMessage
	ReadMessages []FakeMessage

	// WrittenMessages captures all messages sent via WriteMessage
	WrittenMessages []FakeMessage

	// Closed tracks whether Close was called
	Closed bool

	// ReadErr can be set to simulate read errors (returned when queue is empty)
	ReadErr error

	// WriteErr can be set to simulate write errors
	WriteErr error

	// CloseErr can be set to simulate close errors
	CloseErr error

	// readIndex tracks position in ReadMessages
	readIndex int
}

// FakeMessage represents a WebSocket message for testing.
type FakeMessage struct {
	MessageType int
	Data        []byte
}

// NewFakeWebSocket creates a new FakeWebSocket for testing.
func NewFakeWebSocket() *FakeWebSocket {
	return &FakeWebSocket{
		ReadMessages:    make([]FakeMessage, 0),
		WrittenMessages: make([]FakeMessage, 0),
	}
}

// ReadMessage returns the next message from the queue.
// Blocks with polling if queue is empty and no error is set.
func (f *FakeWebSocket) ReadMessage() (messageType int, p []byte, err error) {
	deadline := time.Now().Add(100 * time.Millisecond)

	for {
		f.mu.Lock()
		if f.readIndex < len(f.ReadMessages) {
			msg := f.ReadMessages[f.readIndex]
			f.readIndex++
			f.mu.Unlock()
			return msg.MessageType, msg.Data, nil
		}

		if f.ReadErr != nil {
			err := f.ReadErr
			f.mu.Unlock()
			return 0, nil, err
		}

		if f.Closed {
			f.mu.Unlock()
			return 0, nil, io.EOF
		}

		f.mu.Unlock()

		// Wait briefly and check again
		if time.Now().After(deadline) {
			return 0, nil, io.EOF // Timeout as EOF
		}
		time.Sleep(time.Millisecond)
	}
}

// WriteMessage captures the message for later assertion.
func (f *FakeWebSocket) WriteMessage(messageType int, data []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.WriteErr != nil {
		return f.WriteErr
	}

	// Make a copy of data to avoid slice reuse issues
	dataCopy := make([]byte, len(data))
	copy(dataCopy, data)

	f.WrittenMessages = append(f.WrittenMessages, FakeMessage{
		MessageType: messageType,
		Data:        dataCopy,
	})
	return nil
}

// Close marks the connection as closed.
func (f *FakeWebSocket) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.CloseErr != nil {
		return f.CloseErr
	}

	f.Closed = true
	return nil
}

// QueueMessage adds a message to be returned by ReadMessage.
func (f *FakeWebSocket) QueueMessage(messageType int, data []byte) {
	f.mu.Lock()
	defer f.mu.Unlock()

	dataCopy := make([]byte, len(data))
	copy(dataCopy, data)

	f.ReadMessages = append(f.ReadMessages, FakeMessage{
		MessageType: messageType,
		Data:        dataCopy,
	})
}

// GetWrittenMessages returns all messages sent via WriteMessage.
func (f *FakeWebSocket) GetWrittenMessages() []FakeMessage {
	f.mu.Lock()
	defer f.mu.Unlock()

	result := make([]FakeMessage, len(f.WrittenMessages))
	copy(result, f.WrittenMessages)
	return result
}

// Verify FakeWebSocket implements Conn interface
var _ Conn = (*FakeWebSocket)(nil)
