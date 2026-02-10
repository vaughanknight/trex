package terminal

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

// SessionStatus represents the lifecycle state of a session.
type SessionStatus string

const (
	// SessionStatusConnecting is the initial state during session setup.
	SessionStatusConnecting SessionStatus = "connecting"
	// SessionStatusActive is the state when session is fully operational.
	SessionStatusActive SessionStatus = "active"
	// SessionStatusExited is the terminal state after session ends.
	SessionStatusExited SessionStatus = "exited"
)

// SessionRegistry is a thread-safe registry for terminal sessions.
// It uses RWMutex to allow concurrent reads while ensuring exclusive writes.
type SessionRegistry struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	counter  atomic.Uint64
}

// NewSessionRegistry creates a new empty session registry.
func NewSessionRegistry() *SessionRegistry {
	return &SessionRegistry{
		sessions: make(map[string]*Session),
	}
}

// NextID generates a unique session ID using an atomic counter.
// IDs are formatted as "s1", "s2", "s3", etc.
func (r *SessionRegistry) NextID() string {
	n := r.counter.Add(1)
	return fmt.Sprintf("s%d", n)
}

// Add registers a session in the registry.
// If a session with the same ID exists, it will be overwritten.
func (r *SessionRegistry) Add(session *Session) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sessions[session.ID] = session
}

// Get retrieves a session by ID.
// Returns nil if the session doesn't exist.
func (r *SessionRegistry) Get(id string) *Session {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.sessions[id]
}

// Delete removes a session from the registry.
// No-op if session doesn't exist.
func (r *SessionRegistry) Delete(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.sessions, id)
}

// List returns all sessions in the registry.
// Returns an empty slice (not nil) if registry is empty.
func (r *SessionRegistry) List() []*Session {
	r.mu.RLock()
	defer r.mu.RUnlock()

	sessions := make([]*Session, 0, len(r.sessions))
	for _, s := range r.sessions {
		sessions = append(sessions, s)
	}
	return sessions
}

// ListByOwner returns sessions owned by the given username.
// If owner is empty, returns all sessions (for backward compat when auth disabled).
func (r *SessionRegistry) ListByOwner(owner string) []*Session {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if owner == "" {
		sessions := make([]*Session, 0, len(r.sessions))
		for _, s := range r.sessions {
			sessions = append(sessions, s)
		}
		return sessions
	}

	sessions := make([]*Session, 0)
	for _, s := range r.sessions {
		if s.Owner == owner {
			sessions = append(sessions, s)
		}
	}
	return sessions
}

// ListByTmuxSession returns all sessions attached to the given tmux session name.
// Returns an empty slice (not nil) if no sessions match.
// Used by Plan 013 (Session Metadata API) for tmux-targeted updates.
func (r *SessionRegistry) ListByTmuxSession(name string) []*Session {
	r.mu.RLock()
	defer r.mu.RUnlock()

	sessions := make([]*Session, 0)
	for _, s := range r.sessions {
		if s.TmuxSessionName == name {
			sessions = append(sessions, s)
		}
	}
	return sessions
}

// Count returns the number of sessions in the registry.
func (r *SessionRegistry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.sessions)
}

// SessionInfo represents the metadata of a session for REST API responses.
type SessionInfo struct {
	ID               string        `json:"id"`
	Name             string        `json:"name"`
	ShellType        string        `json:"shellType"`
	Status           SessionStatus `json:"status"`
	CreatedAt        time.Time     `json:"createdAt"`
	Owner            string        `json:"owner,omitempty"`
	TmuxSessionName  string        `json:"tmuxSessionName,omitempty"`
}

// Info returns the session metadata suitable for API responses.
func (s *Session) Info() SessionInfo {
	return SessionInfo{
		ID:              s.ID,
		Name:            s.Name,
		ShellType:       s.ShellType,
		Status:          s.Status,
		CreatedAt:       s.CreatedAt,
		Owner:           s.Owner,
		TmuxSessionName: s.TmuxSessionName,
	}
}
