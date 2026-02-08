package server

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/vaughanknight/trex/internal/terminal"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	// Allow connections from any origin for development
	// In production, this should be restricted
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// connectionHandler manages a single WebSocket connection with multiple sessions.
type connectionHandler struct {
	conn     *websocket.Conn
	registry *terminal.SessionRegistry
	sessions map[string]*terminal.Session // sessions active on this connection
	mu       sync.Mutex                   // protects sessions map
	writeMu  sync.Mutex                   // protects WebSocket writes
}

// newConnectionHandler creates a handler for a WebSocket connection.
func newConnectionHandler(conn *websocket.Conn, registry *terminal.SessionRegistry) *connectionHandler {
	return &connectionHandler{
		conn:     conn,
		registry: registry,
		sessions: make(map[string]*terminal.Session),
	}
}

// handleTerminal handles WebSocket connections for terminal sessions.
func (s *Server) handleTerminal() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Upgrade HTTP connection to WebSocket
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}

		handler := newConnectionHandler(conn, s.registry)
		defer handler.cleanup()

		log.Printf("WebSocket connection established")
		handler.run()
		log.Printf("WebSocket connection closed")
	}
}

// run processes messages from the WebSocket connection.
func (h *connectionHandler) run() {
	for {
		_, data, err := h.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("WebSocket read error: %v", err)
			}
			return
		}

		var msg terminal.ClientMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("Invalid message format: %v", err)
			h.sendError("", "invalid message format")
			continue
		}

		h.handleMessage(&msg)
	}
}

// handleMessage processes a single client message.
func (h *connectionHandler) handleMessage(msg *terminal.ClientMessage) {
	switch msg.Type {
	case terminal.MsgTypeCreate:
		h.handleCreate()

	case terminal.MsgTypeClose:
		h.handleClose(msg)

	case terminal.MsgTypeInput:
		h.handleInput(msg)

	case terminal.MsgTypeResize:
		h.handleResize(msg)

	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}

// handleClose closes a specific terminal session.
func (h *connectionHandler) handleClose(msg *terminal.ClientMessage) {
	session := h.getSession(msg.SessionId)
	if session == nil {
		h.sendError(msg.SessionId, "session not found")
		return
	}

	log.Printf("Closing session %s", session.ID)

	// Remove from local map
	h.mu.Lock()
	delete(h.sessions, msg.SessionId)
	h.mu.Unlock()

	// Close session gracefully
	session.CloseGracefully()

	// Remove from registry
	h.registry.Delete(msg.SessionId)

	log.Printf("Session %s closed", msg.SessionId)
}

// handleCreate creates a new terminal session.
func (h *connectionHandler) handleCreate() {
	// Generate session ID
	sessionID := h.registry.NextID()

	// Create PTY
	pty, err := terminal.NewRealPTY()
	if err != nil {
		log.Printf("PTY creation error: %v", err)
		h.sendError("", "failed to create terminal")
		return
	}

	// Determine shell type from SHELL env var
	shellPath := os.Getenv("SHELL")
	if shellPath == "" {
		shellPath = "/bin/sh"
	}
	shellType := filepath.Base(shellPath)

	// Create session
	session := terminal.NewSessionWithConn(sessionID, pty, h)
	session.Name = shellType + "-" + sessionID[1:] // e.g., "bash-1" from "s1"
	session.ShellType = shellType
	session.Status = terminal.SessionStatusActive

	// Add to registry and local map
	h.registry.Add(session)
	h.mu.Lock()
	h.sessions[sessionID] = session
	h.mu.Unlock()

	// Start session goroutines for PTY → WebSocket
	go session.RunReadPTY()

	log.Printf("Created session %s (%s)", session.ID, session.Name)

	// Send session created response
	h.sendSessionCreated(sessionID, shellType, session.Name)
}

// handleInput forwards input to the appropriate session.
func (h *connectionHandler) handleInput(msg *terminal.ClientMessage) {
	session := h.getSession(msg.SessionId)
	if session == nil {
		h.sendError(msg.SessionId, "session not found")
		return
	}

	session.WriteInput(msg.Data)
}

// handleResize forwards resize to the appropriate session.
func (h *connectionHandler) handleResize(msg *terminal.ClientMessage) {
	session := h.getSession(msg.SessionId)
	if session == nil {
		// For backwards compatibility, try the first session if no sessionId
		if msg.SessionId == "" {
			h.mu.Lock()
			for _, s := range h.sessions {
				session = s
				break
			}
			h.mu.Unlock()
		}
		if session == nil {
			h.sendError(msg.SessionId, "session not found")
			return
		}
	}

	session.Resize(msg.Cols, msg.Rows)
}

// getSession retrieves a session by ID, checking both local map and registry.
func (h *connectionHandler) getSession(sessionID string) *terminal.Session {
	if sessionID == "" {
		return nil
	}

	h.mu.Lock()
	session, ok := h.sessions[sessionID]
	h.mu.Unlock()

	if ok {
		return session
	}

	// Also check registry (session might have been created by another connection)
	return h.registry.Get(sessionID)
}

// cleanup closes all sessions and the WebSocket connection.
func (h *connectionHandler) cleanup() {
	h.mu.Lock()
	sessions := make([]*terminal.Session, 0, len(h.sessions))
	for _, s := range h.sessions {
		sessions = append(sessions, s)
	}
	h.sessions = make(map[string]*terminal.Session)
	h.mu.Unlock()

	for _, session := range sessions {
		log.Printf("Cleaning up session %s", session.ID)
		session.CloseGracefully()
		h.registry.Delete(session.ID)
	}

	h.conn.Close()
}

// WriteMessage implements the terminal.Conn interface for sending messages.
// Thread-safe - uses writeMu to prevent concurrent writes.
func (h *connectionHandler) WriteMessage(messageType int, data []byte) error {
	h.writeMu.Lock()
	defer h.writeMu.Unlock()
	return h.conn.WriteMessage(messageType, data)
}

// ReadMessage is not used by connectionHandler (it reads directly in run()).
func (h *connectionHandler) ReadMessage() (int, []byte, error) {
	return h.conn.ReadMessage()
}

// Close closes the WebSocket connection.
func (h *connectionHandler) Close() error {
	return h.conn.Close()
}

// sendSessionCreated sends a session_created message.
func (h *connectionHandler) sendSessionCreated(sessionID, shellType, name string) {
	msg := terminal.ServerMessage{
		SessionId: sessionID,
		ShellType: shellType,
		Type:      terminal.MsgTypeSessionCreated,
		Data:      name,
	}
	h.sendJSON(msg)
}

// sendError sends an error message.
func (h *connectionHandler) sendError(sessionID, errMsg string) {
	msg := terminal.ServerMessage{
		SessionId: sessionID,
		Type:      terminal.MsgTypeError,
		Error:     errMsg,
	}
	h.sendJSON(msg)
}

// sendJSON sends a JSON message over the WebSocket.
// Thread-safe - uses writeMu to prevent concurrent writes.
func (h *connectionHandler) sendJSON(msg terminal.ServerMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal message: %v", err)
		return
	}
	h.writeMu.Lock()
	defer h.writeMu.Unlock()
	if err := h.conn.WriteMessage(websocket.TextMessage, data); err != nil {
		log.Printf("Failed to send message: %v", err)
	}
}
