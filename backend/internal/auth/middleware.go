package auth

import (
	"context"
	"net/http"
)

// contextKey is a private type for context keys in this package.
type contextKey string

const userContextKey contextKey = "authUser"

// UserFromContext extracts the authenticated GitHubUser from the request context.
// Returns nil if not authenticated.
func UserFromContext(ctx context.Context) *GitHubUser {
	user, _ := ctx.Value(userContextKey).(*GitHubUser)
	return user
}

// WithUser adds a GitHubUser to the context.
func WithUser(ctx context.Context, user *GitHubUser) context.Context {
	return context.WithValue(ctx, userContextKey, user)
}

// Middleware returns HTTP middleware that validates JWT tokens from cookies.
// When authEnabled is false, all requests pass through (no auth enforced).
// When authEnabled is true, requests without valid tokens get 401.
// Public paths (like /auth/*, /api/health, /api/auth/enabled) are never protected.
func Middleware(jwtService *JWTService, authEnabled bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip auth for public paths
			if isPublicPath(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			// If auth is disabled, pass through
			if !authEnabled {
				next.ServeHTTP(w, r)
				return
			}

			// Extract token from cookie
			cookie, err := r.Cookie("trex_access_token")
			if err != nil {
				http.Error(w, "authentication required", http.StatusUnauthorized)
				return
			}

			claims, err := jwtService.ValidateToken(cookie.Value)
			if err != nil {
				http.Error(w, "invalid or expired token", http.StatusUnauthorized)
				return
			}

			// Add user to context
			user := &GitHubUser{
				Username:  claims.Username,
				AvatarURL: claims.AvatarURL,
			}
			ctx := WithUser(r.Context(), user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// isPublicPath returns true for paths that don't require authentication.
func isPublicPath(path string) bool {
	switch {
	case path == "/api/health":
		return true
	case path == "/api/auth/enabled":
		return true
	case len(path) >= 6 && path[:6] == "/auth/":
		return true
	case path == "/":
		return true
	default:
		return false
	}
}
