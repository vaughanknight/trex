package terminal

// ClientMessage represents messages sent from browser to server.
type ClientMessage struct {
	SessionId string `json:"sessionId,omitempty"` // Session ID for multi-session routing
	Type      string `json:"type"`                // "input" | "resize"
	Data      string `json:"data,omitempty"`
	Cols      uint16 `json:"cols,omitempty"`
	Rows      uint16 `json:"rows,omitempty"`
	Interval  int    `json:"interval,omitempty"`  // Polling interval in ms (for tmux_config)

	// tmux-attach session creation fields
	TmuxSessionName string `json:"tmuxSessionName,omitempty"` // Target tmux session for attach
	TmuxWindowIndex int    `json:"tmuxWindowIndex,omitempty"` // Target tmux window (0 = default)
	Cwd             string `json:"cwd,omitempty"`             // Initial working directory for new session
}

// ServerMessage represents messages sent from server to browser.
type ServerMessage struct {
	SessionId    string            `json:"sessionId,omitempty"`    // Session ID for multi-session routing
	ShellType    string            `json:"shellType,omitempty"`    // Shell type (e.g., "bash", "zsh") for session naming
	Type         string            `json:"type"`                   // "output" | "error" | "exit" | "tmux_status" | "tmux_sessions"
	Data         string            `json:"data,omitempty"`
	Error        string            `json:"error,omitempty"`
	Code         int               `json:"code,omitempty"`         // Exit code for "exit" type
	TmuxUpdates  map[string]string `json:"tmuxUpdates,omitempty"`  // sessionId → tmux session name (empty = detached)
	TmuxSessions []TmuxSessionInfo `json:"tmuxSessions,omitempty"` // Full tmux session list (for tmux_sessions type)

	// tmux-attach metadata (included in session_created response)
	TmuxSessionName string `json:"tmuxSessionName,omitempty"` // tmux session name for this session
	TmuxWindowIndex int    `json:"tmuxWindowIndex,omitempty"` // tmux window index for this session
	Cwd             string `json:"cwd,omitempty"`             // Current working directory of the session
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

	// tmux tracking message types
	MsgTypeTmuxStatus       = "tmux_status"        // Server broadcasts tmux session mapping updates
	MsgTypeTmuxConfig       = "tmux_config"        // Client sends tmux polling config changes
	MsgTypeTmuxSessions     = "tmux_sessions"      // Server broadcasts full tmux session list
	MsgTypeListTmuxSessions = "list_tmux_sessions" // Client requests current tmux session list
	MsgTypeDetach           = "detach"             // Client requests tmux detach (PTY closed, tmux session survives)
	MsgTypeCwdUpdate        = "cwd_update"         // Server sends updated cwd for a session
)
