package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newTestHandler() *AuthHandler {
	provider := NewFakeOAuthProvider()
	stateStore := NewStateStore(10 * time.Minute)
	jwtService := NewJWTService("test-secret")
	return NewAuthHandler(provider, stateStore, jwtService, true)
}

// =============================================================================
// /auth/github tests
// =============================================================================

func TestHandleGitHubLogin_Redirects(t *testing.T) {
	// Test Doc:
	// - Why: OAuth flow must redirect to GitHub with state parameter
	// - Contract: GET /auth/github → 302 with Location containing state=

	h := newTestHandler()
	req := httptest.NewRequest(http.MethodGet, "/auth/github", nil)
	w := httptest.NewRecorder()

	h.HandleGitHubLogin().ServeHTTP(w, req)

	if w.Code != http.StatusFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusFound)
	}

	location := w.Header().Get("Location")
	if !strings.Contains(location, "fake-github.com") {
		t.Errorf("Location = %q, want it to contain fake-github.com", location)
	}
	if !strings.Contains(location, "state=") {
		t.Errorf("Location = %q, want it to contain state=", location)
	}
}

func TestHandleGitHubLogin_StoresState(t *testing.T) {
	// Test Doc:
	// - Why: State must be stored for callback validation (R-07)
	// - Contract: After redirect, state in URL is valid in store

	h := newTestHandler()
	req := httptest.NewRequest(http.MethodGet, "/auth/github", nil)
	w := httptest.NewRecorder()

	h.HandleGitHubLogin().ServeHTTP(w, req)

	location := w.Header().Get("Location")
	// Extract state from URL
	parts := strings.Split(location, "state=")
	if len(parts) < 2 {
		t.Fatal("no state in redirect URL")
	}
	state := parts[1]

	if !h.stateStore.Validate(state) {
		t.Error("state from redirect URL is not valid in store")
	}
}

// =============================================================================
// /auth/callback tests
// =============================================================================

func TestHandleCallback_ValidFlow(t *testing.T) {
	// Test Doc:
	// - Why: Happy path callback must set httpOnly cookies
	// - Contract: Valid code + state → set cookies + redirect to /

	h := newTestHandler()

	// First generate a valid state
	state, _ := h.stateStore.Generate()

	req := httptest.NewRequest(http.MethodGet, "/auth/callback?code=valid-code&state="+state, nil)
	w := httptest.NewRecorder()

	h.HandleCallback().ServeHTTP(w, req)

	if w.Code != http.StatusFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusFound)
	}

	// Check cookies
	cookies := w.Result().Cookies()
	var hasAccess, hasRefresh bool
	for _, c := range cookies {
		if c.Name == "trex_access_token" {
			hasAccess = true
			if !c.HttpOnly {
				t.Error("access token cookie not HttpOnly")
			}
		}
		if c.Name == "trex_refresh_token" {
			hasRefresh = true
			if !c.HttpOnly {
				t.Error("refresh token cookie not HttpOnly")
			}
		}
	}

	if !hasAccess {
		t.Error("missing trex_access_token cookie")
	}
	if !hasRefresh {
		t.Error("missing trex_refresh_token cookie")
	}
}

func TestHandleCallback_AllowlistDenied(t *testing.T) {
	// Test Doc:
	// - Why: Users not in allowlist must be rejected (AC-02)
	// - Contract: Valid OAuth but user not in allowlist → 403

	h := newTestHandler()
	al := NewAllowlistManager()
	al.SetUsers([]string{"otheruser"}) // testuser NOT in list
	h.SetAllowlist(al)

	state, _ := h.stateStore.Generate()
	req := httptest.NewRequest(http.MethodGet, "/auth/callback?code=valid-code&state="+state, nil)
	w := httptest.NewRecorder()

	h.HandleCallback().ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestHandleCallback_AllowlistAllowed(t *testing.T) {
	// Test Doc:
	// - Why: Users in allowlist must be allowed (AC-03)
	// - Contract: Valid OAuth + user in allowlist → success (302)

	h := newTestHandler()
	al := NewAllowlistManager()
	al.SetUsers([]string{"testuser"}) // testuser IS in list
	h.SetAllowlist(al)

	state, _ := h.stateStore.Generate()
	req := httptest.NewRequest(http.MethodGet, "/auth/callback?code=valid-code&state="+state, nil)
	w := httptest.NewRecorder()

	h.HandleCallback().ServeHTTP(w, req)

	if w.Code != http.StatusFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusFound)
	}
}

func TestHandleCallback_InvalidState(t *testing.T) {
	// Test Doc:
	// - Why: Invalid state must be rejected (CSRF protection, R-07)
	// - Contract: Invalid state → 400

	h := newTestHandler()

	req := httptest.NewRequest(http.MethodGet, "/auth/callback?code=valid-code&state=invalid", nil)
	w := httptest.NewRecorder()

	h.HandleCallback().ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestHandleCallback_MissingCode(t *testing.T) {
	// Test Doc:
	// - Why: Missing authorization code must be rejected
	// - Contract: No code param → 400

	h := newTestHandler()
	state, _ := h.stateStore.Generate()

	req := httptest.NewRequest(http.MethodGet, "/auth/callback?state="+state, nil)
	w := httptest.NewRecorder()

	h.HandleCallback().ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestHandleCallback_InvalidCode(t *testing.T) {
	// Test Doc:
	// - Why: Invalid authorization code (GitHub rejects) → 502
	// - Contract: Code not recognized by provider → 502

	h := newTestHandler()
	state, _ := h.stateStore.Generate()

	req := httptest.NewRequest(http.MethodGet, "/auth/callback?code=bad-code&state="+state, nil)
	w := httptest.NewRecorder()

	h.HandleCallback().ServeHTTP(w, req)

	if w.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadGateway)
	}
}

// =============================================================================
// /auth/logout tests
// =============================================================================

func TestHandleLogout_ClearsCookies(t *testing.T) {
	// Test Doc:
	// - Why: Logout must clear all auth cookies
	// - Contract: POST /auth/logout → cookies with MaxAge=-1

	h := newTestHandler()

	req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	w := httptest.NewRecorder()

	h.HandleLogout().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	cookies := w.Result().Cookies()
	cleared := 0
	for _, c := range cookies {
		if c.Name == "trex_access_token" || c.Name == "trex_refresh_token" {
			if c.MaxAge != -1 {
				t.Errorf("cookie %s MaxAge = %d, want -1", c.Name, c.MaxAge)
			}
			cleared++
		}
	}

	if cleared != 2 {
		t.Errorf("cleared %d cookies, want 2", cleared)
	}
}

func TestHandleLogout_RejectsGET(t *testing.T) {
	h := newTestHandler()
	req := httptest.NewRequest(http.MethodGet, "/auth/logout", nil)
	w := httptest.NewRecorder()

	h.HandleLogout().ServeHTTP(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want %d", w.Code, http.StatusMethodNotAllowed)
	}
}

// =============================================================================
// /auth/refresh tests
// =============================================================================

func TestHandleRefresh_ValidRefreshToken(t *testing.T) {
	// Test Doc:
	// - Why: Silent token renewal for uninterrupted sessions (R-08)
	// - Contract: Valid refresh token cookie → new access token cookie

	h := newTestHandler()

	// Generate a refresh token
	user := &GitHubUser{Username: "alice", AvatarURL: "https://github.com/alice.png"}
	refreshToken, _ := h.jwtService.GenerateRefreshToken(user)

	req := httptest.NewRequest(http.MethodPost, "/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: "trex_refresh_token", Value: refreshToken})
	w := httptest.NewRecorder()

	h.HandleRefresh().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	// Check new access token cookie
	cookies := w.Result().Cookies()
	found := false
	for _, c := range cookies {
		if c.Name == "trex_access_token" {
			found = true
			if !c.HttpOnly {
				t.Error("new access token cookie not HttpOnly")
			}
		}
	}

	if !found {
		t.Error("missing new trex_access_token cookie after refresh")
	}
}

func TestHandleRefresh_MissingToken(t *testing.T) {
	// Test Doc:
	// - Why: Missing refresh token → must re-authenticate
	// - Contract: No refresh cookie → 401

	h := newTestHandler()
	req := httptest.NewRequest(http.MethodPost, "/auth/refresh", nil)
	w := httptest.NewRecorder()

	h.HandleRefresh().ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHandleRefresh_InvalidToken(t *testing.T) {
	h := newTestHandler()
	req := httptest.NewRequest(http.MethodPost, "/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: "trex_refresh_token", Value: "invalid-token"})
	w := httptest.NewRecorder()

	h.HandleRefresh().ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

// =============================================================================
// /api/auth/enabled tests
// =============================================================================

func TestHandleAuthEnabled_ReturnsTrue(t *testing.T) {
	h := newTestHandler() // enabled=true
	req := httptest.NewRequest(http.MethodGet, "/api/auth/enabled", nil)
	w := httptest.NewRecorder()

	h.HandleAuthEnabled().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp map[string]bool
	json.NewDecoder(w.Body).Decode(&resp)
	if !resp["enabled"] {
		t.Error("expected enabled=true")
	}
}

func TestHandleAuthEnabled_ReturnsFalse(t *testing.T) {
	provider := NewFakeOAuthProvider()
	stateStore := NewStateStore(10 * time.Minute)
	jwtService := NewJWTService("test-secret")
	h := NewAuthHandler(provider, stateStore, jwtService, false) // enabled=false

	req := httptest.NewRequest(http.MethodGet, "/api/auth/enabled", nil)
	w := httptest.NewRecorder()

	h.HandleAuthEnabled().ServeHTTP(w, req)

	var resp map[string]bool
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["enabled"] {
		t.Error("expected enabled=false")
	}
}

// =============================================================================
// /api/auth/me tests
// =============================================================================

func TestHandleMe_ValidToken(t *testing.T) {
	h := newTestHandler()
	user := &GitHubUser{Username: "alice", AvatarURL: "https://github.com/alice.png"}
	accessToken, _ := h.jwtService.GenerateAccessToken(user)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.AddCookie(&http.Cookie{Name: "trex_access_token", Value: accessToken})
	w := httptest.NewRecorder()

	h.HandleMe().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["username"] != "alice" {
		t.Errorf("username = %q, want %q", resp["username"], "alice")
	}
}

func TestHandleMe_NoToken(t *testing.T) {
	h := newTestHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	w := httptest.NewRecorder()

	h.HandleMe().ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}
