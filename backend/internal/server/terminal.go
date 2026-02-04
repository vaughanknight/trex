package server

import (
	"log"
	"net/http"

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

// handleTerminal handles WebSocket connections for terminal sessions.
func (s *Server) handleTerminal() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Upgrade HTTP connection to WebSocket
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}

		// Create PTY
		pty, err := terminal.NewRealPTY()
		if err != nil {
			log.Printf("PTY creation error: %v", err)
			conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "failed to create terminal"))
			conn.Close()
			return
		}

		// Create and run session
		session := terminal.NewSession(pty, conn)
		defer session.Stop()

		log.Printf("Terminal session started")
		session.Run()
		log.Printf("Terminal session ended")
	}
}
