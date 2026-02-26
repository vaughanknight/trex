package terminal

import "sync"

// CollectorRegistry manages registered DataCollectors.
// Thread-safe for concurrent registration (startup) and lookup (polling).
type CollectorRegistry struct {
	mu         sync.RWMutex
	collectors map[string]DataCollector
}

// NewCollectorRegistry creates an empty registry.
func NewCollectorRegistry() *CollectorRegistry {
	return &CollectorRegistry{
		collectors: make(map[string]DataCollector),
	}
}

// Register adds a collector. Overwrites if same ID already registered.
func (r *CollectorRegistry) Register(c DataCollector) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.collectors[c.ID()] = c
}

// All returns all registered collectors.
func (r *CollectorRegistry) All() []DataCollector {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]DataCollector, 0, len(r.collectors))
	for _, c := range r.collectors {
		result = append(result, c)
	}
	return result
}

// FindMatching returns collectors whose ProcessMatch returns true for the given processes.
func (r *CollectorRegistry) FindMatching(processes []string) []DataCollector {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var matched []DataCollector
	for _, c := range r.collectors {
		if c.ProcessMatch(processes) {
			matched = append(matched, c)
		}
	}
	return matched
}

// Count returns the number of registered collectors.
func (r *CollectorRegistry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.collectors)
}
