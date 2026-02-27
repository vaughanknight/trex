package terminal

import (
	"encoding/json"
	"strings"
	"time"
)

// DataCollector gathers plugin-specific data from external sources.
// Backend collectors are registered at server startup and invoked when
// their process match patterns are detected in a session's process tree.
type DataCollector interface {
	// ID returns the unique plugin identifier (e.g., "copilot-todos").
	ID() string
	// ProcessMatch returns true if any process in the tree matches this collector.
	ProcessMatch(processes []string) bool
	// Collect gathers data and returns it as JSON. Returns nil if no data available.
	Collect() (json.RawMessage, error)
	// CollectForSession gathers data scoped to a specific session by PID and cwd.
	CollectForSession(pid int, cwd string) (json.RawMessage, error)
	// Interval returns the minimum polling interval for this collector.
	Interval() time.Duration
}

// FakeDataCollector returns configurable data for testing (ADR-0004).
type FakeDataCollector struct {
	PluginID      string
	MatchPatterns []string
	Data          json.RawMessage
	Err           error
	PollInterval  time.Duration
}

func NewFakeDataCollector(id string, patterns []string) *FakeDataCollector {
	return &FakeDataCollector{
		PluginID:      id,
		MatchPatterns: patterns,
		PollInterval:  3 * time.Second,
	}
}

func (f *FakeDataCollector) ID() string { return f.PluginID }

func (f *FakeDataCollector) ProcessMatch(processes []string) bool {
	for _, proc := range processes {
		procLower := strings.ToLower(proc)
		for _, pattern := range f.MatchPatterns {
			if strings.Contains(procLower, strings.ToLower(pattern)) {
				return true
			}
		}
	}
	return false
}

func (f *FakeDataCollector) Collect() (json.RawMessage, error) {
	if f.Err != nil {
		return nil, f.Err
	}
	return f.Data, nil
}

func (f *FakeDataCollector) CollectForSession(pid int, cwd string) (json.RawMessage, error) {
	return f.Collect()
}

func (f *FakeDataCollector) Interval() time.Duration { return f.PollInterval }
