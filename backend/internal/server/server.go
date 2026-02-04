package server

import (
	"net/http"

	"github.com/vaughanknight/trex/internal/static"
	"github.com/vaughanknight/trex/internal/terminal"
)

// Server holds the HTTP server configuration
type Server struct {
	mux      *http.ServeMux
	version  string
	registry *terminal.SessionRegistry
}

// New creates a new server instance
func New(version string) *Server {
	s := &Server{
		mux:      http.NewServeMux(),
		version:  version,
		registry: terminal.NewSessionRegistry(),
	}
	s.routes()
	return s
}

// ServeHTTP implements http.Handler
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

// routes sets up all HTTP routes
func (s *Server) routes() {
	s.mux.HandleFunc("/api/health", s.handleHealth())
	s.mux.HandleFunc("/api/sessions", handleSessions(s.registry))
	s.mux.HandleFunc("/api/sessions/", handleSessionDelete(s.registry))
	s.mux.HandleFunc("/ws", s.handleTerminal())
	// Serve embedded frontend files at root
	s.mux.Handle("/", static.Handler())
}
