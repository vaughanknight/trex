package server

import (
	"net/http"

	"github.com/vaughanknight/trex/internal/static"
)

// Server holds the HTTP server configuration
type Server struct {
	mux     *http.ServeMux
	version string
}

// New creates a new server instance
func New(version string) *Server {
	s := &Server{
		mux:     http.NewServeMux(),
		version: version,
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
	s.mux.HandleFunc("/ws", s.handleTerminal())
	// Serve embedded frontend files at root
	s.mux.Handle("/", static.Handler())
}
