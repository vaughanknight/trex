package terminal

import (
	"context"
	"log"
	"sync"
	"time"
)

// TmuxMonitor periodically polls tmux to detect which trex sessions are
// attached to which tmux sessions. When changes are detected, it updates
// Session.TmuxSessionName and calls the onChange callback.
type TmuxMonitor struct {
	detector TmuxDetector
	registry *SessionRegistry
	interval time.Duration
	onChange func(updates map[string]string) // sessionID → tmuxSessionName (empty = detached)

	ctx    context.Context
	cancel context.CancelFunc

	// intervalCh receives new polling intervals from UpdateInterval.
	intervalCh chan time.Duration
	wg         sync.WaitGroup
}

// NewTmuxMonitor creates a monitor. Call Start() to begin polling.
func NewTmuxMonitor(detector TmuxDetector, registry *SessionRegistry, interval time.Duration, onChange func(map[string]string)) *TmuxMonitor {
	ctx, cancel := context.WithCancel(context.Background())
	return &TmuxMonitor{
		detector:   detector,
		registry:   registry,
		interval:   interval,
		onChange:    onChange,
		ctx:        ctx,
		cancel:     cancel,
		intervalCh: make(chan time.Duration, 1),
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

	consecutiveFailures := 0
	const maxConsecutiveFailures = 3
	backoffInterval := 30 * time.Second

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

			// Handle consecutive failure backoff
			if consecutiveFailures >= maxConsecutiveFailures {
				ticker.Reset(backoffInterval)
			}
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
