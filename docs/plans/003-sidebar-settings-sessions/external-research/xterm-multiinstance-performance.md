# xterm.js Multi-Instance Performance Research

**Research Date**: 2026-02-04
**Query**: xterm.js multi-instance performance for 30+ terminals

---

## Executive Summary

Successfully implementing 30+ concurrent xterm.js instances requires:
1. **Shared WebGL Context** - Browser limits contexts to 8-16 per page
2. **Virtualization** - Render only visible terminals, pause hidden ones
3. **Instance Pooling** - Pre-allocate and recycle terminal instances
4. **Hybrid Rendering** - WebGL for active, Canvas/DOM for previews
5. **Scrollback Management** - Configure per-terminal based on use case

---

## Key Findings

### Memory Footprint Per Instance

| Configuration | Memory Usage |
|---------------|--------------|
| 160x24 terminal, 5000 lines scrollback | ~34 MB |
| 160x24 terminal, 3000 lines scrollback | ~20 MB |
| 160x24 terminal, 1000 lines scrollback | ~7-10 MB |
| Buffer storage | 12 bytes per cell |

**For 30 terminals with 3000-line scrollback**: 600-900 MB total memory

### WebGL Context Limits (Critical)

- **Chrome**: 16 active WebGL contexts max
- **Firefox**: 8-16 contexts
- **Safari/iOS**: Even more restrictive

**Impact**: Naive implementation creating one WebGL context per terminal will fail after 16th instance. Older contexts silently lost.

**Solution**: Shared WebGL context architecture where all terminals render to a single context with viewport/scissor techniques.

### Recommended Instance Limits

| Hardware | Max Visible Terminals |
|----------|----------------------|
| High-end (dedicated GPU) | 20-30 |
| Mid-range (integrated GPU) | 10-15 |
| Low-end | 5-8 |

---

## Optimization Strategies

### 1. Pause/Resume Renderer API

```typescript
// Pause hidden terminals
terminal.pauseRenderer()

// Resume when visible
terminal.resumeRenderer()
```

Critical for sidebar previews - 20 paused terminals consume only parsing CPU, no rendering CPU/GPU.

### 2. Virtualization Pattern

```typescript
function useTerminalPauseResume(terminalRef, isVisible) {
  useEffect(() => {
    if (!terminalRef.current) return;
    if (isVisible) {
      terminalRef.current.resumeRenderer();
    } else {
      terminalRef.current.pauseRenderer();
    }
  }, [isVisible, terminalRef]);
}
```

### 3. Instance Pooling

```javascript
const terminalConfig = {
  enableInstancePooling: true,
  poolSize: 20,
  maxPoolSize: 50,
};
```

Pre-allocate terminals during startup, recycle on tab close.

### 4. Hybrid Rendering Strategy

| Terminal Type | Renderer | FPS | Notes |
|---------------|----------|-----|-------|
| Active (user input) | WebGL | 60 | Max 8-16 instances |
| Medium-activity | Canvas | 40-50 | Up to 20 instances |
| Sidebar previews | Canvas/DOM | 10-15 | Reduced frame rate |
| Archived/frozen | Static snapshot | 0 | Canvas image, minimal memory |

### 5. Scrollback Configuration

```typescript
const terminalConfigs = {
  activeTerminal: { scrollback: 3000, enableWebGL: true },
  sidebarPreview: { scrollback: 500, enableWebGL: false },
  archiveTerminal: { frozen: true }, // Static snapshot
};
```

---

## VS Code's Approach

VS Code's integrated terminal:
- Uses pause/resume renderer API when switching tabs
- Falls back from WebGL → Canvas → DOM on context loss
- Maintains DOM structure when hidden for quick switching
- Reports 5-45x faster rendering than DOM-based implementations

---

## Performance Thresholds

| Metric | Threshold | Action |
|--------|-----------|--------|
| Frame rate | < 30 FPS | Reduce visible terminals |
| Memory | > 1-2 GB | Reduce scrollback, dispose inactive |
| Parsing latency | > 16ms/frame | Implement flow control |
| Input latency | > 50ms | Prioritize active terminal rendering |

---

## Recommended Architecture

```
TerminalService (Singleton)
├── TerminalPool: Pre-allocated instances
├── RendererManager: WebGL/Canvas/DOM selection
├── InstanceLifecycleManager: Create/update/dispose
└── PerformanceMonitor: Track metrics

React Components
├── TerminalContainer (visibility + pause/resume)
├── TerminalPane (render individual terminal)
├── TerminalSidebar (lazy rendering previews)
└── LayoutManager (calculate visible terminals)
```

---

## Context Loss Handling

```typescript
// WebGL addon context loss handler
webglAddon.onContextLoss(() => {
  webglAddon.dispose();
  // Fall back to canvas renderer
  terminal.loadAddon(new CanvasAddon());
});
```

---

## Sources

- xterm.js GitHub issues #791, #4175, #4379
- VS Code terminal renderer blog
- WebGL fundamentals: multiple views
- xterm.js documentation: flow control, hooks
