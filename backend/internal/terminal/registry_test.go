package terminal

import (
	"fmt"
	"sync"
	"testing"
)

// Test Doc:
// - Why: SessionRegistry must be thread-safe for concurrent multi-session access
// - Contract: Registry provides Add, Get, Delete, List, Count with mutex protection
// - Usage Notes: Use RWMutex for concurrent reads, exclusive writes
// - Quality Contribution: Prevents race conditions with 30+ sessions (High Finding 06)
// - Worked Example: Add(session) → Get(id) returns session → Delete(id) → Get(id) returns nil

func TestSessionRegistry_Add(t *testing.T) {
	registry := NewSessionRegistry()

	session := &Session{ID: "s1", Name: "bash-1", ShellType: "bash"}
	registry.Add(session)

	got := registry.Get("s1")
	if got == nil {
		t.Fatal("Get returned nil, expected session")
	}
	if got.ID != "s1" {
		t.Errorf("Get().ID = %q, want %q", got.ID, "s1")
	}
	if got.Name != "bash-1" {
		t.Errorf("Get().Name = %q, want %q", got.Name, "bash-1")
	}
}

func TestSessionRegistry_Get_NotFound(t *testing.T) {
	registry := NewSessionRegistry()

	got := registry.Get("nonexistent")
	if got != nil {
		t.Errorf("Get() = %v, want nil for nonexistent ID", got)
	}
}

func TestSessionRegistry_Delete(t *testing.T) {
	registry := NewSessionRegistry()

	session := &Session{ID: "s1", Name: "bash-1"}
	registry.Add(session)

	// Verify exists
	if registry.Get("s1") == nil {
		t.Fatal("Session should exist after Add")
	}

	// Delete
	registry.Delete("s1")

	// Verify gone
	if registry.Get("s1") != nil {
		t.Error("Session should be nil after Delete")
	}
}

func TestSessionRegistry_Delete_NonExistent(t *testing.T) {
	registry := NewSessionRegistry()

	// Should not panic
	registry.Delete("nonexistent")
}

func TestSessionRegistry_List(t *testing.T) {
	registry := NewSessionRegistry()

	registry.Add(&Session{ID: "s1", Name: "bash-1"})
	registry.Add(&Session{ID: "s2", Name: "zsh-1"})
	registry.Add(&Session{ID: "s3", Name: "fish-1"})

	sessions := registry.List()

	if len(sessions) != 3 {
		t.Fatalf("List() returned %d sessions, want 3", len(sessions))
	}

	// Check all IDs present (order not guaranteed)
	ids := make(map[string]bool)
	for _, s := range sessions {
		ids[s.ID] = true
	}

	for _, id := range []string{"s1", "s2", "s3"} {
		if !ids[id] {
			t.Errorf("List() missing session %q", id)
		}
	}
}

func TestSessionRegistry_List_Empty(t *testing.T) {
	registry := NewSessionRegistry()

	sessions := registry.List()
	if sessions == nil {
		t.Error("List() should return empty slice, not nil")
	}
	if len(sessions) != 0 {
		t.Errorf("List() returned %d sessions, want 0", len(sessions))
	}
}

func TestSessionRegistry_Count(t *testing.T) {
	registry := NewSessionRegistry()

	if registry.Count() != 0 {
		t.Errorf("Count() = %d, want 0 for empty registry", registry.Count())
	}

	registry.Add(&Session{ID: "s1"})
	if registry.Count() != 1 {
		t.Errorf("Count() = %d, want 1", registry.Count())
	}

	registry.Add(&Session{ID: "s2"})
	if registry.Count() != 2 {
		t.Errorf("Count() = %d, want 2", registry.Count())
	}

	registry.Delete("s1")
	if registry.Count() != 1 {
		t.Errorf("Count() = %d, want 1 after delete", registry.Count())
	}
}

// Test Doc:
// - Why: Multi-session requires thread-safe registry access
// - Contract: Concurrent Add/Get/Delete don't race
// - Usage Notes: Use RLock for reads, Lock for writes
// - Quality Contribution: Prevents data corruption with 30+ sessions
// - Worked Example: 10 goroutines × 100 ops = no races

func TestSessionRegistry_ConcurrentOperations(t *testing.T) {
	registry := NewSessionRegistry()
	var wg sync.WaitGroup

	// Run 10 goroutines each doing 100 operations
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				id := fmt.Sprintf("session-%d-%d", workerID, j)
				session := &Session{ID: id, Name: fmt.Sprintf("shell-%d", j)}

				// Add
				registry.Add(session)

				// Get
				_ = registry.Get(id)

				// List
				_ = registry.List()

				// Count
				_ = registry.Count()

				// Delete some (not all to keep registry populated)
				if j%5 == 0 {
					registry.Delete(id)
				}
			}
		}(i)
	}

	wg.Wait()
	// Test passes if no race detected with -race flag
}

// Test Doc:
// - Why: Session IDs must be unique across concurrent session creation
// - Contract: NextID returns sequential unique IDs using atomic counter
// - Usage Notes: IDs are prefixed with "s" (e.g., "s1", "s2", "s3")
// - Quality Contribution: Ensures no ID collisions in multi-session
// - Worked Example: 100 concurrent NextID() calls → 100 unique IDs

func TestSessionRegistry_NextID_Unique(t *testing.T) {
	registry := NewSessionRegistry()
	var wg sync.WaitGroup
	ids := make(chan string, 100)

	// Generate 100 IDs concurrently
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ids <- registry.NextID()
		}()
	}

	wg.Wait()
	close(ids)

	// Collect and verify uniqueness
	seen := make(map[string]bool)
	for id := range ids {
		if seen[id] {
			t.Errorf("Duplicate ID generated: %s", id)
		}
		seen[id] = true
	}

	if len(seen) != 100 {
		t.Errorf("Expected 100 unique IDs, got %d", len(seen))
	}
}

func TestSessionRegistry_NextID_Sequential(t *testing.T) {
	registry := NewSessionRegistry()

	id1 := registry.NextID()
	id2 := registry.NextID()
	id3 := registry.NextID()

	// IDs should be sequential with "s" prefix
	if id1 != "s1" {
		t.Errorf("First ID = %q, want %q", id1, "s1")
	}
	if id2 != "s2" {
		t.Errorf("Second ID = %q, want %q", id2, "s2")
	}
	if id3 != "s3" {
		t.Errorf("Third ID = %q, want %q", id3, "s3")
	}
}
