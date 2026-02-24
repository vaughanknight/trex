package terminal

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// CwdDetector detects the current working directory of a process.
type CwdDetector interface {
	// DetectCwd returns the current working directory for the given process ID.
	// Returns empty string on error (graceful fallback).
	DetectCwd(pid int) string
}

// NewCwdDetector creates a platform-appropriate CwdDetector.
func NewCwdDetector() CwdDetector {
	return &osCwdDetector{}
}

// osCwdDetector uses OS-specific methods to detect process cwd.
type osCwdDetector struct{}

func (d *osCwdDetector) DetectCwd(pid int) string {
	switch runtime.GOOS {
	case "linux":
		return d.detectLinux(pid)
	case "darwin":
		return d.detectDarwin(pid)
	default:
		return ""
	}
}

// detectLinux uses /proc/<pid>/cwd symlink (fast, reliable).
func (d *osCwdDetector) detectLinux(pid int) string {
	link := fmt.Sprintf("/proc/%d/cwd", pid)
	target, err := os.Readlink(link)
	if err != nil {
		return ""
	}
	return target
}

// detectDarwin uses lsof to find process cwd (macOS has no procfs).
func (d *osCwdDetector) detectDarwin(pid int) string {
	cmd := exec.Command("lsof", "-a", "-p", fmt.Sprintf("%d", pid), "-d", "cwd", "-Fn")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	// lsof -Fn outputs lines like: p<pid>\nn<path>
	for _, line := range strings.Split(string(out), "\n") {
		if strings.HasPrefix(line, "n") {
			return line[1:]
		}
	}
	return ""
}

// FakeCwdDetector returns configurable cwd values for testing (ADR-0004).
type FakeCwdDetector struct {
	Cwds map[int]string // pid → cwd
}

func NewFakeCwdDetector() *FakeCwdDetector {
	return &FakeCwdDetector{Cwds: make(map[int]string)}
}

func (f *FakeCwdDetector) DetectCwd(pid int) string {
	if cwd, ok := f.Cwds[pid]; ok {
		return cwd
	}
	return ""
}
