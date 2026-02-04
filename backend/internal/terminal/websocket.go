package terminal

// Conn represents a WebSocket connection interface.
// This abstraction enables testing with FakeWebSocket.
type Conn interface {
	// ReadMessage reads a message from the WebSocket.
	// Returns messageType, payload, and error.
	ReadMessage() (messageType int, p []byte, err error)

	// WriteMessage writes a message to the WebSocket.
	WriteMessage(messageType int, data []byte) error

	// Close closes the WebSocket connection.
	Close() error
}
