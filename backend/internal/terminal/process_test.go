package terminal

import (
	"os"
	"testing"
)

func TestFakeProcessDetector(t *testing.T) {
	fake := NewFakeProcessDetector()
	fake.Trees[123] = []string{"zsh", "node", "copilot"}
	fake.Trees[456] = []string{"bash"}

	tree := fake.DetectProcessTree(123)
	if len(tree) != 3 || tree[2] != "copilot" {
		t.Errorf("expected [zsh, node, copilot], got %v", tree)
	}

	tree = fake.DetectProcessTree(456)
	if len(tree) != 1 || tree[0] != "bash" {
		t.Errorf("expected [bash], got %v", tree)
	}

	tree = fake.DetectProcessTree(999)
	if tree != nil {
		t.Errorf("expected nil for unknown pid, got %v", tree)
	}
}

func TestFakeProcessDetector_EmptyTree(t *testing.T) {
	fake := NewFakeProcessDetector()
	fake.Trees[100] = []string{}

	tree := fake.DetectProcessTree(100)
	if len(tree) != 0 {
		t.Errorf("expected empty tree, got %v", tree)
	}
}

func TestOsProcessDetector_CurrentProcess(t *testing.T) {
	detector := NewProcessDetector()
	pid := os.Getpid()
	tree := detector.DetectProcessTree(pid)

	if len(tree) == 0 {
		t.Error("expected at least 1 process name for current process")
	}
}

func TestOsProcessDetector_InvalidPid(t *testing.T) {
	detector := NewProcessDetector()
	tree := detector.DetectProcessTree(-1)
	if tree != nil {
		t.Errorf("expected nil for negative pid, got %v", tree)
	}

	tree = detector.DetectProcessTree(999999999)
	if len(tree) > 0 {
		t.Errorf("expected empty for non-existent pid, got %v", tree)
	}
}
