package terminal

import (
	"testing"
)

// Test Doc:
// - Why: parseTmuxClients is the core parser for tmux detection; incorrect parsing breaks all tmux tracking
// - Contract: Tab-separated lines of "ttyPath\tsessionName" are correctly mapped; malformed lines are skipped
// - Usage Notes: Input comes from `tmux list-clients -F '#{client_tty}\t#{session_name}'`
// - Quality Contribution: Catches regressions in tmux output parsing across tmux versions
// - Worked Example: "/dev/ttys010\twork\n/dev/ttys017\twork" → {"/dev/ttys010":"work", "/dev/ttys017":"work"}
func TestParseTmuxClients(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected map[string]string
	}{
		{
			name:     "empty output",
			input:    "",
			expected: map[string]string{},
		},
		{
			name:     "single client",
			input:    "/dev/ttys010\twork\n",
			expected: map[string]string{"/dev/ttys010": "work"},
		},
		{
			name:  "multiple clients same session",
			input: "/dev/ttys010\twork\n/dev/ttys017\twork\n",
			expected: map[string]string{
				"/dev/ttys010": "work",
				"/dev/ttys017": "work",
			},
		},
		{
			name:  "multiple clients different sessions",
			input: "/dev/ttys010\twork\n/dev/ttys017\tdebug\n",
			expected: map[string]string{
				"/dev/ttys010": "work",
				"/dev/ttys017": "debug",
			},
		},
		{
			name:  "linux pts paths",
			input: "/dev/pts/5\tdev\n/dev/pts/12\tprod\n",
			expected: map[string]string{
				"/dev/pts/5":  "dev",
				"/dev/pts/12": "prod",
			},
		},
		{
			name:     "malformed line no tab",
			input:    "/dev/ttys010 work\n",
			expected: map[string]string{},
		},
		{
			name:     "empty tty path",
			input:    "\twork\n",
			expected: map[string]string{},
		},
		{
			name:     "empty session name",
			input:    "/dev/ttys010\t\n",
			expected: map[string]string{},
		},
		{
			name:     "whitespace only lines",
			input:    "  \n\t\n\n",
			expected: map[string]string{},
		},
		{
			name:  "trailing newline and whitespace",
			input: "/dev/ttys010\twork\n  \n",
			expected: map[string]string{
				"/dev/ttys010": "work",
			},
		},
		{
			name:  "session name with hyphens",
			input: "/dev/ttys010\tmy-long-session-name\n",
			expected: map[string]string{
				"/dev/ttys010": "my-long-session-name",
			},
		},
		{
			name:  "tab in session name preserved",
			input: "/dev/ttys010\tname\twith\ttabs\n",
			expected: map[string]string{
				"/dev/ttys010": "name\twith\ttabs",
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := parseTmuxClients(tc.input)
			if len(result) != len(tc.expected) {
				t.Fatalf("expected %d entries, got %d: %v", len(tc.expected), len(result), result)
			}
			for k, v := range tc.expected {
				got, ok := result[k]
				if !ok {
					t.Errorf("expected key %q not found", k)
					continue
				}
				if got != v {
					t.Errorf("key %q: expected %q, got %q", k, v, got)
				}
			}
		})
	}
}

// Test Doc:
// - Why: FakeTmuxDetector is used in all monitor tests; must faithfully model real behavior
// - Contract: AddClient/RemoveClient/SetUnavailable/SetError control fake state correctly
// - Usage Notes: NewFakeTmuxDetector() starts as available with no clients
// - Quality Contribution: Ensures test infrastructure is reliable
// - Worked Example: AddClient("/dev/ttys010", "work") → ListClients returns {"/dev/ttys010":"work"}
func TestFakeTmuxDetector(t *testing.T) {
	t.Run("starts available with no clients", func(t *testing.T) {
		f := NewFakeTmuxDetector()
		if !f.IsAvailable() {
			t.Error("expected available")
		}
		clients, err := f.ListClients()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(clients) != 0 {
			t.Errorf("expected 0 clients, got %d", len(clients))
		}
	})

	t.Run("add and remove clients", func(t *testing.T) {
		f := NewFakeTmuxDetector()
		f.AddClient("/dev/ttys010", "work")
		f.AddClient("/dev/ttys017", "debug")

		clients, err := f.ListClients()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(clients) != 2 {
			t.Fatalf("expected 2 clients, got %d", len(clients))
		}
		if clients["/dev/ttys010"] != "work" {
			t.Errorf("expected work, got %q", clients["/dev/ttys010"])
		}

		f.RemoveClient("/dev/ttys010")
		clients, err = f.ListClients()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(clients) != 1 {
			t.Fatalf("expected 1 client, got %d", len(clients))
		}
	})

	t.Run("set unavailable", func(t *testing.T) {
		f := NewFakeTmuxDetector()
		f.SetUnavailable()
		if f.IsAvailable() {
			t.Error("expected unavailable")
		}
	})

	t.Run("returns copy not reference", func(t *testing.T) {
		f := NewFakeTmuxDetector()
		f.AddClient("/dev/ttys010", "work")
		clients, _ := f.ListClients()
		clients["/dev/ttys010"] = "mutated"

		clients2, _ := f.ListClients()
		if clients2["/dev/ttys010"] != "work" {
			t.Error("ListClients returned a reference, not a copy")
		}
	})
}
