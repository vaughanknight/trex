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

// PlanContext holds session state metadata for display.
type PlanContext struct {
	Activity      string `json:"activity,omitempty"`
	PlanName      string `json:"planName,omitempty"`
	PlanSlug      string `json:"planSlug,omitempty"`
	CurrentSkill  string `json:"currentSkill,omitempty"`
	WorkflowPhase string `json:"workflowPhase,omitempty"`
	PhaseHeading  string `json:"phaseHeading,omitempty"`
	PhaseNumber   string `json:"phaseNumber,omitempty"`
	TotalPhases   string `json:"totalPhases,omitempty"`
	CurrentTask   string `json:"currentTask,omitempty"`
	Status        string `json:"status,omitempty"`
}

// CopilotData is the complete plugin data payload.
type CopilotData struct {
	Tasks   []TodoItem    `json:"tasks"`
	Phases  []PhaseInfo   `json:"phases"`
	Summary PhaseProgress `json:"summary"`
	Context *PlanContext  `json:"context,omitempty"`
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

	// Read session_state table for plan context (optional — graceful if missing)
	ctx := readSessionState(db)
	if ctx != nil {
		data.Context = ctx
	}

	return json.Marshal(data)
}

// ReadSessionDBForProcess reads todos scoped to the session matching the given PID/cwd.
func ReadSessionDBForProcess(pid int, cwd string) (json.RawMessage, error) {
	dbPath, err := findSessionDBByCwd(cwd)
	if err != nil || dbPath == "" {
		// Fall back to most recently modified
		return ReadSessionDB()
	}
	return readFromDBPath(dbPath)
}

// readFromDBPath reads todos + session_state from a specific DB path.
func readFromDBPath(dbPath string) (json.RawMessage, error) {
	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		return nil, err
	}
	defer db.Close()

	// Check if todos table exists
	var tableName string
	err = db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='todos'").Scan(&tableName)
	if err != nil {
		return nil, nil
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
		// Still check session_state even without todos
		db2, _ := sql.Open("sqlite", dbPath+"?mode=ro")
		if db2 != nil {
			defer db2.Close()
			ctx := readSessionState(db2)
			if ctx != nil {
				data := CopilotData{Context: ctx}
				return json.Marshal(data)
			}
		}
		return nil, nil
	}

	// Group tasks into phases
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
	ctx := readSessionState(db)
	if ctx != nil {
		data.Context = ctx
	}
	return json.Marshal(data)
}

// readSessionState queries the session_state key-value table.
func readSessionState(db *sql.DB) *PlanContext {
	var tableName string
	err := db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='session_state'").Scan(&tableName)
	if err != nil {
		return nil
	}

	rows, err := db.Query("SELECT key, value FROM session_state")
	if err != nil {
		return nil
	}
	defer rows.Close()

	ctx := &PlanContext{}
	found := false
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			continue
		}
		found = true
		switch key {
		case "activity":
			ctx.Activity = value
		case "active_plan_name", "plan_name":
			ctx.PlanName = value
		case "active_plan", "plan_slug":
			ctx.PlanSlug = value
		case "current_skill":
			ctx.CurrentSkill = value
		case "workflow_phase":
			ctx.WorkflowPhase = value
		case "active_phase", "phase_heading":
			ctx.PhaseHeading = value
		case "active_phase_number", "phase_number":
			ctx.PhaseNumber = value
		case "total_phases":
			ctx.TotalPhases = value
		case "current_task_id":
			ctx.CurrentTask = value
		case "status":
			ctx.Status = value
		}
	}
	if !found {
		return nil
	}
	return ctx
}

// findSessionDBByCwd finds a session DB whose directory matches the given cwd.
func findSessionDBByCwd(cwd string) (string, error) {
	if cwd == "" {
		return "", nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	stateDir := filepath.Join(home, ".copilot", "session-state")
	entries, err := os.ReadDir(stateDir)
	if err != nil {
		return "", nil
	}

	// Check each session directory for a matching cwd in session_state
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dbPath := filepath.Join(stateDir, entry.Name(), "session.db")
		if _, err := os.Stat(dbPath); err != nil {
			continue
		}
		// Quick check: does this session's cwd match?
		db, err := sql.Open("sqlite", dbPath+"?mode=ro")
		if err != nil {
			continue
		}
		var val string
		err = db.QueryRow("SELECT value FROM session_state WHERE key='cwd'").Scan(&val)
		db.Close()
		if err == nil && val == cwd {
			return dbPath, nil
		}
	}
	return "", nil
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
