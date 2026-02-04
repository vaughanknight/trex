package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/vaughanknight/trex/internal/terminal"
)

// Test Doc:
// - Why: Frontend needs to list all active sessions for sidebar display
// - Contract: GET /api/sessions returns JSON array of session metadata
// - Usage Notes: Returns empty array (not null) when no sessions exist
// - Quality Contribution: Enables sidebar session list population
// - Worked Example: 2 sessions → [{"id":"s1",...}, {"id":"s2",...}]

func TestGetSessions_Empty(t *testing.T) {
	registry := terminal.NewSessionRegistry()
	handler := handleSessions(registry)

	req := httptest.NewRequest(http.MethodGet, "/api/sessions", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status = %d, want %d", rec.Code, http.StatusOK)
	}

	// Should return empty array, not null
	var sessions []terminal.SessionInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &sessions); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if sessions == nil {
		t.Error("Sessions should be empty array, not nil")
	}
	if len(sessions) != 0 {
		t.Errorf("Sessions length = %d, want 0", len(sessions))
	}
}

func TestGetSessions_WithSessions(t *testing.T) {
	registry := terminal.NewSessionRegistry()

	// Add some sessions
	now := time.Now()
	registry.Add(&terminal.Session{
		ID:        "s1",
		Name:      "bash-1",
		ShellType: "bash",
		Status:    terminal.SessionStatusActive,
		CreatedAt: now,
	})
	registry.Add(&terminal.Session{
		ID:        "s2",
		Name:      "zsh-1",
		ShellType: "zsh",
		Status:    terminal.SessionStatusActive,
		CreatedAt: now.Add(time.Second),
	})

	handler := handleSessions(registry)

	req := httptest.NewRequest(http.MethodGet, "/api/sessions", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Status = %d, want %d", rec.Code, http.StatusOK)
	}

	var sessions []terminal.SessionInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &sessions); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if len(sessions) != 2 {
		t.Fatalf("Sessions length = %d, want 2", len(sessions))
	}

	// Verify fields present (order not guaranteed)
	ids := make(map[string]bool)
	for _, s := range sessions {
		ids[s.ID] = true
		if s.Name == "" {
			t.Errorf("Session %s has empty Name", s.ID)
		}
		if s.ShellType == "" {
			t.Errorf("Session %s has empty ShellType", s.ID)
		}
		if s.Status == "" {
			t.Errorf("Session %s has empty Status", s.ID)
		}
	}

	if !ids["s1"] || !ids["s2"] {
		t.Errorf("Missing expected session IDs: got %v", ids)
	}
}

func TestGetSessions_ContentType(t *testing.T) {
	registry := terminal.NewSessionRegistry()
	handler := handleSessions(registry)

	req := httptest.NewRequest(http.MethodGet, "/api/sessions", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	contentType := rec.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q, want %q", contentType, "application/json")
	}
}

// Test Doc:
// - Why: Frontend needs to close sessions via X button in sidebar
// - Contract: DELETE /api/sessions/:id closes session and removes from registry
// - Usage Notes: Returns 204 on success, 404 if session not found
// - Quality Contribution: Enables session close from sidebar
// - Worked Example: DELETE /api/sessions/s1 → 204, session removed

func TestDeleteSession_Success(t *testing.T) {
	registry := terminal.NewSessionRegistry()

	// Create fake PTY and WebSocket for the session
	fakePTY := terminal.NewFakePTY()
	fakeWS := terminal.NewFakeWebSocket()

	session := terminal.NewSession(fakePTY, fakeWS)
	session.ID = "s1"
	session.Name = "bash-1"
	session.ShellType = "bash"
	session.Status = terminal.SessionStatusActive

	registry.Add(session)

	handler := handleSessionDelete(registry)

	// Simulate path parameter by using full path
	req := httptest.NewRequest(http.MethodDelete, "/api/sessions/s1", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("Status = %d, want %d", rec.Code, http.StatusNoContent)
	}

	// Verify session removed from registry
	if registry.Get("s1") != nil {
		t.Error("Session should be removed from registry")
	}

	// Verify PTY closed (WebSocket is not closed as it may be shared in multi-session mode)
	if !fakePTY.Closed {
		t.Error("PTY should be closed")
	}
	// Note: WebSocket is NOT closed by CloseGracefully as it may be shared across sessions
}

func TestDeleteSession_NotFound(t *testing.T) {
	registry := terminal.NewSessionRegistry()
	handler := handleSessionDelete(registry)

	req := httptest.NewRequest(http.MethodDelete, "/api/sessions/nonexistent", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("Status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestDeleteSession_MissingID(t *testing.T) {
	registry := terminal.NewSessionRegistry()
	handler := handleSessionDelete(registry)

	req := httptest.NewRequest(http.MethodDelete, "/api/sessions/", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

// Test Doc:
// - Why: Sessions endpoint should only accept appropriate HTTP methods
// - Contract: Only GET allowed on /api/sessions collection
// - Usage Notes: Returns 405 for non-GET methods
// - Quality Contribution: Proper REST semantics

func TestGetSessions_MethodNotAllowed(t *testing.T) {
	registry := terminal.NewSessionRegistry()
	handler := handleSessions(registry)

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch} {
		req := httptest.NewRequest(method, "/api/sessions", nil)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s: Status = %d, want %d", method, rec.Code, http.StatusMethodNotAllowed)
		}
	}
}
