package terminal

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// Session bridges a PTY and WebSocket connection.
type Session struct {
	pty  PTY
	conn Conn

	ctx    context.Context
	cancel context.CancelFunc

	wg sync.WaitGroup

	// writeMu protects concurrent WebSocket writes
	writeMu sync.Mutex
}

// NewSession creates a new terminal session bridging the given PTY and WebSocket.
func NewSession(pty PTY, conn Conn) *Session {
	ctx, cancel := context.WithCancel(context.Background())
	return &Session{
		pty:    pty,
		conn:   conn,
		ctx:    ctx,
		cancel: cancel,
	}
}

// Run starts the bidirectional I/O between PTY and WebSocket.
// This method blocks until the session ends.
func (s *Session) Run() {
	s.wg.Add(2)

	// PTY → WebSocket (output)
	go s.readPTY()

	// WebSocket → PTY (input)
	go s.readWebSocket()

	// Wait for both goroutines to finish
	s.wg.Wait()
}

// Stop terminates the session and cleans up resources.
func (s *Session) Stop() {
	s.cancel()
	s.pty.Close()
	s.conn.Close()
}

// readPTY reads from PTY and sends to WebSocket.
func (s *Session) readPTY() {
	defer s.wg.Done()
	defer s.cancel() // Signal other goroutine to stop

	buf := make([]byte, 4096)
	for {
		select {
		case <-s.ctx.Done():
			return
		default:
		}

		n, err := s.pty.Read(buf)
		if err != nil {
			if err != io.EOF {
				log.Printf("PTY read error: %v", err)
			}
			// Send exit message
			s.sendExitMessage(0)
			return
		}

		if n > 0 {
			msg := ServerMessage{
				Type: MsgTypeOutput,
				Data: string(buf[:n]),
			}
			if err := s.sendJSON(msg); err != nil {
				log.Printf("WebSocket write error: %v", err)
				return
			}
		}
	}
}

// readWebSocket reads from WebSocket and sends to PTY.
func (s *Session) readWebSocket() {
	defer s.wg.Done()
	defer s.cancel() // Signal other goroutine to stop

	for {
		select {
		case <-s.ctx.Done():
			return
		default:
		}

		_, data, err := s.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("WebSocket read error: %v", err)
			}
			return
		}

		var msg ClientMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("Invalid message format: %v", err)
			s.sendError("invalid message format")
			continue
		}

		switch msg.Type {
		case MsgTypeInput:
			if _, err := s.pty.Write([]byte(msg.Data)); err != nil {
				log.Printf("PTY write error: %v", err)
				s.sendError("failed to write to terminal")
			}

		case MsgTypeResize:
			if err := s.pty.Resize(msg.Cols, msg.Rows); err != nil {
				log.Printf("PTY resize error: %v", err)
				s.sendError("failed to resize terminal")
			}

		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}
}

// sendJSON sends a JSON-encoded message to the WebSocket.
func (s *Session) sendJSON(msg ServerMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	return s.conn.WriteMessage(websocket.TextMessage, data)
}

// sendError sends an error message to the client.
func (s *Session) sendError(errMsg string) {
	msg := ServerMessage{
		Type:  MsgTypeError,
		Error: errMsg,
	}
	if err := s.sendJSON(msg); err != nil {
		log.Printf("Failed to send error message: %v", err)
	}
}

// sendExitMessage sends an exit message to the client.
func (s *Session) sendExitMessage(code int) {
	msg := ServerMessage{
		Type: MsgTypeExit,
		Code: code,
	}
	if err := s.sendJSON(msg); err != nil {
		log.Printf("Failed to send exit message: %v", err)
	}
}
