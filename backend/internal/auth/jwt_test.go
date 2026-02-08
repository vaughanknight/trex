package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestJWT_GenerateAndValidateAccessToken(t *testing.T) {
	// Test Doc:
	// - Why: Access tokens must round-trip through sign/verify
	// - Contract: GenerateAccessToken → ValidateToken returns correct claims

	svc := NewJWTService("test-secret")
	user := &GitHubUser{Username: "alice", AvatarURL: "https://github.com/alice.png"}

	token, err := svc.GenerateAccessToken(user)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error: %v", err)
	}

	claims, err := svc.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken() error: %v", err)
	}

	if claims.Username != "alice" {
		t.Errorf("Username = %q, want %q", claims.Username, "alice")
	}
	if claims.AvatarURL != "https://github.com/alice.png" {
		t.Errorf("AvatarURL = %q, want %q", claims.AvatarURL, "https://github.com/alice.png")
	}
	if claims.Issuer != "trex" {
		t.Errorf("Issuer = %q, want %q", claims.Issuer, "trex")
	}
}

func TestJWT_GenerateAndValidateRefreshToken(t *testing.T) {
	// Test Doc:
	// - Why: Refresh tokens have longer TTL for silent renewal
	// - Contract: GenerateRefreshToken → ValidateToken returns correct claims

	svc := NewJWTService("test-secret")
	user := &GitHubUser{Username: "bob", AvatarURL: "https://github.com/bob.png"}

	token, err := svc.GenerateRefreshToken(user)
	if err != nil {
		t.Fatalf("GenerateRefreshToken() error: %v", err)
	}

	claims, err := svc.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken() error: %v", err)
	}

	if claims.Username != "bob" {
		t.Errorf("Username = %q, want %q", claims.Username, "bob")
	}
}

func TestJWT_RejectsExpiredToken(t *testing.T) {
	// Test Doc:
	// - Why: Expired tokens must be rejected for security
	// - Contract: Token past ExpiresAt → ValidateToken returns error

	svc := &JWTService{
		secret:         []byte("test-secret"),
		accessTokenTTL: 1 * time.Millisecond,
	}
	user := &GitHubUser{Username: "alice", AvatarURL: ""}

	token, err := svc.GenerateAccessToken(user)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error: %v", err)
	}

	time.Sleep(5 * time.Millisecond)

	_, err = svc.ValidateToken(token)
	if err == nil {
		t.Fatal("expected error for expired token, got nil")
	}
}

func TestJWT_RejectsTamperedToken(t *testing.T) {
	// Test Doc:
	// - Why: Tampered tokens must be rejected
	// - Contract: Modified token string → ValidateToken returns error

	svc := NewJWTService("test-secret")
	user := &GitHubUser{Username: "alice", AvatarURL: ""}

	token, err := svc.GenerateAccessToken(user)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error: %v", err)
	}

	// Tamper with the token
	tampered := token + "tampered"

	_, err = svc.ValidateToken(tampered)
	if err == nil {
		t.Fatal("expected error for tampered token, got nil")
	}
}

func TestJWT_RejectsWrongSecret(t *testing.T) {
	// Test Doc:
	// - Why: Token signed with different secret must be rejected
	// - Contract: Different signing key → ValidateToken returns error

	svc1 := NewJWTService("secret-1")
	svc2 := NewJWTService("secret-2")
	user := &GitHubUser{Username: "alice", AvatarURL: ""}

	token, err := svc1.GenerateAccessToken(user)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error: %v", err)
	}

	_, err = svc2.ValidateToken(token)
	if err == nil {
		t.Fatal("expected error for wrong secret, got nil")
	}
}

func TestJWT_RejectsEmptyToken(t *testing.T) {
	svc := NewJWTService("test-secret")

	_, err := svc.ValidateToken("")
	if err == nil {
		t.Fatal("expected error for empty token, got nil")
	}
}

func TestJWT_AccessTokenExpiry(t *testing.T) {
	// Test Doc:
	// - Why: Access token TTL must be 15 minutes
	// - Contract: Token ExpiresAt is ~15 minutes from now

	svc := NewJWTService("test-secret")
	user := &GitHubUser{Username: "alice", AvatarURL: ""}

	token, _ := svc.GenerateAccessToken(user)
	claims, _ := svc.ValidateToken(token)

	expiry := claims.ExpiresAt.Time
	expected := time.Now().Add(15 * time.Minute)

	// Allow 5 second tolerance
	diff := expected.Sub(expiry)
	if diff < -5*time.Second || diff > 5*time.Second {
		t.Errorf("Access token expiry off by %v", diff)
	}
}

func TestJWT_RejectsNoneAlgorithm(t *testing.T) {
	// Test Doc:
	// - Why: "none" algorithm attack must be prevented
	// - Contract: Token with alg:none → rejected

	// Craft a token with "none" algorithm
	token := jwt.NewWithClaims(jwt.SigningMethodNone, &TokenClaims{
		Username: "attacker",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	tokenString, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

	svc := NewJWTService("test-secret")
	_, err := svc.ValidateToken(tokenString)
	if err == nil {
		t.Fatal("expected error for none algorithm, got nil")
	}
}
