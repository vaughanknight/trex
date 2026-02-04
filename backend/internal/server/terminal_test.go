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

	// Send initial resize to set terminal size
	resizeMsg := terminal.ClientMessage{
		Type: terminal.MsgTypeResize,
		Cols: 80,
		Rows: 24,
	}
	resizeBytes, _ := json.Marshal(resizeMsg)
	if err := conn.WriteMessage(websocket.TextMessage, resizeBytes); err != nil {
		t.Fatalf("Failed to send resize: %v", err)
	}

	// Give shell time to start
	time.Sleep(100 * time.Millisecond)

	// Send echo command
	inputMsg := terminal.ClientMessage{
		Type: terminal.MsgTypeInput,
		Data: "echo hello-test-marker\r",
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
