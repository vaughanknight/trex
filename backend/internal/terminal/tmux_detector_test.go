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
// - Why: parseTmuxSessions is the core parser for tmux session discovery; incorrect parsing breaks the sidebar
// - Contract: Tab-separated lines of "name\twindows\tattached" are correctly parsed into TmuxSessionInfo slice;
//   malformed lines are skipped; empty output returns nil
// - Usage Notes: Input comes from `tmux list-sessions -F '#{session_name}\t#{session_windows}\t#{session_attached}'`
// - Quality Contribution: Catches regressions in tmux session parsing across tmux versions
// - Worked Example: "work\t3\t1\ndebug\t1\t0" → [{Name:"work",Windows:3,Attached:1},{Name:"debug",Windows:1,Attached:0}]
func TestParseTmuxSessions(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []TmuxSessionInfo
	}{
		{
			name:     "empty output",
			input:    "",
			expected: nil,
		},
		{
			name:  "single session",
			input: "work\t3\t1",
			expected: []TmuxSessionInfo{
				{Name: "work", Windows: 3, Attached: 1},
			},
		},
		{
			name:  "multiple sessions",
			input: "work\t3\t1\ndebug\t1\t0",
			expected: []TmuxSessionInfo{
				{Name: "work", Windows: 3, Attached: 1},
				{Name: "debug", Windows: 1, Attached: 0},
			},
		},
		{
			name:  "special char names - dots hyphens underscores",
			input: "my.session-1_test\t1\t0",
			expected: []TmuxSessionInfo{
				{Name: "my.session-1_test", Windows: 1, Attached: 0},
			},
		},
		{
			name:     "tmux not running - empty string",
			input:    "",
			expected: nil,
		},
		{
			name:     "malformed line - missing field",
			input:    "work\t3",
			expected: nil,
		},
		{
			name:     "malformed line - non-numeric windows",
			input:    "work\tabc\t1",
			expected: nil,
		},
		{
			name:     "malformed line - non-numeric attached",
			input:    "work\t3\tabc",
			expected: nil,
		},
		{
			name:     "whitespace only lines",
			input:    "  \n\n",
			expected: nil,
		},
		{
			name:  "trailing newline",
			input: "work\t3\t1\n",
			expected: []TmuxSessionInfo{
				{Name: "work", Windows: 3, Attached: 1},
			},
		},
		{
			name:  "mixed valid and malformed lines",
			input: "work\t3\t1\nbadline\ndebug\t1\t0",
			expected: []TmuxSessionInfo{
				{Name: "work", Windows: 3, Attached: 1},
				{Name: "debug", Windows: 1, Attached: 0},
			},
		},
		{
			name:     "empty session name",
			input:    "\t3\t1",
			expected: nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := parseTmuxSessions(tc.input)
			if len(result) != len(tc.expected) {
				t.Fatalf("expected %d entries, got %d: %v", len(tc.expected), len(result), result)
			}
			for i, want := range tc.expected {
				got := result[i]
				if got.Name != want.Name {
					t.Errorf("[%d] Name: expected %q, got %q", i, want.Name, got.Name)
				}
				if got.Windows != want.Windows {
					t.Errorf("[%d] Windows: expected %d, got %d", i, want.Windows, got.Windows)
				}
				if got.Attached != want.Attached {
					t.Errorf("[%d] Attached: expected %d, got %d", i, want.Attached, got.Attached)
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

// Test Doc:
// - Why: FakeTmuxDetector session methods are used by monitor and server tests for session discovery
// - Contract: AddSession/RemoveSession/ListSessions manage fake session list correctly; returns copy not reference
// - Usage Notes: AddSession(name, windows, attached) appends; RemoveSession(name) removes by name
// - Quality Contribution: Ensures fake session management is reliable for downstream tests
// - Worked Example: AddSession("work", 3, 1) → ListSessions returns [{Name:"work",Windows:3,Attached:1}]
func TestFakeTmuxDetector_Sessions(t *testing.T) {
	t.Run("starts with no sessions", func(t *testing.T) {
		f := NewFakeTmuxDetector()
		sessions, err := f.ListSessions()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if sessions != nil {
			t.Errorf("expected nil sessions, got %v", sessions)
		}
	})

	t.Run("add and list sessions", func(t *testing.T) {
		f := NewFakeTmuxDetector()
		f.AddSession("work", 3, 1)
		f.AddSession("debug", 1, 0)

		sessions, err := f.ListSessions()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(sessions) != 2 {
			t.Fatalf("expected 2 sessions, got %d", len(sessions))
		}
		if sessions[0].Name != "work" || sessions[0].Windows != 3 || sessions[0].Attached != 1 {
			t.Errorf("session[0] = %+v, want {work, 3, 1}", sessions[0])
		}
		if sessions[1].Name != "debug" || sessions[1].Windows != 1 || sessions[1].Attached != 0 {
			t.Errorf("session[1] = %+v, want {debug, 1, 0}", sessions[1])
		}
	})

	t.Run("remove session", func(t *testing.T) {
		f := NewFakeTmuxDetector()
		f.AddSession("work", 3, 1)
		f.AddSession("debug", 1, 0)
		f.RemoveSession("work")

		sessions, err := f.ListSessions()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(sessions) != 1 {
			t.Fatalf("expected 1 session, got %d", len(sessions))
		}
		if sessions[0].Name != "debug" {
			t.Errorf("expected debug, got %q", sessions[0].Name)
		}
	})

	t.Run("remove nonexistent session is no-op", func(t *testing.T) {
		f := NewFakeTmuxDetector()
		f.AddSession("work", 3, 1)
		f.RemoveSession("nonexistent")

		sessions, _ := f.ListSessions()
		if len(sessions) != 1 {
			t.Fatalf("expected 1 session, got %d", len(sessions))
		}
	})

	t.Run("returns error when set", func(t *testing.T) {
		f := NewFakeTmuxDetector()
		f.AddSession("work", 3, 1)
		f.SetError(errTest)

		_, err := f.ListSessions()
		if err != errTest {
			t.Errorf("expected errTest, got %v", err)
		}
	})
}

// Test Doc:
// - Why: Copy semantics prevent test cross-contamination through shared state
// - Contract: Mutating the returned slice does not affect the fake's internal state
// - Usage Notes: Important for tests that modify returned session slices
// - Quality Contribution: Prevents subtle test ordering bugs
// - Worked Example: sessions[0].Name = "mutated" → ListSessions still returns "work"
func TestFakeTmuxDetector_SessionsCopy(t *testing.T) {
	f := NewFakeTmuxDetector()
	f.AddSession("work", 3, 1)

	sessions, _ := f.ListSessions()
	sessions[0].Name = "mutated"

	sessions2, _ := f.ListSessions()
	if sessions2[0].Name != "work" {
		t.Error("ListSessions returned a reference, not a copy")
	}
}
