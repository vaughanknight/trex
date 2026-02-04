---
id: ADR-0003
title: "Dual distribution: Web and Electron in v1"
status: accepted
date: 2026-02-04
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: ["distribution", "electron", "web", "architecture"]
complexity: CS-4
---

# ADR-0003: Dual distribution: Web and Electron in v1

## Context

trex is a visual interface for tmux session management. Users have different preferences for how they want to run such tools:

1. **Browser-native users**: Prefer lightweight tools that run in existing browser, can use browser tabs alongside trex
2. **Desktop-app users**: Prefer dedicated applications with native OS integration, don't want to manage browser tabs

Both user types are part of our target audience (developers managing multiple tmux sessions).

## Decision Drivers

- **User choice**: Different developers have different preferences
- **Native integration**: Some features (global hotkeys, system tray) require native app
- **Simplicity**: Some users don't want another "fat app"
- **Development efficiency**: Minimize code duplication
- **v1 scope**: Ship something useful quickly

## Considered Options

### Option 1: Web-only, Electron later

**Description**: Build web app first, add Electron in v2.

**Pros**:
- Faster v1 delivery
- Simpler initial architecture

**Cons**:
- Delays features requiring native integration
- May require refactoring when adding Electron
- Users wanting desktop app have to wait

### Option 2: Electron-only

**Description**: Build only as Electron app, no web mode.

**Pros**:
- Full native integration from day one
- Single distribution to maintain

**Cons**:
- Heavy for users wanting lightweight solution
- Can't leverage browser tab organization
- Larger download and memory footprint

### Option 3: Both Web and Electron in v1

**Description**: Support both distribution modes from v1 with shared codebase.

**Pros**:
- Users choose their preferred mode
- Native features available immediately
- Web mode for lightweight usage
- 100% shared React components
- Same Go backend

**Cons**:
- More initial complexity
- Two distribution pipelines to maintain
- Testing across both modes

## Decision

**Chosen Option**: Option 3 (Both Web and Electron in v1) because:

1. **User choice matters**: Our target users have genuine different preferences
2. **Shared architecture**: Vite + React works identically in both modes
3. **Same Go backend**: Both modes connect to same localhost server
4. **Native features**: System tray, global hotkeys are high-value for power users
5. **Low marginal cost**: With Vite + electron-vite, adding Electron is straightforward

## Consequences

### Positive

- Users get their preferred experience from day one
- Power users get global hotkeys, system tray
- Lightweight users get browser-based simplicity
- Codebase stays unified (no fork for Electron)
- Testing one React app tests both modes

### Negative

- Two build pipelines to maintain
- Need to test on multiple platforms (macOS, Windows, Linux)
- Electron updates require attention
- Larger overall project scope

### Neutral

- Same configuration files for both modes (`~/.config/trex/`)
- Same WebSocket/REST protocols
- Electron-specific features clearly isolated in `electron/` directory

## Implementation Notes

### Project Structure

```
trex/
├── backend/         # Go (shared)
├── frontend/        # Vite + React (shared)
├── electron/        # Desktop-specific code
│   ├── main.ts      # Main process
│   └── preload.ts   # Preload script
└── scripts/
    ├── build-web.sh
    └── build-electron.sh
```

### Distribution Commands

```bash
# Web mode
trex                    # Start Go server, open browser

# Electron mode
trex-desktop            # Launch native app
```

### Electron-Specific Features

Only in desktop mode:
- System tray with quick session access
- Global hotkey for session picker (even when app not focused)
- Native OS notifications
- Auto-start on login (optional)

## References

- [ADR-0002: Vite + React](./0002-vite-react-over-nextjs.md)
- [Constitution: Distribution](../project-rules/constitution.md#distribution)
- [electron-vite](https://electron-vite.org/)
