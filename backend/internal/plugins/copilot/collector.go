package copilot

import (
	"encoding/json"
	"log"
	"time"

	"github.com/vaughanknight/trex/internal/terminal"
)

// Collector implements terminal.DataCollector for Copilot CLI todo tracking.
type Collector struct{}

// Verify interface compliance at compile time.
var _ terminal.DataCollector = (*Collector)(nil)

func NewCollector() *Collector {
	return &Collector{}
}

func (c *Collector) ID() string { return "copilot-todos" }

func (c *Collector) ProcessMatch(processes []string) bool {
	for _, p := range processes {
		// Match "copilot" anywhere in process name (case-insensitive via lowercase in detector)
		if p == "copilot" || p == "github-copilot" || p == "github-copilot-cli" {
			return true
		}
	}
	return false
}

func (c *Collector) Collect() (json.RawMessage, error) {
	data, err := ReadSessionDB()
	if err != nil {
		log.Printf("[copilot-todos] collect error: %v", err)
	}
	if data != nil {
		log.Printf("[copilot-todos] collected %d bytes", len(data))
	}
	return data, err
}

func (c *Collector) Interval() time.Duration {
	return 3 * time.Second
}
