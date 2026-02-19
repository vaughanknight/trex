package server

import (
	"context"
	"log"
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

	// tmux monitor for detecting tmux session attachments
	monitor *terminal.TmuxMonitor
	ctx     context.Context
	cancel  context.CancelFunc
}

// New creates a new server instance
func New(version string, cfg *config.Config) *Server {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Server{
		mux:      http.NewServeMux(),
		version:  version,
		registry: terminal.NewSessionRegistry(),
		config:   cfg,
		ctx:      ctx,
		cancel:   cancel,
	}
	s.routes()

	// Wrap mux with auth middleware
	jwtService := auth.NewJWTService(cfg.JWTSecret)
	s.handler = auth.Middleware(jwtService, cfg.AuthEnabled)(s.mux)

	// Start tmux monitor
	detector := terminal.NewRealTmuxDetector(5 * time.Second)
	pollInterval := cfg.TmuxPollInterval
	if pollInterval <= 0 {
		pollInterval = 2 * time.Second
	}
	s.monitor = terminal.NewTmuxMonitor(detector, s.registry, pollInterval, s.handleTmuxChanges, s.handleSessionsChanged)
	s.monitor.Start()

	return s
}

// Shutdown stops background goroutines (tmux monitor, etc.).
func (s *Server) Shutdown() {
	s.cancel()
	if s.monitor != nil {
		s.monitor.Stop()
	}
	log.Printf("Server shutdown complete")
}

// handleTmuxChanges is called by the tmux monitor when session attachments change.
// It groups updates by connection and sends one tmux_status message per connection
// to avoid N duplicate messages when a connection owns N sessions.
func (s *Server) handleTmuxChanges(updates map[string]string) {
	// Group updates by connection: conn → {sessionID: tmuxName}
	type connKey = terminal.Conn
	byConn := make(map[connKey]map[string]string)

	for sessionID, tmuxName := range updates {
		session := s.registry.Get(sessionID)
		if session == nil {
			continue
		}
		conn := session.GetConn()
		if conn == nil {
			continue
		}
		if byConn[conn] == nil {
			byConn[conn] = make(map[string]string)
		}
		byConn[conn][sessionID] = tmuxName
	}

	// Send one message per connection
	for _, connUpdates := range byConn {
		// Pick any session on this connection to send through
		for sessionID := range connUpdates {
			session := s.registry.Get(sessionID)
			if session != nil {
				session.SendTmuxStatus(connUpdates)
				break // Only send once per connection
			}
		}
	}
}

// handleSessionsChanged is called by the tmux monitor when the tmux session list changes.
// It broadcasts the full session list to ALL connected clients (unlike handleTmuxChanges
// which groups by connection — session list is global, not per-session).
func (s *Server) handleSessionsChanged(sessions []terminal.TmuxSessionInfo) {
	// Deduplicate connections: a client may own multiple sessions but should
	// receive only one tmux_sessions message.
	type connKey = terminal.Conn
	seen := make(map[connKey]bool)

	for _, session := range s.registry.List() {
		conn := session.GetConn()
		if conn == nil || seen[conn] {
			continue
		}
		seen[conn] = true
		session.SendTmuxSessions(sessions)
	}

	log.Printf("broadcast tmux sessions (%d sessions) to %d clients", len(sessions), len(seen))
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
