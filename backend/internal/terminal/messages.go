package terminal

// ClientMessage represents messages sent from browser to server.
type ClientMessage struct {
	Type string `json:"type"` // "input" | "resize"
	Data string `json:"data,omitempty"`
	Cols uint16 `json:"cols,omitempty"`
	Rows uint16 `json:"rows,omitempty"`
}

// ServerMessage represents messages sent from server to browser.
type ServerMessage struct {
	Type  string `json:"type"` // "output" | "error" | "exit"
	Data  string `json:"data,omitempty"`
	Error string `json:"error,omitempty"`
	Code  int    `json:"code,omitempty"` // Exit code for "exit" type
}

// Message type constants
const (
	MsgTypeInput  = "input"
	MsgTypeResize = "resize"
	MsgTypeOutput = "output"
	MsgTypeError  = "error"
	MsgTypeExit   = "exit"
)
