package terminal

import (
	"context"
	"log"
	"sync"
	"time"
)

// TmuxMonitor periodically polls tmux to detect which trex sessions are
// attached to which tmux sessions and which tmux sessions exist on the system.
//
// Two independent polling paths run on the same ticker:
// - poll(): client attachment tracking (Plan 014) — calls onChange
// - pollSessions(): session list discovery (Plan 018) — calls onSessionsChanged
type TmuxMonitor struct {
	detector TmuxDetector
	registry *SessionRegistry
	interval time.Duration
	onChange          func(updates map[string]string)  // sessionID → tmuxSessionName (empty = detached)
	onSessionsChanged func(sessions []TmuxSessionInfo) // full session list on change

	// lastSessions caches the most recent successful ListSessions() result.
	// Used for error recovery (reuse on failure) and for GetLastSessions().
	// Protected by sessionsMu — written by pollSessions() on monitor goroutine,
	// read by GetLastSessions() from WebSocket handler goroutines.
	sessionsMu   sync.RWMutex
	lastSessions []TmuxSessionInfo

	ctx    context.Context
	cancel context.CancelFunc

	// intervalCh receives new polling intervals from UpdateInterval.
	intervalCh chan time.Duration
	wg         sync.WaitGroup
}

// NewTmuxMonitor creates a monitor. Call Start() to begin polling.
// onChange is called when client attachment state changes (Plan 014).
// onSessionsChanged is called when the tmux session list changes (Plan 018).
func NewTmuxMonitor(detector TmuxDetector, registry *SessionRegistry, interval time.Duration, onChange func(map[string]string), onSessionsChanged func([]TmuxSessionInfo)) *TmuxMonitor {
	ctx, cancel := context.WithCancel(context.Background())
	return &TmuxMonitor{
		detector:          detector,
		registry:          registry,
		interval:          interval,
		onChange:           onChange,
		onSessionsChanged: onSessionsChanged,
		ctx:               ctx,
		cancel:            cancel,
		intervalCh:        make(chan time.Duration, 1),
	}
}

// Start begins the polling loop in a goroutine. No-op if tmux is unavailable.
func (m *TmuxMonitor) Start() {
	if !m.detector.IsAvailable() {
		log.Printf("tmux not available, monitor disabled")
		return
	}

	m.wg.Add(1)
	go m.run()
	log.Printf("tmux monitor started (interval: %s)", m.interval)
}

// Stop cancels the polling loop and waits for it to finish.
func (m *TmuxMonitor) Stop() {
	m.cancel()
	m.wg.Wait()
	log.Printf("tmux monitor stopped")
}

// UpdateInterval changes the polling interval at runtime.
func (m *TmuxMonitor) UpdateInterval(d time.Duration) {
	select {
	case m.intervalCh <- d:
	default:
		// Channel full — previous update not yet consumed, skip
	}
}

// run is the polling loop.
func (m *TmuxMonitor) run() {
	defer m.wg.Done()

	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()

	for {
		select {
		case <-m.ctx.Done():
			return

		case newInterval := <-m.intervalCh:
			m.interval = newInterval
			ticker.Reset(m.interval)
			log.Printf("tmux monitor interval updated to %s", m.interval)

		case <-ticker.C:
			changes := m.poll()
			if changes != nil && len(changes) > 0 && m.onChange != nil {
				m.onChange(changes)
			}

			m.pollSessions()
		}
	}
}

// poll executes one polling cycle: snapshot → exec → apply. Returns changed sessions.
func (m *TmuxMonitor) poll() map[string]string {
	// 1. Snapshot: gather session TTY paths under read lock
	sessions := m.registry.List()
	sessionByTty := make(map[string]*Session, len(sessions))
	for _, s := range sessions {
		if s.TtyPath != "" {
			sessionByTty[s.TtyPath] = s
		}
	}

	if len(sessionByTty) == 0 {
		return nil
	}

	// 2. Exec: call tmux without holding any lock
	clients, err := m.detector.ListClients()
	if err != nil {
		log.Printf("tmux list-clients error: %v", err)
		return nil
	}

	// 3. Apply: match and detect changes
	changes := make(map[string]string)
	for ttyPath, session := range sessionByTty {
		tmuxName, attached := clients[ttyPath]
		if attached {
			// Session is attached to tmux
			if session.TmuxSessionName != tmuxName {
				session.TmuxSessionName = tmuxName
				changes[session.ID] = tmuxName
			}
		} else {
			// Session is not attached to tmux
			if session.TmuxSessionName != "" {
				session.TmuxSessionName = ""
				changes[session.ID] = ""
			}
		}
	}

	return changes
}

// pollSessions calls ListSessions and fires onSessionsChanged if the list differs
// from lastSessions. On error, the cached lastSessions is preserved (no callback).
func (m *TmuxMonitor) pollSessions() {
	sessions, err := m.detector.ListSessions()
	if err != nil {
		log.Printf("tmux list-sessions error: %v", err)
		return // Keep lastSessions cached — no callback
	}

	m.sessionsMu.RLock()
	unchanged := sessionsEqual(m.lastSessions, sessions)
	m.sessionsMu.RUnlock()
	if unchanged {
		return
	}

	m.sessionsMu.Lock()
	m.lastSessions = sessions
	m.sessionsMu.Unlock()

	if m.onSessionsChanged != nil {
		// Pass a copy to prevent callback from mutating cached state
		m.onSessionsChanged(append([]TmuxSessionInfo(nil), sessions...))
	}
}

// GetLastSessions returns a copy of the most recently observed tmux session list.
// Used by the request handler to respond to list_tmux_sessions without re-polling.
func (m *TmuxMonitor) GetLastSessions() []TmuxSessionInfo {
	m.sessionsMu.RLock()
	defer m.sessionsMu.RUnlock()
	if len(m.lastSessions) == 0 {
		return nil
	}
	result := make([]TmuxSessionInfo, len(m.lastSessions))
	copy(result, m.lastSessions)
	return result
}

// sessionsEqual compares two TmuxSessionInfo slices for equality.
func sessionsEqual(a, b []TmuxSessionInfo) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
