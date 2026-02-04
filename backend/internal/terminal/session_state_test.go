package terminal

import (
	"sync"
	"testing"
)

// Test Doc:
// - Why: Session lifecycle must prevent deadlock during concurrent cancellation (Critical Finding 01)
// - Contract: Session state machine transitions atomically: Running → Closing → Closed
// - Usage Notes: Use atomic.Int32 for state; idempotent Close() prevents double-free
// - Quality Contribution: Prevents goroutine deadlock in multi-session scenarios
// - Worked Example: session.Close() → State() == SessionStateClosed; second Close() is no-op

func TestSession_InitialState(t *testing.T) {
	session := &Session{}
	session.initState()

	if session.State() != SessionStateRunning {
		t.Errorf("Initial state = %v, want %v", session.State(), SessionStateRunning)
	}
}

func TestSession_StateTransition_ToClosing(t *testing.T) {
	session := &Session{}
	session.initState()

	// Transition to closing
	changed := session.transitionTo(SessionStateClosing)
	if !changed {
		t.Error("transitionTo(Closing) should return true")
	}

	if session.State() != SessionStateClosing {
		t.Errorf("State = %v, want %v", session.State(), SessionStateClosing)
	}
}

func TestSession_StateTransition_ToClosed(t *testing.T) {
	session := &Session{}
	session.initState()

	// Closing first
	session.transitionTo(SessionStateClosing)

	// Then closed
	changed := session.transitionTo(SessionStateClosed)
	if !changed {
		t.Error("transitionTo(Closed) should return true")
	}

	if session.State() != SessionStateClosed {
		t.Errorf("State = %v, want %v", session.State(), SessionStateClosed)
	}
}

func TestSession_StateTransition_NoBackward(t *testing.T) {
	session := &Session{}
	session.initState()

	// Transition to closed
	session.transitionTo(SessionStateClosing)
	session.transitionTo(SessionStateClosed)

	// Try to go back to running - should fail
	changed := session.transitionTo(SessionStateRunning)
	if changed {
		t.Error("transitionTo(Running) from Closed should return false")
	}

	// State should still be Closed
	if session.State() != SessionStateClosed {
		t.Errorf("State = %v, want %v (should not change)", session.State(), SessionStateClosed)
	}
}

func TestSession_Close_Idempotent(t *testing.T) {
	fakePTY := NewFakePTY()
	fakeWS := NewFakeWebSocket()

	session := NewSession(fakePTY, fakeWS)

	// First close should succeed
	session.CloseGracefully()

	// Second close should be a no-op (not panic or double-close)
	session.CloseGracefully() // Should not panic

	// Verify PTY closed (WebSocket is not closed in multi-session mode as it may be shared)
	if !fakePTY.Closed {
		t.Error("PTY should be closed")
	}
	// Note: WebSocket is NOT closed by CloseGracefully in multi-session mode
	// because the connection may be shared across sessions

	// State should be closed
	if session.State() != SessionStateClosed {
		t.Errorf("State = %v, want %v", session.State(), SessionStateClosed)
	}
}

func TestSession_IsRunning(t *testing.T) {
	session := &Session{}
	session.initState()

	if !session.IsRunning() {
		t.Error("IsRunning() should be true initially")
	}

	session.transitionTo(SessionStateClosing)
	if session.IsRunning() {
		t.Error("IsRunning() should be false after transition to Closing")
	}

	session.transitionTo(SessionStateClosed)
	if session.IsRunning() {
		t.Error("IsRunning() should be false when Closed")
	}
}

// Test Doc:
// - Why: Concurrent close attempts must be safe (Critical Finding 01)
// - Contract: Multiple goroutines calling CloseGracefully() don't cause races or panics
// - Usage Notes: Atomic state prevents double-free
// - Quality Contribution: Prevents deadlock with 30+ sessions closing

func TestSession_ConcurrentClose(t *testing.T) {
	fakePTY := NewFakePTY()
	fakeWS := NewFakeWebSocket()

	session := NewSession(fakePTY, fakeWS)

	var wg sync.WaitGroup

	// 10 goroutines trying to close simultaneously
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			session.CloseGracefully()
		}()
	}

	wg.Wait()

	// Should be closed without panic
	if session.State() != SessionStateClosed {
		t.Errorf("State = %v, want %v", session.State(), SessionStateClosed)
	}
}
