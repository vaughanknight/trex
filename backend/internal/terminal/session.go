package terminal

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// SessionState represents the lifecycle state of a session.
// Uses int32 for atomic operations.
type SessionState int32

const (
	// SessionStateRunning is the initial state when session is active.
	SessionStateRunning SessionState = iota
	// SessionStateClosing is transitional state during graceful shutdown.
	SessionStateClosing
	// SessionStateClosed is terminal state after cleanup complete.
	SessionStateClosed
)

// Session bridges a PTY and WebSocket connection.
type Session struct {
	// Metadata fields for multi-session management
	ID        string        // Unique session identifier (e.g., "s1", "s2")
	Name      string        // Display name (e.g., "bash-1", "zsh-2")
	ShellType string        // Shell type (e.g., "bash", "zsh")
	Status    SessionStatus // Lifecycle status
	CreatedAt time.Time     // When session was created
	Owner     string        // GitHub username of session creator (empty when auth disabled)

	pty  PTY
	conn Conn

	ctx    context.Context
	cancel context.CancelFunc

	wg sync.WaitGroup

	// writeMu protects concurrent WebSocket writes
	writeMu sync.Mutex

	// state tracks the session lifecycle atomically
	state atomic.Int32
}

// NewSession creates a new terminal session bridging the given PTY and WebSocket.
func NewSession(pty PTY, conn Conn) *Session {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Session{
		pty:       pty,
		conn:      conn,
		ctx:       ctx,
		cancel:    cancel,
		CreatedAt: time.Now(),
	}
	s.initState()
	return s
}

// NewSessionWithConn creates a new session with specified ID and connection.
// The connection is used for sending output messages.
func NewSessionWithConn(id string, pty PTY, conn Conn) *Session {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Session{
		ID:        id,
		pty:       pty,
		conn:      conn,
		ctx:       ctx,
		cancel:    cancel,
		CreatedAt: time.Now(),
	}
	s.initState()
	return s
}

// initState initializes the session state to Running.
// Called automatically by NewSession.
func (s *Session) initState() {
	s.state.Store(int32(SessionStateRunning))
}

// State returns the current session state.
func (s *Session) State() SessionState {
	return SessionState(s.state.Load())
}

// IsRunning returns true if the session is in the Running state.
func (s *Session) IsRunning() bool {
	return s.State() == SessionStateRunning
}

// transitionTo atomically transitions to a new state if moving forward.
// State can only move forward: Running → Closing → Closed.
// Returns true if the transition occurred, false if blocked.
func (s *Session) transitionTo(newState SessionState) bool {
	for {
		current := s.state.Load()
		// Can only move forward in state machine
		if SessionState(current) >= newState {
			return false
		}
		if s.state.CompareAndSwap(current, int32(newState)) {
			return true
		}
		// CAS failed, retry
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
// Deprecated: Use CloseGracefully() for safe multi-session shutdown.
func (s *Session) Stop() {
	s.cancel()
	s.pty.Close()
	s.conn.Close()
}

// CloseGracefully safely shuts down the session using the state machine.
// This method is idempotent and safe to call from multiple goroutines.
// It transitions through Closing → Closed states atomically.
func (s *Session) CloseGracefully() {
	// Try to transition to Closing first
	if !s.transitionTo(SessionStateClosing) {
		// Already closing or closed, nothing to do
		return
	}

	// Cancel context to signal goroutines to stop
	s.cancel()

	// Close resources
	s.pty.Close()
	// Note: Don't close conn here as it may be shared (multi-session)

	// Transition to fully Closed
	s.transitionTo(SessionStateClosed)
}

// WriteInput writes data to the PTY (terminal input).
func (s *Session) WriteInput(data string) {
	if !s.IsRunning() {
		return
	}
	if _, err := s.pty.Write([]byte(data)); err != nil {
		log.Printf("PTY write error for session %s: %v", s.ID, err)
	}
}

// Resize changes the terminal dimensions.
func (s *Session) Resize(cols, rows uint16) {
	if !s.IsRunning() {
		return
	}
	if err := s.pty.Resize(cols, rows); err != nil {
		log.Printf("PTY resize error for session %s: %v", s.ID, err)
	}
}

// RunReadPTY reads from PTY and sends to WebSocket with sessionId.
// This is used in multi-session mode where the WebSocket is shared.
func (s *Session) RunReadPTY() {
	buf := make([]byte, 4096)
	for {
		select {
		case <-s.ctx.Done():
			return
		default:
		}

		n, err := s.pty.Read(buf)
		if err != nil {
			if err != io.EOF && s.IsRunning() {
				log.Printf("PTY read error for session %s: %v", s.ID, err)
			}
			// Send exit message
			s.sendExitMessageWithSession(0)
			return
		}

		if n > 0 {
			msg := ServerMessage{
				SessionId: s.ID,
				ShellType: s.ShellType,
				Type:      MsgTypeOutput,
				Data:      string(buf[:n]),
			}
			if err := s.sendJSON(msg); err != nil {
				log.Printf("WebSocket write error for session %s: %v", s.ID, err)
				return
			}
		}
	}
}

// sendExitMessageWithSession sends an exit message with session ID.
func (s *Session) sendExitMessageWithSession(code int) {
	msg := ServerMessage{
		SessionId: s.ID,
		Type:      MsgTypeExit,
		Code:      code,
	}
	if err := s.sendJSON(msg); err != nil {
		log.Printf("Failed to send exit message for session %s: %v", s.ID, err)
	}
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
