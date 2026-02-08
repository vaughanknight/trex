package auth

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// StateStore manages CSRF state parameters for OAuth flows.
// States expire after a configurable TTL (default 10 minutes).
type StateStore struct {
	mu     sync.Mutex
	states map[string]time.Time
	ttl    time.Duration
}

// NewStateStore creates a StateStore with the given TTL.
func NewStateStore(ttl time.Duration) *StateStore {
	return &StateStore{
		states: make(map[string]time.Time),
		ttl:    ttl,
	}
}

// Generate creates a new random state parameter and stores it.
func (s *StateStore) Generate() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	state := hex.EncodeToString(b)

	s.mu.Lock()
	s.states[state] = time.Now()
	s.mu.Unlock()

	return state, nil
}

// Validate checks if a state parameter is valid and not expired.
// Valid states are consumed (single-use).
func (s *StateStore) Validate(state string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	created, ok := s.states[state]
	if !ok {
		return false
	}

	// Remove state (single-use)
	delete(s.states, state)

	// Check TTL
	if time.Since(created) > s.ttl {
		return false
	}

	return true
}

// Cleanup removes all expired states. Call periodically to prevent memory leaks.
func (s *StateStore) Cleanup() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	for state, created := range s.states {
		if now.Sub(created) > s.ttl {
			delete(s.states, state)
		}
	}
}
