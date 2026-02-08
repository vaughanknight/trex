package server

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/vaughanknight/trex/internal/auth"
	"github.com/vaughanknight/trex/internal/terminal"
)

// handleSessions handles GET /api/sessions to list all active sessions.
func handleSessions(registry *terminal.SessionRegistry) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		// Filter sessions by owner when auth is enabled
		var owner string
		if user := auth.UserFromContext(r.Context()); user != nil {
			owner = user.Username
		}
		sessions := registry.ListByOwner(owner)

		// Convert to SessionInfo slice for JSON response
		infos := make([]terminal.SessionInfo, 0, len(sessions))
		for _, s := range sessions {
			infos = append(infos, s.Info())
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(infos); err != nil {
			log.Printf("Failed to encode sessions: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
		}
	}
}

// handleSessionDelete handles DELETE /api/sessions/:id to close a session.
func handleSessionDelete(registry *terminal.SessionRegistry) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract session ID from path: /api/sessions/:id
		path := strings.TrimPrefix(r.URL.Path, "/api/sessions/")
		sessionID := strings.TrimSpace(path)

		if sessionID == "" {
			http.Error(w, "session ID required", http.StatusBadRequest)
			return
		}

		session := registry.Get(sessionID)
		if session == nil {
			http.Error(w, "session not found", http.StatusNotFound)
			return
		}

		// Check ownership when auth is enabled
		if user := auth.UserFromContext(r.Context()); user != nil {
			if session.Owner != "" && session.Owner != user.Username {
				http.Error(w, "session not found", http.StatusNotFound)
				return
			}
		}

		// Close session gracefully
		log.Printf("Closing session %s (%s)", session.ID, session.Name)
		session.CloseGracefully()

		// Remove from registry
		registry.Delete(sessionID)

		w.WriteHeader(http.StatusNoContent)
	}
}
