---
id: ADR-0001
title: "Go backend leveraging tmax library for tmux integration"
status: accepted
date: 2026-02-04
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: ["backend", "architecture", "go", "tmax"]
complexity: CS-4
---

# ADR-0001: Go backend leveraging tmax library for tmux integration

## Context

trex needs a backend to:
- Serve the web UI
- Handle WebSocket connections for terminal I/O
- Manage tmux sessions (create, attach, detach, list, kill)
- Persist user data (favorites, groups, preferences)

The maintainer has an existing project, **tmax**, which is a Go-based CLI tool for tmux management. tmax already implements the core tmux integration logic.

## Decision Drivers

- **Code reuse**: Avoid reimplementing tmux integration logic
- **Consistency**: Same tmux behavior in CLI (tmax) and web UI (trex)
- **Maintainability**: Single source of truth for tmux logic
- **Performance**: Need low-latency WebSocket handling (<50ms)
- **Embedding**: Need to embed static frontend assets in single binary

## Considered Options

### Option 1: Go backend importing tmax library

**Description**: Write trex backend in Go, import tmax as a Go module for all tmux operations.

**Pros**:
- Direct code reuse from existing tmax project
- Go excels at concurrent WebSocket handling
- Single binary distribution with embedded assets
- Type-safe integration between trex and tmax

**Cons**:
- Locked into Go for backend
- Changes to tmux logic require coordinating two repos

### Option 2: Node.js/Bun backend with tmax CLI wrapper

**Description**: Use Node.js for backend, call tmax CLI as subprocess for tmux operations.

**Pros**:
- JavaScript end-to-end (frontend and backend)
- Large npm ecosystem

**Cons**:
- Subprocess overhead for every tmux operation
- No code reuse, just CLI wrapping
- Harder to embed in single binary
- Two runtimes to manage

### Option 3: Rust backend with new tmux integration

**Description**: Write backend in Rust with fresh tmux integration code.

**Pros**:
- Excellent performance
- Memory safety

**Cons**:
- No code reuse from tmax
- Significant rewrite of tmux integration logic
- Steeper learning curve

## Decision

**Chosen Option**: Option 1 (Go backend importing tmax library) because:

1. **Direct code reuse** from existing, working tmax implementation
2. **Single binary** distribution is straightforward in Go
3. **Low-latency** WebSocket handling with goroutines
4. **Maintainability** through shared library, not duplicated logic

## Consequences

### Positive

- All tmux logic maintained in one place (tmax repo)
- trex stays focused on UI/UX, not tmux internals
- Changes to tmux handling benefit both CLI and web UI
- Fast, efficient backend with minimal overhead

### Negative

- Feature development may require cross-repo coordination
- trex depends on tmax release cycle for new tmux features
- Contributors need Go knowledge for backend work

### Neutral

- Go module versioning manages the dependency
- Clear boundary: trex requests features from tmax via GitHub issues

## Implementation Notes

- Import path: `github.com/vaughanknight/tmax/pkg/*`
- Use semantic versioning for tmax library
- trex must NOT call tmux CLI directly; always use tmax library
- When trex needs new tmux functionality:
  1. Create issue in tmax repo
  2. tmax implements and releases
  3. trex updates Go module import

## References

- [Constitution: Component Boundaries](../project-rules/constitution.md#component-boundaries--dependencies)
- [tmax repository](https://github.com/vaughanknight/tmax)
