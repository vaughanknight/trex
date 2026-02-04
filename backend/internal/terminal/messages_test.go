package terminal

import (
	"encoding/json"
	"strings"
	"testing"
)

// Test Doc:
// - Why: Multi-session support requires sessionId routing in protocol
// - Contract: ClientMessage.SessionId marshals/unmarshals correctly via JSON
// - Usage Notes: sessionId is optional (omitempty) for backwards compatibility
// - Quality Contribution: Prevents routing failures in multi-session scenarios
// - Worked Example: {sessionId: "abc", type: "input"} → JSON → parse → sessionId="abc"
func TestClientMessage_WithSessionId(t *testing.T) {
	msg := ClientMessage{
		SessionId: "session-123",
		Type:      MsgTypeInput,
		Data:      "hello",
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	// Verify JSON contains sessionId
	if !strings.Contains(string(data), `"sessionId":"session-123"`) {
		t.Errorf("JSON should contain sessionId, got: %s", string(data))
	}

	var parsed ClientMessage
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}
	if parsed.SessionId != "session-123" {
		t.Errorf("SessionId = %q, want %q", parsed.SessionId, "session-123")
	}
	if parsed.Type != MsgTypeInput {
		t.Errorf("Type = %q, want %q", parsed.Type, MsgTypeInput)
	}
	if parsed.Data != "hello" {
		t.Errorf("Data = %q, want %q", parsed.Data, "hello")
	}
}

// Test Doc:
// - Why: Session naming requires shell type information from backend
// - Contract: ServerMessage.ShellType marshals/unmarshals correctly via JSON
// - Usage Notes: shellType extracted from shell path (e.g., /bin/zsh → zsh)
// - Quality Contribution: Enables accurate session naming in sidebar ("bash-1", "zsh-2")
// - Worked Example: {shellType: "zsh", sessionId: "abc"} → JSON → parse → shellType="zsh"
func TestServerMessage_WithShellType(t *testing.T) {
	msg := ServerMessage{
		SessionId: "session-123",
		ShellType: "zsh",
		Type:      MsgTypeOutput,
		Data:      "welcome to zsh",
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	// Verify JSON contains shellType and sessionId
	if !strings.Contains(string(data), `"shellType":"zsh"`) {
		t.Errorf("JSON should contain shellType, got: %s", string(data))
	}
	if !strings.Contains(string(data), `"sessionId":"session-123"`) {
		t.Errorf("JSON should contain sessionId, got: %s", string(data))
	}

	var parsed ServerMessage
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}
	if parsed.ShellType != "zsh" {
		t.Errorf("ShellType = %q, want %q", parsed.ShellType, "zsh")
	}
	if parsed.SessionId != "session-123" {
		t.Errorf("SessionId = %q, want %q", parsed.SessionId, "session-123")
	}
	if parsed.Type != MsgTypeOutput {
		t.Errorf("Type = %q, want %q", parsed.Type, MsgTypeOutput)
	}
}

// Test Doc:
// - Why: Backwards compatibility with existing code that doesn't send sessionId
// - Contract: Messages without sessionId parse without error; SessionId defaults to ""
// - Usage Notes: Existing tests and single-session mode must continue working
// - Quality Contribution: Prevents breaking changes during protocol evolution
// - Worked Example: {"type":"input","data":"hello"} → parse → SessionId="" (empty, not error)
func TestClientMessage_BackwardsCompatible(t *testing.T) {
	// Old message format without sessionId
	oldFormat := `{"type":"input","data":"hello"}`

	var msg ClientMessage
	if err := json.Unmarshal([]byte(oldFormat), &msg); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}
	if msg.SessionId != "" {
		t.Errorf("SessionId should be empty, got %q", msg.SessionId)
	}
	if msg.Type != MsgTypeInput {
		t.Errorf("Type = %q, want %q", msg.Type, MsgTypeInput)
	}
	if msg.Data != "hello" {
		t.Errorf("Data = %q, want %q", msg.Data, "hello")
	}
}

// Test Doc:
// - Why: ServerMessage must also support backwards compatibility
// - Contract: ServerMessage without sessionId/shellType parses without error
// - Usage Notes: Existing code paths that don't set these fields continue working
// - Quality Contribution: Prevents regressions in existing terminal functionality
// - Worked Example: {"type":"output","data":"hello"} → parse → ShellType="" (empty, not error)
func TestServerMessage_BackwardsCompatible(t *testing.T) {
	// Old message format without sessionId or shellType
	oldFormat := `{"type":"output","data":"hello"}`

	var msg ServerMessage
	if err := json.Unmarshal([]byte(oldFormat), &msg); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}
	if msg.SessionId != "" {
		t.Errorf("SessionId should be empty, got %q", msg.SessionId)
	}
	if msg.ShellType != "" {
		t.Errorf("ShellType should be empty, got %q", msg.ShellType)
	}
	if msg.Type != MsgTypeOutput {
		t.Errorf("Type = %q, want %q", msg.Type, MsgTypeOutput)
	}
	if msg.Data != "hello" {
		t.Errorf("Data = %q, want %q", msg.Data, "hello")
	}
}

// Test Doc:
// - Why: JSON omitempty should exclude empty sessionId from output
// - Contract: Empty sessionId is not included in marshaled JSON
// - Usage Notes: Reduces message size when sessionId not needed
// - Quality Contribution: Ensures clean protocol without unnecessary fields
// - Worked Example: {type: "input", sessionId: ""} → JSON → no sessionId key
func TestClientMessage_OmitsEmptySessionId(t *testing.T) {
	msg := ClientMessage{
		Type: MsgTypeInput,
		Data: "hello",
		// SessionId not set (empty string)
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	// Verify JSON does NOT contain sessionId when empty
	if strings.Contains(string(data), `"sessionId"`) {
		t.Errorf("JSON should NOT contain sessionId when empty, got: %s", string(data))
	}
}

// Test Doc:
// - Why: JSON omitempty should exclude empty shellType from output
// - Contract: Empty shellType is not included in marshaled JSON
// - Usage Notes: Reduces message size when shellType not needed
// - Quality Contribution: Ensures clean protocol without unnecessary fields
// - Worked Example: {type: "output", shellType: ""} → JSON → no shellType key
func TestServerMessage_OmitsEmptyShellType(t *testing.T) {
	msg := ServerMessage{
		Type: MsgTypeOutput,
		Data: "hello",
		// SessionId and ShellType not set (empty strings)
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	// Verify JSON does NOT contain sessionId or shellType when empty
	if strings.Contains(string(data), `"sessionId"`) {
		t.Errorf("JSON should NOT contain sessionId when empty, got: %s", string(data))
	}
	if strings.Contains(string(data), `"shellType"`) {
		t.Errorf("JSON should NOT contain shellType when empty, got: %s", string(data))
	}
}
