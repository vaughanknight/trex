package config

import (
	"fmt"
	"os"
	"strings"
)

// Config holds all server configuration loaded from environment variables.
type Config struct {
	// BindAddress is the host:port the server listens on.
	// Defaults to "127.0.0.1:3000" when auth is disabled,
	// "0.0.0.0:3000" when auth is enabled.
	BindAddress string

	// AuthEnabled controls whether GitHub OAuth authentication is required.
	// When false, server binds to localhost with no auth (default).
	// When true, server allows network binding and requires JWT for protected routes.
	AuthEnabled bool

	// GitHubClientID is the OAuth App client ID from GitHub.
	// Required when AuthEnabled is true.
	GitHubClientID string

	// GitHubClientSecret is the OAuth App client secret from GitHub.
	// Required when AuthEnabled is true.
	GitHubClientSecret string

	// GitHubCallbackURL is the OAuth callback URL (e.g., http://host:3000/auth/callback).
	// Required when AuthEnabled is true.
	GitHubCallbackURL string

	// JWTSecret is the signing key for JWT tokens.
	// Required when AuthEnabled is true.
	JWTSecret string

	// AllowlistPath is the path to the allowed_users.json file.
	// Defaults to ~/.config/trex/allowed_users.json (per ADR-0006).
	AllowlistPath string
}

// Load reads configuration from TREX_* environment variables and returns
// a Config with appropriate defaults applied.
func Load() *Config {
	authEnabled := parseBool(os.Getenv("TREX_AUTH_ENABLED"))

	bindAddress := os.Getenv("TREX_BIND_ADDRESS")
	if bindAddress == "" {
		if authEnabled {
			bindAddress = "0.0.0.0:3000"
		} else {
			bindAddress = "127.0.0.1:3000"
		}
	}

	allowlistPath := os.Getenv("TREX_ALLOWLIST_PATH")
	if allowlistPath == "" && authEnabled {
		home, _ := os.UserHomeDir()
		if home != "" {
			allowlistPath = home + "/.config/trex/allowed_users.json"
		}
	}

	return &Config{
		BindAddress:        bindAddress,
		AuthEnabled:        authEnabled,
		GitHubClientID:     os.Getenv("TREX_GITHUB_CLIENT_ID"),
		GitHubClientSecret: os.Getenv("TREX_GITHUB_CLIENT_SECRET"),
		GitHubCallbackURL:  os.Getenv("TREX_GITHUB_CALLBACK_URL"),
		JWTSecret:          os.Getenv("TREX_JWT_SECRET"),
		AllowlistPath:      allowlistPath,
	}
}

// Validate checks that the configuration is valid. When AuthEnabled is true,
// all OAuth-related fields must be set. Returns a descriptive error on failure.
func (c *Config) Validate() error {
	// Validate bind address format (must contain host:port)
	if c.BindAddress == "" || !strings.Contains(c.BindAddress, ":") {
		return fmt.Errorf("invalid bind address %q: must be in host:port format (e.g., 127.0.0.1:3000)", c.BindAddress)
	}

	if !c.AuthEnabled {
		return nil
	}

	// When auth is enabled, all OAuth fields are required
	if c.GitHubClientID == "" {
		return fmt.Errorf("TREX_GITHUB_CLIENT_ID is required when auth is enabled")
	}
	if c.GitHubClientSecret == "" {
		return fmt.Errorf("TREX_GITHUB_CLIENT_SECRET is required when auth is enabled")
	}
	if c.GitHubCallbackURL == "" {
		return fmt.Errorf("TREX_GITHUB_CALLBACK_URL is required when auth is enabled")
	}
	if c.JWTSecret == "" {
		return fmt.Errorf("TREX_JWT_SECRET is required when auth is enabled")
	}

	return nil
}

// parseBool parses common boolean string representations.
// Returns true for "true", "TRUE", "True", "1"; false for everything else.
func parseBool(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "true", "1":
		return true
	default:
		return false
	}
}
