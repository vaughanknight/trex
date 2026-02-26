package terminal

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

// ProcessDetector detects the process tree of a running PID.
type ProcessDetector interface {
	// DetectProcessTree returns all process names in the tree rooted at pid.
	// Walks the full child process tree (not just immediate child).
	DetectProcessTree(pid int) []string
}

// NewProcessDetector creates a platform-appropriate ProcessDetector.
func NewProcessDetector() ProcessDetector {
	return &osProcessDetector{}
}

// osProcessDetector uses ps/pgrep to walk the process tree.
type osProcessDetector struct{}

func (d *osProcessDetector) DetectProcessTree(pid int) []string {
	if pid <= 0 {
		return nil
	}
	var names []string
	d.walkTree(pid, &names, 0)
	return names
}

// walkTree recursively collects process names via pgrep -P <pid>.
func (d *osProcessDetector) walkTree(pid int, names *[]string, depth int) {
	if depth > 10 {
		return // Safety: prevent infinite recursion
	}

	// Get this process's name
	name := d.getProcessName(pid)
	if name != "" {
		*names = append(*names, name)
	}

	// Get child PIDs
	out, err := exec.Command("pgrep", "-P", strconv.Itoa(pid)).Output()
	if err != nil {
		return // No children or pgrep failed
	}

	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		childPid, err := strconv.Atoi(strings.TrimSpace(line))
		if err != nil || childPid <= 0 {
			continue
		}
		d.walkTree(childPid, names, depth+1)
	}
}

// getProcessName returns the command name for a PID.
func (d *osProcessDetector) getProcessName(pid int) string {
	out, err := exec.Command("ps", "-o", "comm=", "-p", fmt.Sprintf("%d", pid)).Output()
	if err != nil {
		return ""
	}
	name := strings.TrimSpace(string(out))
	// Strip path prefix (ps may return full path on some systems)
	if idx := strings.LastIndex(name, "/"); idx >= 0 {
		name = name[idx+1:]
	}
	return name
}

// FakeProcessDetector returns configurable process trees for testing (ADR-0004).
type FakeProcessDetector struct {
	Trees map[int][]string // pid → process names
}

func NewFakeProcessDetector() *FakeProcessDetector {
	return &FakeProcessDetector{Trees: make(map[int][]string)}
}

func (f *FakeProcessDetector) DetectProcessTree(pid int) []string {
	if tree, ok := f.Trees[pid]; ok {
		return tree
	}
	return nil
}
