package copilot

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// TodoStatus represents the status of a todo item.
type TodoStatus string

const (
	StatusPending    TodoStatus = "pending"
	StatusInProgress TodoStatus = "in_progress"
	StatusDone       TodoStatus = "done"
	StatusBlocked    TodoStatus = "blocked"
)

// TodoItem represents a single todo from the Copilot session DB.
type TodoItem struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description,omitempty"`
	Status      TodoStatus `json:"status"`
}

// PhaseProgress represents aggregated progress for a phase-like grouping.
type PhaseProgress struct {
	Total      int `json:"total"`
	Done       int `json:"done"`
	InProgress int `json:"inProgress"`
	Blocked    int `json:"blocked"`
	Pending    int `json:"pending"`
}

// PhaseInfo represents a detected phase grouping.
type PhaseInfo struct {
	Name     string        `json:"name"`
	Progress PhaseProgress `json:"progress"`
}

// CopilotData is the complete plugin data payload.
type CopilotData struct {
	Tasks   []TodoItem    `json:"tasks"`
	Phases  []PhaseInfo   `json:"phases"`
	Summary PhaseProgress `json:"summary"`
}

// ReadSessionDB reads todos from the most recently modified Copilot CLI session database.
func ReadSessionDB() (json.RawMessage, error) {
	dbPath, err := findLatestSessionDB()
	if err != nil {
		return nil, err
	}
	if dbPath == "" {
		return nil, nil // No session DB found
	}

	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		return nil, err
	}
	defer db.Close()

	// Check if todos table exists
	var tableName string
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='todos'").Scan(&tableName)
	if err != nil {
		return nil, nil // No todos table — not a problem, just no data
	}

	rows, err := db.Query("SELECT id, title, COALESCE(description,''), COALESCE(status,'pending') FROM todos ORDER BY created_at")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []TodoItem
	summary := PhaseProgress{}

	for rows.Next() {
		var t TodoItem
		if err := rows.Scan(&t.ID, &t.Title, &t.Description, &t.Status); err != nil {
			continue
		}
		tasks = append(tasks, t)
		switch t.Status {
		case StatusDone:
			summary.Done++
		case StatusInProgress:
			summary.InProgress++
		case StatusBlocked:
			summary.Blocked++
		default:
			summary.Pending++
		}
		summary.Total++
	}

	if len(tasks) == 0 {
		return nil, nil // No todos
	}

	// Group tasks into phases by ID prefix (e.g., "p3-t001" → "p3")
	phaseMap := make(map[string]*PhaseInfo)
	var phaseOrder []string
	for _, t := range tasks {
		prefix := t.ID
		if idx := strings.Index(t.ID, "-"); idx > 0 {
			prefix = t.ID[:idx]
		}
		pi, exists := phaseMap[prefix]
		if !exists {
			pi = &PhaseInfo{Name: prefix}
			phaseMap[prefix] = pi
			phaseOrder = append(phaseOrder, prefix)
		}
		pi.Progress.Total++
		switch t.Status {
		case StatusDone:
			pi.Progress.Done++
		case StatusInProgress:
			pi.Progress.InProgress++
		case StatusBlocked:
			pi.Progress.Blocked++
		default:
			pi.Progress.Pending++
		}
	}
	var phases []PhaseInfo
	for _, key := range phaseOrder {
		phases = append(phases, *phaseMap[key])
	}

	data := CopilotData{Tasks: tasks, Phases: phases, Summary: summary}
	return json.Marshal(data)
}

// findLatestSessionDB finds the most recently modified session.db in ~/.copilot/session-state/.
func findLatestSessionDB() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	stateDir := filepath.Join(home, ".copilot", "session-state")
	entries, err := os.ReadDir(stateDir)
	if err != nil {
		return "", nil // Directory doesn't exist — no error
	}

	type dbEntry struct {
		path    string
		modTime time.Time
	}
	var dbs []dbEntry

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		// Look for session database file
		dbPath := filepath.Join(stateDir, entry.Name(), "session.db")
		info, err := os.Stat(dbPath)
		if err != nil {
			continue
		}
		dbs = append(dbs, dbEntry{path: dbPath, modTime: info.ModTime()})
	}

	if len(dbs) == 0 {
		return "", nil
	}

	// Sort by modification time, most recent first
	sort.Slice(dbs, func(i, j int) bool {
		return dbs[i].modTime.After(dbs[j].modTime)
	})

	return dbs[0].path, nil
}
