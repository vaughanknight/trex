package terminal

// ClientMessage represents messages sent from browser to server.
type ClientMessage struct {
	SessionId string `json:"sessionId,omitempty"` // Session ID for multi-session routing
	Type      string `json:"type"`                // "input" | "resize"
	Data      string `json:"data,omitempty"`
	Cols      uint16 `json:"cols,omitempty"`
	Rows      uint16 `json:"rows,omitempty"`
}

// ServerMessage represents messages sent from server to browser.
type ServerMessage struct {
	SessionId string `json:"sessionId,omitempty"` // Session ID for multi-session routing
	ShellType string `json:"shellType,omitempty"` // Shell type (e.g., "bash", "zsh") for session naming
	Type      string `json:"type"`                // "output" | "error" | "exit"
	Data      string `json:"data,omitempty"`
	Error     string `json:"error,omitempty"`
	Code      int    `json:"code,omitempty"` // Exit code for "exit" type
}

// Message type constants
const (
	MsgTypeInput  = "input"
	MsgTypeResize = "resize"
	MsgTypeOutput = "output"
	MsgTypeError  = "error"
	MsgTypeExit   = "exit"

	// Multi-session message types
	MsgTypeCreate         = "create"          // Client requests new session
	MsgTypeSessionCreated = "session_created" // Server confirms session created
	MsgTypeClose          = "close"           // Client requests session termination
)
