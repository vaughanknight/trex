package terminal

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func TestFakeDataCollector_ID(t *testing.T) {
	fake := NewFakeDataCollector("copilot-todos", []string{"copilot"})
	if fake.ID() != "copilot-todos" {
		t.Errorf("expected copilot-todos, got %s", fake.ID())
	}
}

func TestFakeDataCollector_ProcessMatch(t *testing.T) {
	fake := NewFakeDataCollector("copilot-todos", []string{"copilot", "github-copilot"})

	if !fake.ProcessMatch([]string{"zsh", "node", "copilot"}) {
		t.Error("expected match for copilot in tree")
	}
	if !fake.ProcessMatch([]string{"bash", "github-copilot-cli"}) {
		t.Error("expected match for github-copilot substring")
	}
	if fake.ProcessMatch([]string{"bash", "vim", "node"}) {
		t.Error("expected no match without copilot")
	}
	if fake.ProcessMatch(nil) {
		t.Error("expected no match for nil processes")
	}
}

func TestFakeDataCollector_Collect(t *testing.T) {
	fake := NewFakeDataCollector("test", []string{"test"})
	fake.Data = json.RawMessage(`{"tasks":5,"done":3}`)

	data, err := fake.Collect()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(data) != `{"tasks":5,"done":3}` {
		t.Errorf("expected task data, got %s", string(data))
	}
}

func TestFakeDataCollector_CollectError(t *testing.T) {
	fake := NewFakeDataCollector("test", []string{"test"})
	fake.Err = fmt.Errorf("db not found")

	_, err := fake.Collect()
	if err == nil || err.Error() != "db not found" {
		t.Errorf("expected 'db not found' error, got %v", err)
	}
}

func TestFakeDataCollector_Interval(t *testing.T) {
	fake := NewFakeDataCollector("test", []string{"test"})
	fake.PollInterval = 5 * time.Second

	if fake.Interval() != 5*time.Second {
		t.Errorf("expected 5s interval, got %v", fake.Interval())
	}
}
