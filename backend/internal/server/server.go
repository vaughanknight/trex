package server

import (
	"net/http"
	"time"

	"github.com/vaughanknight/trex/internal/auth"
	"github.com/vaughanknight/trex/internal/config"
	"github.com/vaughanknight/trex/internal/static"
	"github.com/vaughanknight/trex/internal/terminal"
)

// Server holds the HTTP server configuration
type Server struct {
	mux      *http.ServeMux
	handler  http.Handler // mux wrapped with middleware
	version  string
	registry *terminal.SessionRegistry
	config   *config.Config
}

// New creates a new server instance
func New(version string, cfg *config.Config) *Server {
	s := &Server{
		mux:      http.NewServeMux(),
		version:  version,
		registry: terminal.NewSessionRegistry(),
		config:   cfg,
	}
	s.routes()

	// Wrap mux with auth middleware
	jwtService := auth.NewJWTService(cfg.JWTSecret)
	s.handler = auth.Middleware(jwtService, cfg.AuthEnabled)(s.mux)

	return s
}

// ServeHTTP implements http.Handler
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

// routes sets up all HTTP routes
func (s *Server) routes() {
	s.mux.HandleFunc("/api/health", s.handleHealth())
	s.mux.HandleFunc("/api/sessions", handleSessions(s.registry))
	s.mux.HandleFunc("/api/sessions/", handleSessionDelete(s.registry))
	s.mux.HandleFunc("/ws", s.handleTerminal())

	// Auth routes
	s.setupAuthRoutes()

	// Serve embedded frontend files at root
	s.mux.Handle("/", static.Handler())
}

// setupAuthRoutes registers OAuth authentication routes.
func (s *Server) setupAuthRoutes() {
	var provider auth.OAuthProvider
	if s.config.AuthEnabled {
		provider = auth.NewRealGitHubProvider(
			s.config.GitHubClientID,
			s.config.GitHubClientSecret,
			s.config.GitHubCallbackURL,
		)
	} else {
		// When auth is disabled, use a no-op provider.
		// Only /api/auth/enabled will be functional (returns false).
		provider = auth.NewFakeOAuthProvider()
	}

	stateStore := auth.NewStateStore(10 * time.Minute)
	jwtService := auth.NewJWTService(s.config.JWTSecret)
	authHandler := auth.NewAuthHandler(provider, stateStore, jwtService, s.config.AuthEnabled)

	// Set up allowlist if auth is enabled
	if s.config.AuthEnabled && s.config.AllowlistPath != "" {
		allowlist, err := auth.NewAllowlistFromFile(s.config.AllowlistPath)
		if err != nil {
			// Non-fatal: start with empty allowlist
			allowlist = auth.NewAllowlistManager()
		}
		authHandler.SetAllowlist(allowlist)

		// Start file watcher in background
		go allowlist.WatchFile(make(chan struct{}))
	}

	authHandler.RegisterRoutes(s.mux)
}
