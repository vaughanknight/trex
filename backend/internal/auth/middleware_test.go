package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMiddleware_PassesWhenAuthDisabled(t *testing.T) {
	// Test Doc:
	// - Why: Feature flag controls auth enforcement (R-06)
	// - Contract: Auth disabled → all requests pass

	jwtSvc := NewJWTService("test-secret")
	middleware := Middleware(jwtSvc, false)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/sessions", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestMiddleware_RejectsWithoutToken(t *testing.T) {
	// Test Doc:
	// - Why: Security — prevent unauthorized access
	// - Contract: Auth enabled + no token → 401

	jwtSvc := NewJWTService("test-secret")
	middleware := Middleware(jwtSvc, true)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/sessions", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestMiddleware_AcceptsValidToken(t *testing.T) {
	// Test Doc:
	// - Why: Valid tokens must grant access
	// - Contract: Auth enabled + valid cookie → 200 + user in context

	jwtSvc := NewJWTService("test-secret")
	middleware := Middleware(jwtSvc, true)

	user := &GitHubUser{Username: "alice", AvatarURL: "https://github.com/alice.png"}
	token, _ := jwtSvc.GenerateAccessToken(user)

	var contextUser *GitHubUser
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contextUser = UserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/sessions", nil)
	req.AddCookie(&http.Cookie{Name: "trex_access_token", Value: token})
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
	if contextUser == nil {
		t.Fatal("user not in context")
	}
	if contextUser.Username != "alice" {
		t.Errorf("Username = %q, want %q", contextUser.Username, "alice")
	}
}

func TestMiddleware_RejectsInvalidToken(t *testing.T) {
	// Test Doc:
	// - Why: Tampered tokens must be rejected
	// - Contract: Invalid token → 401

	jwtSvc := NewJWTService("test-secret")
	middleware := Middleware(jwtSvc, true)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/sessions", nil)
	req.AddCookie(&http.Cookie{Name: "trex_access_token", Value: "invalid-token"})
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestMiddleware_AllowsPublicPaths(t *testing.T) {
	// Test Doc:
	// - Why: Public paths must be accessible without auth
	// - Contract: /api/health, /auth/*, /api/auth/enabled → pass through

	jwtSvc := NewJWTService("test-secret")
	middleware := Middleware(jwtSvc, true)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	publicPaths := []string{"/api/health", "/auth/github", "/auth/callback", "/api/auth/enabled", "/", "/assets/index-abc123.js", "/assets/index-abc123.css", "/vite.svg", "/favicon.ico"}
	for _, path := range publicPaths {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Errorf("status for %s = %d, want %d", path, w.Code, http.StatusOK)
			}
		})
	}
}

func TestMiddleware_ProtectsAPIPaths(t *testing.T) {
	// Test Doc:
	// - Why: API paths must require auth when enabled
	// - Contract: /api/sessions, /ws → 401 without token

	jwtSvc := NewJWTService("test-secret")
	middleware := Middleware(jwtSvc, true)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	protectedPaths := []string{"/api/sessions", "/api/sessions/s1", "/ws"}
	for _, path := range protectedPaths {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Errorf("status for %s = %d, want %d", path, w.Code, http.StatusUnauthorized)
			}
		})
	}
}

func TestUserFromContext_NilWhenMissing(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	user := UserFromContext(req.Context())
	if user != nil {
		t.Error("expected nil user from empty context")
	}
}
