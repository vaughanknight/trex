package config

import (
	"strings"
	"testing"
)

// =============================================================================
// T002: Config Loading Tests
// =============================================================================

func TestConfig_LoadFromEnv(t *testing.T) {
	// Test Doc:
	// - Why: Ensure all TREX_* env vars map to Config fields
	// - Contract: Set env vars → Load() returns matching Config
	// - Usage Notes: Uses t.Setenv for safe env manipulation
	// - Quality Contribution: Prevents misconfiguration causing auth failures
	// - Worked Example: TREX_BIND_ADDRESS=0.0.0.0:3000 → BindAddress="0.0.0.0:3000"

	t.Setenv("TREX_BIND_ADDRESS", "0.0.0.0:8080")
	t.Setenv("TREX_AUTH_ENABLED", "true")
	t.Setenv("TREX_GITHUB_CLIENT_ID", "test-client-id")
	t.Setenv("TREX_GITHUB_CLIENT_SECRET", "test-client-secret")
	t.Setenv("TREX_GITHUB_CALLBACK_URL", "http://myhost:3000/auth/callback")
	t.Setenv("TREX_JWT_SECRET", "my-jwt-secret")

	cfg := Load()

	if cfg.BindAddress != "0.0.0.0:8080" {
		t.Errorf("BindAddress = %q, want %q", cfg.BindAddress, "0.0.0.0:8080")
	}
	if cfg.AuthEnabled != true {
		t.Errorf("AuthEnabled = %v, want true", cfg.AuthEnabled)
	}
	if cfg.GitHubClientID != "test-client-id" {
		t.Errorf("GitHubClientID = %q, want %q", cfg.GitHubClientID, "test-client-id")
	}
	if cfg.GitHubClientSecret != "test-client-secret" {
		t.Errorf("GitHubClientSecret = %q, want %q", cfg.GitHubClientSecret, "test-client-secret")
	}
	if cfg.GitHubCallbackURL != "http://myhost:3000/auth/callback" {
		t.Errorf("GitHubCallbackURL = %q, want %q", cfg.GitHubCallbackURL, "http://myhost:3000/auth/callback")
	}
	if cfg.JWTSecret != "my-jwt-secret" {
		t.Errorf("JWTSecret = %q, want %q", cfg.JWTSecret, "my-jwt-secret")
	}
}

func TestConfig_DefaultsWhenNoEnvVars(t *testing.T) {
	// Test Doc:
	// - Why: Backward compatibility — no env vars must produce safe defaults
	// - Contract: No env vars → AuthEnabled=false, BindAddress="127.0.0.1:3000"
	// - Quality Contribution: Ensures existing users see no behavior change

	cfg := Load()

	if cfg.AuthEnabled != false {
		t.Errorf("AuthEnabled = %v, want false", cfg.AuthEnabled)
	}
	if cfg.BindAddress != "127.0.0.1:3000" {
		t.Errorf("BindAddress = %q, want %q", cfg.BindAddress, "127.0.0.1:3000")
	}
	if cfg.GitHubClientID != "" {
		t.Errorf("GitHubClientID = %q, want empty", cfg.GitHubClientID)
	}
	if cfg.GitHubClientSecret != "" {
		t.Errorf("GitHubClientSecret = %q, want empty", cfg.GitHubClientSecret)
	}
	if cfg.GitHubCallbackURL != "" {
		t.Errorf("GitHubCallbackURL = %q, want empty", cfg.GitHubCallbackURL)
	}
	if cfg.JWTSecret != "" {
		t.Errorf("JWTSecret = %q, want empty", cfg.JWTSecret)
	}
}

func TestConfig_AuthEnabledParsing(t *testing.T) {
	// Test Doc:
	// - Why: Bool parsing must handle common representations
	// - Contract: "true"/"1" → true; "false"/"0"/"" → false
	// - Quality Contribution: Prevents surprise auth behavior from typos

	tests := []struct {
		envValue string
		want     bool
	}{
		{"true", true},
		{"TRUE", true},
		{"True", true},
		{"1", true},
		{"false", false},
		{"FALSE", false},
		{"0", false},
		{"", false},
		{"invalid", false},
	}

	for _, tt := range tests {
		t.Run("value_"+tt.envValue, func(t *testing.T) {
			t.Setenv("TREX_AUTH_ENABLED", tt.envValue)
			cfg := Load()
			if cfg.AuthEnabled != tt.want {
				t.Errorf("AuthEnabled for %q = %v, want %v", tt.envValue, cfg.AuthEnabled, tt.want)
			}
		})
	}
}

// =============================================================================
// T003: Feature Flag Binding Tests
// =============================================================================

func TestConfig_DefaultBindAddress_AuthDisabled(t *testing.T) {
	// Test Doc:
	// - Why: Security — auth off MUST default to localhost
	// - Contract: AuthEnabled=false → BindAddress="127.0.0.1:3000"
	// - Quality Contribution: Prevents accidental network exposure (R-02)

	t.Setenv("TREX_AUTH_ENABLED", "false")

	cfg := Load()

	if cfg.BindAddress != "127.0.0.1:3000" {
		t.Errorf("BindAddress = %q, want %q", cfg.BindAddress, "127.0.0.1:3000")
	}
}

func TestConfig_DefaultBindAddress_AuthEnabled(t *testing.T) {
	// Test Doc:
	// - Why: Auth enabled should default to network binding for remote access
	// - Contract: AuthEnabled=true, no explicit bind → BindAddress="0.0.0.0:3000"
	// - Quality Contribution: Enables remote access when auth is configured

	t.Setenv("TREX_AUTH_ENABLED", "true")

	cfg := Load()

	if cfg.BindAddress != "0.0.0.0:3000" {
		t.Errorf("BindAddress = %q, want %q", cfg.BindAddress, "0.0.0.0:3000")
	}
}

func TestConfig_ExplicitBindAddress_Overrides(t *testing.T) {
	// Test Doc:
	// - Why: User should be able to override default bind address
	// - Contract: Explicit TREX_BIND_ADDRESS takes precedence over flag default
	// - Quality Contribution: Supports custom network configurations

	t.Setenv("TREX_AUTH_ENABLED", "true")
	t.Setenv("TREX_BIND_ADDRESS", "192.168.1.100:9090")

	cfg := Load()

	if cfg.BindAddress != "192.168.1.100:9090" {
		t.Errorf("BindAddress = %q, want %q", cfg.BindAddress, "192.168.1.100:9090")
	}
}

func TestConfig_ExplicitBindAddress_AuthDisabled(t *testing.T) {
	// Test Doc:
	// - Why: Explicit bind address should work even with auth disabled
	// - Contract: TREX_BIND_ADDRESS set → used regardless of auth flag
	// - Quality Contribution: Allows custom localhost port without auth

	t.Setenv("TREX_AUTH_ENABLED", "false")
	t.Setenv("TREX_BIND_ADDRESS", "127.0.0.1:9090")

	cfg := Load()

	if cfg.BindAddress != "127.0.0.1:9090" {
		t.Errorf("BindAddress = %q, want %q", cfg.BindAddress, "127.0.0.1:9090")
	}
}

// =============================================================================
// T004: Startup Validation Error Tests
// =============================================================================

func TestValidate_AuthEnabled_MissingClientID(t *testing.T) {
	// Test Doc:
	// - Why: Fail-fast when auth enabled but missing required config
	// - Contract: AuthEnabled + no CLIENT_ID → error
	// - Quality Contribution: Prevents broken auth deployment

	cfg := &Config{
		AuthEnabled:        true,
		GitHubClientSecret: "secret",
		GitHubCallbackURL:  "http://localhost/callback",
		JWTSecret:          "jwt-secret",
		BindAddress:        "0.0.0.0:3000",
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "TREX_GITHUB_CLIENT_ID") {
		t.Errorf("error = %q, want it to mention TREX_GITHUB_CLIENT_ID", err.Error())
	}
}

func TestValidate_AuthEnabled_MissingClientSecret(t *testing.T) {
	// Test Doc:
	// - Why: Fail-fast when auth enabled but missing client secret
	// - Contract: AuthEnabled + no CLIENT_SECRET → error

	cfg := &Config{
		AuthEnabled:       true,
		GitHubClientID:    "client-id",
		GitHubCallbackURL: "http://localhost/callback",
		JWTSecret:         "jwt-secret",
		BindAddress:       "0.0.0.0:3000",
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "TREX_GITHUB_CLIENT_SECRET") {
		t.Errorf("error = %q, want it to mention TREX_GITHUB_CLIENT_SECRET", err.Error())
	}
}

func TestValidate_AuthEnabled_MissingCallbackURL(t *testing.T) {
	// Test Doc:
	// - Why: Fail-fast when auth enabled but missing callback URL
	// - Contract: AuthEnabled + no CALLBACK_URL → error

	cfg := &Config{
		AuthEnabled:        true,
		GitHubClientID:     "client-id",
		GitHubClientSecret: "secret",
		JWTSecret:          "jwt-secret",
		BindAddress:        "0.0.0.0:3000",
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "TREX_GITHUB_CALLBACK_URL") {
		t.Errorf("error = %q, want it to mention TREX_GITHUB_CALLBACK_URL", err.Error())
	}
}

func TestValidate_AuthEnabled_MissingJWTSecret(t *testing.T) {
	// Test Doc:
	// - Why: Fail-fast when auth enabled but missing JWT secret
	// - Contract: AuthEnabled + no JWT_SECRET → error

	cfg := &Config{
		AuthEnabled:        true,
		GitHubClientID:     "client-id",
		GitHubClientSecret: "secret",
		GitHubCallbackURL:  "http://localhost/callback",
		BindAddress:        "0.0.0.0:3000",
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "TREX_JWT_SECRET") {
		t.Errorf("error = %q, want it to mention TREX_JWT_SECRET", err.Error())
	}
}

func TestValidate_AuthDisabled_NoRequiredVars(t *testing.T) {
	// Test Doc:
	// - Why: Auth disabled → no OAuth vars required
	// - Contract: AuthEnabled=false → Validate() returns nil
	// - Quality Contribution: Backward compat — no env vars needed when auth off

	cfg := &Config{
		AuthEnabled: false,
		BindAddress: "127.0.0.1:3000",
	}

	err := cfg.Validate()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestValidate_AuthEnabled_AllPresent(t *testing.T) {
	// Test Doc:
	// - Why: Happy path — all required vars present
	// - Contract: All fields set → Validate() returns nil

	cfg := &Config{
		AuthEnabled:        true,
		GitHubClientID:     "client-id",
		GitHubClientSecret: "secret",
		GitHubCallbackURL:  "http://localhost/callback",
		JWTSecret:          "jwt-secret",
		BindAddress:        "0.0.0.0:3000",
	}

	err := cfg.Validate()
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestValidate_InvalidBindAddress_NoPort(t *testing.T) {
	// Test Doc:
	// - Why: Validate bind address format to catch typos
	// - Contract: Invalid host:port format → error

	cfg := &Config{
		AuthEnabled: false,
		BindAddress: "not-a-host-port",
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "invalid bind address") {
		t.Errorf("error = %q, want it to mention 'invalid bind address'", err.Error())
	}
}

func TestValidate_InvalidBindAddress_Empty(t *testing.T) {
	// Test Doc:
	// - Why: Empty bind address should be caught
	// - Contract: Empty BindAddress → error

	cfg := &Config{
		AuthEnabled: false,
		BindAddress: "",
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "invalid bind address") {
		t.Errorf("error = %q, want it to mention 'invalid bind address'", err.Error())
	}
}
