package auth

import (
	"encoding/json"
	"log"
	"os"
	"strings"
	"sync"

	"github.com/fsnotify/fsnotify"
)

// AllowlistFile represents the JSON structure of the allowlist file.
type AllowlistFile struct {
	Version int      `json:"version"`
	Users   []string `json:"users"`
}

// AllowlistManager manages the set of allowed GitHub usernames.
// Thread-safe for concurrent reads during hot reload.
type AllowlistManager struct {
	mu    sync.RWMutex
	users map[string]bool
	path  string
}

// NewAllowlistManager creates an empty AllowlistManager.
func NewAllowlistManager() *AllowlistManager {
	return &AllowlistManager{
		users: make(map[string]bool),
	}
}

// NewAllowlistFromFile creates an AllowlistManager and loads users from the given file.
// Returns the manager even if the file doesn't exist (empty allowlist with warning).
func NewAllowlistFromFile(path string) (*AllowlistManager, error) {
	m := &AllowlistManager{
		users: make(map[string]bool),
		path:  path,
	}

	if err := m.Reload(); err != nil {
		// File not found is non-fatal: start with empty list
		if os.IsNotExist(err) {
			log.Printf("Allowlist file not found at %s, starting with empty allowlist", path)
			return m, nil
		}
		return m, err
	}

	return m, nil
}

// IsAllowed checks if a username is in the allowlist.
// Comparison is case-insensitive (GitHub usernames are case-insensitive).
func (m *AllowlistManager) IsAllowed(username string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.users[strings.ToLower(username)]
}

// SetUsers replaces the allowlist with the given usernames.
func (m *AllowlistManager) SetUsers(users []string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.users = make(map[string]bool, len(users))
	for _, u := range users {
		m.users[strings.ToLower(u)] = true
	}
}

// Reload reads the allowlist file and updates the user set.
// On parse error, keeps the existing list and returns the error.
func (m *AllowlistManager) Reload() error {
	if m.path == "" {
		return nil
	}

	data, err := os.ReadFile(m.path)
	if err != nil {
		return err
	}

	var file AllowlistFile
	if err := json.Unmarshal(data, &file); err != nil {
		log.Printf("Allowlist parse error (keeping old list): %v", err)
		return err
	}

	m.SetUsers(file.Users)
	log.Printf("Allowlist reloaded: %d users", len(file.Users))
	return nil
}

// Count returns the number of allowed users.
func (m *AllowlistManager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.users)
}

// WatchFile starts watching the allowlist file for changes.
// Calls Reload() on any write/create event. Blocks until ctx is done.
// Returns immediately if path is empty.
func (m *AllowlistManager) WatchFile(done <-chan struct{}) error {
	if m.path == "" {
		return nil
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer watcher.Close()

	if err := watcher.Add(m.path); err != nil {
		// If file doesn't exist yet, watch the directory
		dir := m.path[:strings.LastIndex(m.path, "/")]
		if dir == "" {
			dir = "."
		}
		if err := watcher.Add(dir); err != nil {
			return err
		}
	}

	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return nil
			}
			if event.Has(fsnotify.Write) || event.Has(fsnotify.Create) {
				if err := m.Reload(); err != nil {
					log.Printf("Allowlist hot-reload error: %v", err)
				}
			}
		case err, ok := <-watcher.Errors:
			if !ok {
				return nil
			}
			log.Printf("Allowlist watcher error: %v", err)
		case <-done:
			return nil
		}
	}
}
