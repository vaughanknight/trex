package server

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/vaughanknight/trex/internal/auth"
	"github.com/vaughanknight/trex/internal/terminal"
)

// pendingShellStart tracks a session whose shell hasn't started yet.
// The shell is deferred until the first resize arrives from the frontend,
// so the PTY is sized correctly before the shell outputs its first prompt.
type pendingShellStart struct {
	realPTY   *terminal.RealPTY
	shellPath string
	started   atomic.Bool
}

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
	conn          *websocket.Conn
	registry      *terminal.SessionRegistry
	server        *Server                            // back-reference for monitor control
	sessions      map[string]*terminal.Session       // sessions active on this connection
	pendingStarts map[string]*pendingShellStart       // sessions waiting for first resize to start shell
	mu            sync.Mutex                          // protects sessions and pendingStarts maps
	writeMu       sync.Mutex                          // protects WebSocket writes
	authUser      *auth.GitHubUser                   // authenticated user (nil when auth disabled)
}

// newConnectionHandler creates a handler for a WebSocket connection.
func newConnectionHandler(conn *websocket.Conn, registry *terminal.SessionRegistry, server *Server) *connectionHandler {
	return &connectionHandler{
		conn:          conn,
		registry:      registry,
		server:        server,
		sessions:      make(map[string]*terminal.Session),
		pendingStarts: make(map[string]*pendingShellStart),
	}
}

// handleTerminal handles WebSocket connections for terminal sessions.
func (s *Server) handleTerminal() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract authenticated user from context (set by auth middleware).
		// Will be nil when auth is disabled.
		user := auth.UserFromContext(r.Context())

		// Upgrade HTTP connection to WebSocket
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}

		handler := newConnectionHandler(conn, s.registry, s)
		handler.authUser = user
		defer handler.cleanup()

		if user != nil {
			log.Printf("WebSocket connection established (user: %s)", user.Username)
		} else {
			log.Printf("WebSocket connection established")
		}
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
		h.handleCreate(msg)

	case terminal.MsgTypeClose:
		h.handleClose(msg)

	case terminal.MsgTypeInput:
		h.handleInput(msg)

	case terminal.MsgTypeResize:
		h.handleResize(msg)

	case terminal.MsgTypeTmuxConfig:
		h.handleTmuxConfig(msg)

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

	// Remove from local map and pending starts
	h.mu.Lock()
	delete(h.sessions, msg.SessionId)
	delete(h.pendingStarts, msg.SessionId)
	h.mu.Unlock()

	// Close session gracefully
	session.CloseGracefully()

	// Remove from registry
	h.registry.Delete(msg.SessionId)

	log.Printf("Session %s closed", msg.SessionId)
}

// handleCreate creates a new terminal session with deferred shell start.
//
// The PTY pair is created immediately but the shell process is NOT started
// until the frontend sends the first resize message with the actual terminal
// dimensions. This prevents the doubled-prompt bug: the shell's first output
// is always at the correct size because the PTY is resized before startup.
//
// A fallback timer starts the shell after 5 seconds if no resize arrives
// (handles edge cases where the frontend fails to send a resize).
func (h *connectionHandler) handleCreate(msg *terminal.ClientMessage) {
	// Generate session ID
	sessionID := h.registry.NextID()

	// Create PTY pair WITHOUT starting the shell.
	// Read() on this PTY blocks until the shell starts and writes output.
	realPTY, err := terminal.NewUnstartedPTY()
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

	// Create session (PTY satisfies the PTY interface via Read/Write/Resize/Close)
	session := terminal.NewSessionWithConn(sessionID, realPTY, h)
	session.Name = shellType + "-" + sessionID[1:] // e.g., "bash-1" from "s1"
	session.ShellType = shellType
	session.Status = terminal.SessionStatusActive
	session.TtyPath = realPTY.TtyPath
	if h.authUser != nil {
		session.Owner = h.authUser.Username
	}

	// Track pending shell start
	ps := &pendingShellStart{
		realPTY:   realPTY,
		shellPath: shellPath,
	}

	// Add to registry, local map, and pending starts
	h.registry.Add(session)
	h.mu.Lock()
	h.sessions[sessionID] = session
	h.pendingStarts[sessionID] = ps
	h.mu.Unlock()

	// Start PTY read goroutine — blocks on Read() until shell starts and writes output
	go session.RunReadPTY()

	log.Printf("Created session %s (%s) [shell deferred until first resize]", session.ID, session.Name)

	// Send session created response (frontend can now render the terminal)
	h.sendSessionCreated(sessionID, shellType, session.Name)

	// Fallback: start shell after 500ms if no resize received.
	// The active/visible terminal sends resize within ~50ms of mounting.
	// Any session that hasn't received a resize by 500ms is a non-visible
	// tab — safe to start at default 80x24 since the user isn't looking at it.
	// When they switch to it, the terminal will resize and SIGWINCH the shell.
	go func() {
		time.Sleep(500 * time.Millisecond)
		if ps.started.CompareAndSwap(false, true) {
			log.Printf("Session %s: fallback shell start (no resize received)", sessionID)
			if err := realPTY.StartShell(shellPath); err != nil {
				log.Printf("Failed to start shell for session %s: %v", sessionID, err)
			}
			// Clean up pending entry
			h.mu.Lock()
			delete(h.pendingStarts, sessionID)
			h.mu.Unlock()
		}
	}()
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
// On the FIRST resize for a session with deferred shell start, this sizes
// the PTY and starts the shell — so the shell's initial prompt is at the
// correct dimensions.
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

	// Check if this session has a pending shell start
	h.mu.Lock()
	ps, isPending := h.pendingStarts[msg.SessionId]
	if isPending {
		delete(h.pendingStarts, msg.SessionId)
	}
	h.mu.Unlock()

	// Resize the PTY (works whether shell is started or not)
	session.Resize(msg.Cols, msg.Rows)

	// If shell hasn't started, start it now at the correct size
	if isPending && ps.started.CompareAndSwap(false, true) {
		log.Printf("Session %s: starting shell at %dx%d", msg.SessionId, msg.Cols, msg.Rows)
		if err := ps.realPTY.StartShell(ps.shellPath); err != nil {
			log.Printf("Failed to start shell for session %s: %v", msg.SessionId, err)
		}
	}
}

// handleTmuxConfig updates the tmux polling interval from frontend settings.
func (h *connectionHandler) handleTmuxConfig(msg *terminal.ClientMessage) {
	if msg.Interval <= 0 {
		return
	}
	d := time.Duration(msg.Interval) * time.Millisecond
	// Clamp to valid range
	if d < 500*time.Millisecond {
		d = 500 * time.Millisecond
	}
	if d > 30*time.Second {
		d = 30 * time.Second
	}
	if h.server != nil && h.server.monitor != nil {
		h.server.monitor.UpdateInterval(d)
	}
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
	h.pendingStarts = make(map[string]*pendingShellStart)
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
