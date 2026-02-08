package auth

import (
	"testing"
	"time"
)

func TestStateStore_GenerateAndValidate(t *testing.T) {
	// Test Doc:
	// - Why: CSRF protection requires valid state round-trip
	// - Contract: Generate() → Validate() returns true; second Validate() returns false (single-use)

	store := NewStateStore(10 * time.Minute)

	state, err := store.Generate()
	if err != nil {
		t.Fatalf("Generate() error: %v", err)
	}
	if state == "" {
		t.Fatal("Generate() returned empty state")
	}

	if !store.Validate(state) {
		t.Error("Validate() returned false for valid state")
	}

	// Second use should fail (single-use)
	if store.Validate(state) {
		t.Error("Validate() returned true for already-consumed state")
	}
}

func TestStateStore_InvalidState(t *testing.T) {
	// Test Doc:
	// - Why: Unknown states must be rejected
	// - Contract: Validate("unknown") → false

	store := NewStateStore(10 * time.Minute)

	if store.Validate("nonexistent") {
		t.Error("Validate() returned true for unknown state")
	}
}

func TestStateStore_ExpiredState(t *testing.T) {
	// Test Doc:
	// - Why: Expired states must be rejected (R-07: 10min TTL)
	// - Contract: State older than TTL → Validate() returns false

	store := NewStateStore(1 * time.Millisecond)

	state, err := store.Generate()
	if err != nil {
		t.Fatalf("Generate() error: %v", err)
	}

	// Wait for expiry
	time.Sleep(5 * time.Millisecond)

	if store.Validate(state) {
		t.Error("Validate() returned true for expired state")
	}
}

func TestStateStore_UniqueStates(t *testing.T) {
	// Test Doc:
	// - Why: Each state must be unique to prevent replay
	// - Contract: Multiple Generate() calls produce different states

	store := NewStateStore(10 * time.Minute)

	states := make(map[string]bool)
	for i := 0; i < 100; i++ {
		state, err := store.Generate()
		if err != nil {
			t.Fatalf("Generate() error: %v", err)
		}
		if states[state] {
			t.Fatalf("Duplicate state generated: %s", state)
		}
		states[state] = true
	}
}

func TestStateStore_Cleanup(t *testing.T) {
	// Test Doc:
	// - Why: Prevent memory leaks from unused states
	// - Contract: Cleanup() removes expired states

	store := NewStateStore(1 * time.Millisecond)

	store.Generate()
	store.Generate()
	store.Generate()

	time.Sleep(5 * time.Millisecond)
	store.Cleanup()

	store.mu.Lock()
	count := len(store.states)
	store.mu.Unlock()

	if count != 0 {
		t.Errorf("Cleanup() left %d states, want 0", count)
	}
}
