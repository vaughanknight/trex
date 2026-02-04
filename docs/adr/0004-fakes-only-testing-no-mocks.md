---
id: ADR-0004
title: "Fakes-only testing policy (no mocks)"
status: accepted
date: 2026-02-04
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: ["testing", "tdd", "fakes", "mocks", "quality"]
complexity: CS-2
---

# ADR-0004: Fakes-only testing policy (no mocks)

## Context

trex follows strict Test-Driven Development (TDD). We need to define how to handle dependencies in tests, particularly for:

- tmux integration (via tmax library)
- File system operations
- WebSocket connections
- External APIs (if any)

The testing community has long debated "mocks vs fakes" - we need a clear, consistent policy.

## Decision Drivers

- **Test clarity**: Tests should be easy to understand
- **Behavior verification**: Tests should verify behavior, not implementation
- **Refactoring safety**: Tests shouldn't break when internals change
- **Realistic testing**: Tests should catch real bugs
- **Maintainability**: Test doubles should be easy to maintain

## Considered Options

### Option 1: Mocks (mockery, gomock, etc.)

**Description**: Use mocking frameworks to create mock objects that verify method calls.

**Pros**:
- Auto-generation from interfaces
- Verify exact method calls and arguments
- Built-in assertion on call counts

**Cons**:
- Tests coupled to implementation details
- Refactoring breaks tests even when behavior unchanged
- "Mock explosion" - every method needs expectations
- Tests become hard to read with mock setup
- False confidence - mocks don't catch integration bugs

### Option 2: Fakes only

**Description**: Create simplified, in-memory implementations of dependencies that behave like the real thing.

**Pros**:
- Tests verify behavior, not implementation
- Refactoring doesn't break tests
- Fakes are reusable across tests
- Tests read like documentation
- Closer to real behavior

**Cons**:
- Need to write and maintain fakes
- Fakes can drift from real implementation
- Initial effort higher than mock generation

### Option 3: Mixed approach (mocks for some, fakes for others)

**Description**: Use mocks for simple dependencies, fakes for complex ones.

**Pros**:
- Flexibility per situation

**Cons**:
- Inconsistent codebase
- Team needs to decide each time
- Debates over which approach to use

## Decision

**Chosen Option**: Option 2 (Fakes only) because:

1. **Behavior over implementation**: We want tests that verify what the code does, not how it does it
2. **Refactoring freedom**: Change internals without breaking tests
3. **Readability**: Fake setup is cleaner than mock expectations
4. **Reliability**: Fakes behave more realistically than mocks
5. **Consistency**: One clear rule, no debates

This is a **non-negotiable** policy. Never ask about mocks - fakes are the policy.

## Consequences

### Positive

- Tests are more resilient to refactoring
- Tests are easier to read and understand
- Fakes can be shared across test files
- Higher confidence that tests catch real bugs
- Clear, consistent approach across codebase

### Negative

- Need to write fakes (initial investment)
- Fakes need maintenance as real implementation evolves
- Some developers may need to learn fake patterns

### Neutral

- tmax library may provide fakes for tmux - use those
- Fakes live in test packages or dedicated test utilities

## Implementation Notes

### Unit Tests: Use Fakes

```go
// CORRECT - Use fake
func TestSessionManager_List(t *testing.T) {
    fake := NewFakeTmux()
    fake.AddSession("dev", "idle")

    mgr := NewSessionManager(fake)
    sessions, err := mgr.List()

    assert.NoError(t, err)
    assert.Len(t, sessions, 1)
}

// WRONG - Don't use mocks
func TestSessionManager_List(t *testing.T) {
    mockTmux := &MockTmux{}
    mockTmux.On("ListSessions").Return([]Session{{Name: "dev"}})
    // This couples test to implementation details
}
```

### Integration Tests: Use Real Dependencies

```go
func TestSessionManager_List_Integration(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test")
    }

    // Use real tmux for integration tests
    mgr := NewSessionManager(NewRealTmux())
    sessions, err := mgr.List()

    assert.NoError(t, err)
}
```

### Fake Strategy by Dependency

| Dependency | Unit Test | Integration Test |
|------------|-----------|------------------|
| tmux (via tmax) | FakeTmux | Real tmux |
| File system | FakeFS (in-memory) | Real file system |
| WebSocket | FakeWSConn | Real connection |
| HTTP clients | FakeHTTPClient | Real HTTP |

## References

- [Constitution: Mock Policy](../project-rules/constitution.md#testing-philosophy)
- [Rules: Mock Policy](../project-rules/rules.md#mock-policy)
- [Martin Fowler: Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html)
