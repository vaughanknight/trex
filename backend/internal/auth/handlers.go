package auth

import (
	"encoding/json"
	"net/http"
	"time"
)

// AuthHandler holds dependencies for OAuth HTTP handlers.
type AuthHandler struct {
	provider   OAuthProvider
	stateStore *StateStore
	jwtService *JWTService
	allowlist  *AllowlistManager
	enabled    bool
}

// NewAuthHandler creates an AuthHandler with the given dependencies.
// allowlist may be nil if allowlist enforcement is not needed.
func NewAuthHandler(provider OAuthProvider, stateStore *StateStore, jwtService *JWTService, enabled bool) *AuthHandler {
	return &AuthHandler{
		provider:   provider,
		stateStore: stateStore,
		jwtService: jwtService,
		enabled:    enabled,
	}
}

// SetAllowlist sets the allowlist manager for user enforcement.
func (h *AuthHandler) SetAllowlist(al *AllowlistManager) {
	h.allowlist = al
}

// HandleGitHubLogin redirects to GitHub's OAuth authorization page.
func (h *AuthHandler) HandleGitHubLogin() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		state, err := h.stateStore.Generate()
		if err != nil {
			http.Error(w, "failed to generate state", http.StatusInternalServerError)
			return
		}

		url := h.provider.AuthURL(state)
		http.Redirect(w, r, url, http.StatusFound)
	}
}

// HandleCallback processes the OAuth callback from GitHub.
func (h *AuthHandler) HandleCallback() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		code := r.URL.Query().Get("code")
		state := r.URL.Query().Get("state")

		if code == "" {
			http.Error(w, "missing authorization code", http.StatusBadRequest)
			return
		}

		if !h.stateStore.Validate(state) {
			http.Error(w, "invalid or expired state parameter", http.StatusBadRequest)
			return
		}

		user, err := h.provider.Exchange(code)
		if err != nil {
			http.Error(w, "failed to exchange authorization code", http.StatusBadGateway)
			return
		}

		// Check allowlist if configured
		if h.allowlist != nil && !h.allowlist.IsAllowed(user.Username) {
			http.Error(w, "access denied: user not in allowlist", http.StatusForbidden)
			return
		}

		// Generate tokens
		accessToken, err := h.jwtService.GenerateAccessToken(user)
		if err != nil {
			http.Error(w, "failed to generate access token", http.StatusInternalServerError)
			return
		}

		refreshToken, err := h.jwtService.GenerateRefreshToken(user)
		if err != nil {
			http.Error(w, "failed to generate refresh token", http.StatusInternalServerError)
			return
		}

		// Set httpOnly cookies (R-04)
		http.SetCookie(w, &http.Cookie{
			Name:     "trex_access_token",
			Value:    accessToken,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   900, // 15 minutes
		})

		http.SetCookie(w, &http.Cookie{
			Name:     "trex_refresh_token",
			Value:    refreshToken,
			Path:     "/auth/refresh",
			HttpOnly: true,
			SameSite: http.SameSiteStrictMode,
			MaxAge:   604800, // 7 days
		})

		http.Redirect(w, r, "/", http.StatusFound)
	}
}

// HandleLogout clears authentication cookies.
func (h *AuthHandler) HandleLogout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Clear access token
		http.SetCookie(w, &http.Cookie{
			Name:     "trex_access_token",
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			MaxAge:   -1,
		})

		// Clear refresh token
		http.SetCookie(w, &http.Cookie{
			Name:     "trex_refresh_token",
			Value:    "",
			Path:     "/auth/refresh",
			HttpOnly: true,
			MaxAge:   -1,
		})

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "logged_out"})
	}
}

// HandleRefresh issues a new access token from a valid refresh token.
func (h *AuthHandler) HandleRefresh() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		cookie, err := r.Cookie("trex_refresh_token")
		if err != nil {
			http.Error(w, "missing refresh token", http.StatusUnauthorized)
			return
		}

		claims, err := h.jwtService.ValidateToken(cookie.Value)
		if err != nil {
			http.Error(w, "invalid refresh token", http.StatusUnauthorized)
			return
		}

		user := &GitHubUser{
			Username:  claims.Username,
			AvatarURL: claims.AvatarURL,
		}

		accessToken, err := h.jwtService.GenerateAccessToken(user)
		if err != nil {
			http.Error(w, "failed to generate access token", http.StatusInternalServerError)
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name:     "trex_access_token",
			Value:    accessToken,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   900,
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "refreshed"})
	}
}

// HandleAuthEnabled returns the auth feature flag status.
func (h *AuthHandler) HandleAuthEnabled() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"enabled": h.enabled})
	}
}

// HandleMe returns the current authenticated user info from the access token cookie.
func (h *AuthHandler) HandleMe() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		cookie, err := r.Cookie("trex_access_token")
		if err != nil {
			http.Error(w, "not authenticated", http.StatusUnauthorized)
			return
		}

		claims, err := h.jwtService.ValidateToken(cookie.Value)
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"username":   claims.Username,
			"avatar_url": claims.AvatarURL,
		})
	}
}

// RegisterRoutes registers all auth-related routes on the given mux.
// Routes are only functional when auth is enabled; when disabled,
// /api/auth/enabled still returns {"enabled": false}.
func (h *AuthHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/auth/github", h.HandleGitHubLogin())
	mux.HandleFunc("/auth/callback", h.HandleCallback())
	mux.HandleFunc("/auth/logout", h.HandleLogout())
	mux.HandleFunc("/auth/refresh", h.HandleRefresh())
	mux.HandleFunc("/api/auth/enabled", h.HandleAuthEnabled())
	mux.HandleFunc("/api/auth/me", h.HandleMe())
}

// defaultStateTTL is the default CSRF state TTL per R-07.
const defaultStateTTL = 10 * time.Minute
