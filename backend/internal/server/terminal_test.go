package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/vaughanknight/trex/internal/terminal"
)

// Test Doc:
// - Why: Verify WebSocket handler properly upgrades and creates terminal session
// - Contract: /ws endpoint upgrades to WebSocket and enables bidirectional terminal I/O
// - Usage Notes: Requires real PTY; skip in environments without shell access
// - Quality Contribution: Integration test for WebSocket terminal functionality
// - Worked Example: Connect to /ws → send input "echo test\r" → receive output containing "test"

func TestHandleTerminal_Upgrade(t *testing.T) {
	srv := New("test-version")
	server := httptest.NewServer(srv)
	defer server.Close()

	// Convert HTTP URL to WebSocket URL
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	// Connect to WebSocket
	dialer := websocket.Dialer{}
	conn, resp, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial error: %v", err)
	}
	defer conn.Close()

	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Errorf("Status code = %d, want %d", resp.StatusCode, http.StatusSwitchingProtocols)
	}
}

func TestHandleTerminal_EchoCommand(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	srv := New("test-version")
	server := httptest.NewServer(srv)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial error: %v", err)
	}
	defer conn.Close()

	// First, create a session
	createMsg := terminal.ClientMessage{
		Type: terminal.MsgTypeCreate,
	}
	createBytes, _ := json.Marshal(createMsg)
	if err := conn.WriteMessage(websocket.TextMessage, createBytes); err != nil {
		t.Fatalf("Failed to send create: %v", err)
	}

	// Get session ID from response
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var sessionID string

	for i := 0; i < 10; i++ {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg terminal.ServerMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		if msg.Type == terminal.MsgTypeSessionCreated {
			sessionID = msg.SessionId
			break
		}
	}

	if sessionID == "" {
		t.Fatal("Did not receive session ID")
	}

	// Send resize for the session
	resizeMsg := terminal.ClientMessage{
		SessionId: sessionID,
		Type:      terminal.MsgTypeResize,
		Cols:      80,
		Rows:      24,
	}
	resizeBytes, _ := json.Marshal(resizeMsg)
	if err := conn.WriteMessage(websocket.TextMessage, resizeBytes); err != nil {
		t.Fatalf("Failed to send resize: %v", err)
	}

	// Give shell time to start
	time.Sleep(100 * time.Millisecond)

	// Send echo command with session ID
	inputMsg := terminal.ClientMessage{
		SessionId: sessionID,
		Type:      terminal.MsgTypeInput,
		Data:      "echo hello-test-marker\r",
	}
	inputBytes, _ := json.Marshal(inputMsg)
	if err := conn.WriteMessage(websocket.TextMessage, inputBytes); err != nil {
		t.Fatalf("Failed to send input: %v", err)
	}

	// Read output until we see our marker or timeout
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	foundMarker := false

	for i := 0; i < 50; i++ { // Max 50 messages
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg terminal.ServerMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		if msg.Type == terminal.MsgTypeOutput && strings.Contains(msg.Data, "hello-test-marker") {
			foundMarker = true
			break
		}
	}

	if !foundMarker {
		t.Error("Did not receive expected output 'hello-test-marker'")
	}
}

func TestHandleTerminal_Resize(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	srv := New("test-version")
	server := httptest.NewServer(srv)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial error: %v", err)
	}
	defer conn.Close()

	// Send resize message
	resizeMsg := terminal.ClientMessage{
		Type: terminal.MsgTypeResize,
		Cols: 120,
		Rows: 40,
	}
	resizeBytes, _ := json.Marshal(resizeMsg)
	if err := conn.WriteMessage(websocket.TextMessage, resizeBytes); err != nil {
		t.Fatalf("Failed to send resize: %v", err)
	}

	// If we get here without error, resize was processed
	// (Real verification would require checking tty size inside the shell)
}

// Test Doc:
// - Why: Multi-session support requires message routing by sessionId
// - Contract: Messages with sessionId are routed to the correct session
// - Usage Notes: First message with new sessionId creates session
// - Quality Contribution: Enables multiple terminals over single WebSocket
// - Worked Example: Send {sessionId: "s1"} → routed to session s1

func TestHandleTerminal_SessionCreate(t *testing.T) {
	srv := New("test-version")
	server := httptest.NewServer(srv)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial error: %v", err)
	}
	defer conn.Close()

	// Request session creation
	createMsg := terminal.ClientMessage{
		Type: terminal.MsgTypeCreate,
	}
	createBytes, _ := json.Marshal(createMsg)
	if err := conn.WriteMessage(websocket.TextMessage, createBytes); err != nil {
		t.Fatalf("Failed to send create: %v", err)
	}

	// Wait for response with sessionId
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	foundSession := false
	var sessionID string

	for i := 0; i < 10; i++ {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg terminal.ServerMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		if msg.Type == terminal.MsgTypeSessionCreated && msg.SessionId != "" {
			foundSession = true
			sessionID = msg.SessionId
			break
		}
	}

	if !foundSession {
		t.Error("Did not receive session created message with sessionId")
	}

	// Verify session is in registry
	if srv.registry.Get(sessionID) == nil {
		t.Errorf("Session %s not found in registry", sessionID)
	}
}

func TestHandleTerminal_SessionRouting(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	srv := New("test-version")
	server := httptest.NewServer(srv)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial error: %v", err)
	}
	defer conn.Close()

	// Create first session
	createMsg := terminal.ClientMessage{Type: terminal.MsgTypeCreate}
	createBytes, _ := json.Marshal(createMsg)
	conn.WriteMessage(websocket.TextMessage, createBytes)

	// Get session ID from response
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var session1ID string

	for i := 0; i < 10; i++ {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg terminal.ServerMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		if msg.Type == terminal.MsgTypeSessionCreated {
			session1ID = msg.SessionId
			break
		}
	}

	if session1ID == "" {
		t.Fatal("Did not receive session1 ID")
	}

	// Send input to session 1
	inputMsg := terminal.ClientMessage{
		SessionId: session1ID,
		Type:      terminal.MsgTypeInput,
		Data:      "echo session1-marker\r",
	}
	inputBytes, _ := json.Marshal(inputMsg)
	conn.WriteMessage(websocket.TextMessage, inputBytes)

	// Verify output comes back with session1 ID
	conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	foundMarker := false

	for i := 0; i < 50; i++ {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg terminal.ServerMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		if msg.Type == terminal.MsgTypeOutput &&
			msg.SessionId == session1ID &&
			strings.Contains(msg.Data, "session1-marker") {
			foundMarker = true
			break
		}
	}

	if !foundMarker {
		t.Error("Did not receive output with correct sessionId")
	}
}

func TestHandleTerminal_UnknownSessionId(t *testing.T) {
	srv := New("test-version")
	server := httptest.NewServer(srv)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	dialer := websocket.Dialer{}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial error: %v", err)
	}
	defer conn.Close()

	// Send message with unknown sessionId
	inputMsg := terminal.ClientMessage{
		SessionId: "unknown-session",
		Type:      terminal.MsgTypeInput,
		Data:      "test",
	}
	inputBytes, _ := json.Marshal(inputMsg)
	conn.WriteMessage(websocket.TextMessage, inputBytes)

	// Should receive error message
	conn.SetReadDeadline(time.Now().Add(time.Second))
	foundError := false

	for i := 0; i < 10; i++ {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg terminal.ServerMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		if msg.Type == terminal.MsgTypeError {
			foundError = true
			break
		}
	}

	if !foundError {
		t.Error("Expected error for unknown sessionId")
	}
}
