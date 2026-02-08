package auth

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestAllowlist_IsAllowed(t *testing.T) {
	// Test Doc:
	// - Why: Core authorization logic
	// - Contract: Username in list → true, not in list → false

	al := NewAllowlistManager()
	al.SetUsers([]string{"alice", "bob"})

	if !al.IsAllowed("alice") {
		t.Error("alice should be allowed")
	}
	if !al.IsAllowed("bob") {
		t.Error("bob should be allowed")
	}
	if al.IsAllowed("charlie") {
		t.Error("charlie should not be allowed")
	}
}

func TestAllowlist_CaseInsensitive(t *testing.T) {
	// Test Doc:
	// - Why: GitHub usernames are case-insensitive
	// - Contract: "Alice" matches "alice" in allowlist

	al := NewAllowlistManager()
	al.SetUsers([]string{"Alice"})

	if !al.IsAllowed("alice") {
		t.Error("alice (lowercase) should match Alice")
	}
	if !al.IsAllowed("ALICE") {
		t.Error("ALICE (uppercase) should match Alice")
	}
}

func TestAllowlist_LoadFromFile(t *testing.T) {
	// Test Doc:
	// - Why: Allowlist must load from JSON file (per ADR-0006: XDG path)
	// - Contract: Valid JSON file → users loaded correctly

	dir := t.TempDir()
	path := filepath.Join(dir, "allowed_users.json")

	content := `{"version": 1, "users": ["alice", "bob", "charlie"]}`
	os.WriteFile(path, []byte(content), 0644)

	al, err := NewAllowlistFromFile(path)
	if err != nil {
		t.Fatalf("NewAllowlistFromFile() error: %v", err)
	}

	if al.Count() != 3 {
		t.Errorf("Count() = %d, want 3", al.Count())
	}
	if !al.IsAllowed("alice") {
		t.Error("alice should be allowed")
	}
}

func TestAllowlist_FileNotFound(t *testing.T) {
	// Test Doc:
	// - Why: Missing file should not crash — start with empty list
	// - Contract: File not found → empty allowlist, no error

	al, err := NewAllowlistFromFile("/nonexistent/path/allowed_users.json")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if al.Count() != 0 {
		t.Errorf("Count() = %d, want 0", al.Count())
	}
}

func TestAllowlist_InvalidJSON(t *testing.T) {
	// Test Doc:
	// - Why: Parse error must not crash — keep old list (R-09)
	// - Contract: Invalid JSON → error returned, old list preserved

	dir := t.TempDir()
	path := filepath.Join(dir, "allowed_users.json")

	// Write valid file first
	os.WriteFile(path, []byte(`{"version": 1, "users": ["alice"]}`), 0644)
	al, _ := NewAllowlistFromFile(path)

	if !al.IsAllowed("alice") {
		t.Fatal("alice should be allowed before reload")
	}

	// Now write invalid JSON
	os.WriteFile(path, []byte(`{invalid json`), 0644)
	err := al.Reload()
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}

	// Old list should be preserved
	if !al.IsAllowed("alice") {
		t.Error("alice should still be allowed after failed reload")
	}
}

func TestAllowlist_HotReload(t *testing.T) {
	// Test Doc:
	// - Why: Admin can add/remove users without restart
	// - Contract: File change → users list updates atomically

	dir := t.TempDir()
	path := filepath.Join(dir, "allowed_users.json")

	os.WriteFile(path, []byte(`{"version": 1, "users": ["alice"]}`), 0644)
	al, _ := NewAllowlistFromFile(path)

	if !al.IsAllowed("alice") {
		t.Fatal("alice should be allowed")
	}
	if al.IsAllowed("bob") {
		t.Fatal("bob should not be allowed")
	}

	// Update file
	os.WriteFile(path, []byte(`{"version": 1, "users": ["alice", "bob"]}`), 0644)
	al.Reload()

	if !al.IsAllowed("bob") {
		t.Error("bob should be allowed after reload")
	}
}

func TestAllowlist_WatchFile(t *testing.T) {
	// Test Doc:
	// - Why: File watcher triggers automatic reload
	// - Contract: Write to file → WatchFile detects and reloads

	dir := t.TempDir()
	path := filepath.Join(dir, "allowed_users.json")

	os.WriteFile(path, []byte(`{"version": 1, "users": ["alice"]}`), 0644)
	al, _ := NewAllowlistFromFile(path)

	done := make(chan struct{})
	go al.WatchFile(done)

	// Give watcher time to start
	time.Sleep(100 * time.Millisecond)

	// Update file
	os.WriteFile(path, []byte(`{"version": 1, "users": ["alice", "bob"]}`), 0644)

	// Give watcher time to detect and reload
	time.Sleep(500 * time.Millisecond)

	close(done)

	if !al.IsAllowed("bob") {
		t.Error("bob should be allowed after file watcher reload")
	}
}

func TestAllowlist_EmptyList(t *testing.T) {
	al := NewAllowlistManager()

	if al.IsAllowed("anyone") {
		t.Error("empty allowlist should deny everyone")
	}
	if al.Count() != 0 {
		t.Errorf("Count() = %d, want 0", al.Count())
	}
}

func TestAllowlist_SetUsersReplaces(t *testing.T) {
	// Test Doc:
	// - Why: SetUsers must replace, not append
	// - Contract: Second SetUsers call removes users from first call

	al := NewAllowlistManager()
	al.SetUsers([]string{"alice", "bob"})
	al.SetUsers([]string{"charlie"})

	if al.IsAllowed("alice") {
		t.Error("alice should no longer be allowed after replacement")
	}
	if !al.IsAllowed("charlie") {
		t.Error("charlie should be allowed")
	}
}
