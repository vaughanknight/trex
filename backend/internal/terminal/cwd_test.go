package terminal

import (
	"os"
	"runtime"
	"testing"
)

func TestFakeCwdDetector(t *testing.T) {
	fake := NewFakeCwdDetector()
	fake.Cwds[123] = "/home/user/project"
	fake.Cwds[456] = "/tmp"

	if cwd := fake.DetectCwd(123); cwd != "/home/user/project" {
		t.Errorf("expected /home/user/project, got %s", cwd)
	}
	if cwd := fake.DetectCwd(456); cwd != "/tmp" {
		t.Errorf("expected /tmp, got %s", cwd)
	}
	if cwd := fake.DetectCwd(999); cwd != "" {
		t.Errorf("expected empty for unknown pid, got %s", cwd)
	}
}

func TestOsCwdDetector_CurrentProcess(t *testing.T) {
	// Test with our own process — we know our own cwd
	detector := NewCwdDetector()
	pid := os.Getpid()
	cwd := detector.DetectCwd(pid)

	expected, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get cwd: %v", err)
	}

	if runtime.GOOS == "linux" || runtime.GOOS == "darwin" {
		if cwd != expected {
			t.Errorf("expected cwd %s, got %s", expected, cwd)
		}
	} else {
		// Unsupported platform — should return empty
		if cwd != "" {
			t.Errorf("expected empty cwd on unsupported platform, got %s", cwd)
		}
	}
}

func TestOsCwdDetector_InvalidPid(t *testing.T) {
	detector := NewCwdDetector()
	cwd := detector.DetectCwd(999999999) // Non-existent PID
	if cwd != "" {
		t.Errorf("expected empty for invalid pid, got %s", cwd)
	}
}
