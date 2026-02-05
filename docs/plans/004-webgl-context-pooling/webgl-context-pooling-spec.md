# WebGL Context Pooling for Multi-Session Terminal Support

**Mode**: Full

📚 **This specification incorporates findings from:**
- `003-sidebar-settings-sessions/research/webgl-context-pooling.md` (technical research dossier)
- `003-sidebar-settings-sessions/external-research/xterm-multiinstance-performance.md` (xterm.js performance research)
- `003-sidebar-settings-sessions/research-dossier.md` (Critical Finding 04: WebGL context limits)

**GitHub Issue:** [#22 - feat: Implement WebGL context pooling for multi-session support](https://github.com/vaughanknight/trex/issues/22)

---

## Research Context

### From WebGL Pooling Research (`003-sidebar-settings-sessions/research/webgl-context-pooling.md`)

**Components Affected**:
- `frontend/src/components/Terminal.tsx` - WebGL addon initialization (lines 114-130)
- `frontend/src/components/TerminalContainer.tsx` - WebGL session allocation (lines 43-59)
- `frontend/src/stores/` - New pool store required

**Critical Architectural Constraint**:
The `useWebGL` prop in Terminal.tsx is captured in a ref on mount (line 41: `useWebGLRef.current`). This means changing the prop after mount has **no effect**. The current `maxWebGLSessions` strategy in TerminalContainer only affects newly created terminals, not existing ones.

**Current Resource Flow**:
```
Terminal Mount → Create XTerm → Load WebGL Addon → Own WebGL Context
Terminal Unmount → Dispose WebGL Addon → Release Context
Session Switch → No Context Reuse (critical gap)
```

**xterm.js Constraints**:
- WebglAddon is designed for 1:1 binding with terminal instances
- Cannot share WebGL context between addons
- Addon must be disposed and recreated to "transfer" - cannot be reattached
- Context loss triggers automatic fallback to DOM renderer

### From xterm.js Multi-Instance Research (`xterm-multiinstance-performance.md`)

**WebGL Context Limits (Critical)**:
| Browser | Max Contexts | Behavior When Exceeded |
|---------|--------------|------------------------|
| Chrome | 16 | Older contexts silently lost |
| Firefox | 8-16 | Context loss errors |
| Safari/iOS | Even more restrictive | Unpredictable failures |

**Memory Per Instance**:
| Configuration | Memory |
|---------------|--------|
| 160x24, 5000 lines scrollback | ~34 MB |
| 160x24, 3000 lines scrollback | ~20 MB |
| 160x24, 1000 lines scrollback | ~7-10 MB |

**Recommended Architecture**:
- pause/resume renderer API for hidden terminals
- Hybrid rendering: WebGL active, Canvas/DOM for others
- Instance pooling with pre-allocation
- VS Code pattern: maintains DOM structure when hidden

### From Phase 5 Integration Work

**Bugs Fixed That Inform This Work**:
- Context loss causing blank terminals - fixed with `terminal.refresh()` on context loss
- Hidden terminals sending resize with tiny dimensions - fixed with `isActiveRef` guard
- Race condition in session creation - fixed with callback queue

**Current Mitigation**: `maxWebGLSessions = 3` - works but is suboptimal

---

## Summary

Enable trex to support 20+ concurrent terminal sessions without hitting browser WebGL context limits by implementing a WebGL addon pool that efficiently reuses contexts across session switches.

**WHAT**: Replace the current 1:1 terminal-to-WebGL-context mapping with a pooled approach where:
- Active terminal always receives a WebGL addon from the pool
- Inactive terminals release their addon back to the pool
- Pool manages addon lifecycle with LRU eviction
- Device capability detection sizes pool appropriately

**WHY**: The current implementation has fundamental limitations:
1. **Fixed limit**: `maxWebGLSessions = 3` regardless of device capability (M3 Pro can handle 6-8)
2. **Frozen allocation**: `useWebGL` prop captured on mount means dynamic reallocation doesn't work
3. **No reuse**: Each session switch creates/destroys WebGL contexts (50-100ms overhead)
4. **Context exhaustion**: Opening 17+ sessions can exhaust browser limits, causing silent failures
5. **User-visible issues**: Blank terminals when contexts are lost

This is a **performance and scalability enhancement** to the multi-session foundation established in Phase 5.

---

## Goals

1. **Support 20+ terminal sessions**: Users can create many sessions without WebGL context exhaustion
2. **Active terminal always gets WebGL**: The focused terminal has GPU-accelerated rendering for <50ms latency
3. **Efficient context reuse**: Session switching reuses pooled addons instead of create/destroy cycles
4. **Device-aware pool sizing**: Pool size adapts to detected GPU capability (4-8 contexts)
5. **Graceful degradation**: When pool is exhausted, terminals fall back to DOM renderer without errors
6. **Observable pool state**: Debug metrics available for troubleshooting (acquire/release/eviction counts)

---

## Non-Goals

1. **WebGL context sharing**: xterm.js WebglAddon doesn't support shared contexts; out of scope
2. **WebGPU migration**: Future enhancement when `@nicholasrice/xterm-addon-webgpu` stabilizes
3. **Canvas addon fallback**: xterm v6 removed CanvasAddon; DOM renderer is the fallback
4. **Session preview thumbnails**: Live previews for sidebar would require additional WebGL contexts
5. **Per-session WebGL preference**: All sessions use the same pooling strategy
6. **Scrollback optimization**: Per-terminal scrollback configuration is separate concern
7. **Texture atlas sharing**: Advanced GPU optimization deferred to future work

---

## Complexity

**Score**: CS-3 (medium)

**Breakdown**:
| Factor | Score | Rationale |
|--------|-------|-----------|
| **S**urface Area | 1 | 2 new files, 2 modified files, frontend only |
| **I**ntegration | 1 | Zustand already in use; xterm.js existing dependency |
| **D**ata/State | 1 | New pool state schema, no persistence/migrations |
| **N**ovelty | 1 | Well-researched; xterm.js addon lifecycle understood |
| **F**unctional | 1 | Performance-sensitive (latency); device detection heuristics |
| **T**esting | 1 | Unit tests for pool, integration tests for session switching |
| **Total** | **6** | |

**Confidence**: 0.80

Lower confidence than typical due to:
- xterm.js WebglAddon disposal/recreation timing not fully tested at scale
- Device capability detection is heuristic-based
- LRU eviction ordering edge cases

**Assumptions**:
1. WebglAddon can be disposed from one terminal and a new addon created for another without leaks
2. `terminal.refresh()` after addon attachment renders correctly
3. GPU detection via `WEBGL_debug_renderer_info` extension is available in all target browsers
4. `requestAnimationFrame` timing is sufficient to avoid flicker during addon transfer

**Dependencies**:
- Zustand (already installed: v5.0.11)
- @xterm/addon-webgl (already installed: v0.19.0)
- No new dependencies required

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Terminal flicker during addon transfer | Medium | Medium | Use requestAnimationFrame, refresh before showing |
| Memory leaks from improper disposal | Low | High | Strict dispose() calls in release(), tests for leak detection |
| GPU detection inaccuracy | Medium | Low | Conservative defaults (4 contexts), user-configurable override |
| Pool state desync with actual contexts | Low | High | Single source of truth in store, defensive getStats() |

**Phases** (high-level):
1. **Pool Foundation**: Create Zustand store with acquire/release/LRU mechanics
2. **GPU Detection**: Device capability utility with conservative defaults
3. **Terminal Integration**: Modify Terminal.tsx to use pool based on isActive
4. **Container Simplification**: Remove static WebGL tracking from TerminalContainer
5. **Testing & Metrics**: Unit tests, integration tests, debug observability

---

## Acceptance Criteria

### Pool Mechanics

**AC-01**: Pool initializes with device-appropriate size
- Given: App starts on a device with Apple Silicon GPU
- Then: Pool maxSize is set to 6 (conservative for Apple Metal limits)
- And: Pool is empty until first terminal becomes active

**AC-02**: Active terminal acquires WebGL from pool
- Given: A terminal session becomes active
- When: Terminal component's isActive prop becomes true
- Then: Terminal acquires WebGL addon from pool
- And: Terminal renders with GPU acceleration

**AC-03**: Inactive terminal releases WebGL to pool
- Given: A terminal has WebGL addon and another session becomes active
- When: Terminal's isActive prop becomes false
- Then: WebGL addon is disposed and released back to pool
- And: Terminal continues rendering with DOM renderer

**AC-04**: Pool creates new addon when space available
- Given: Pool has 3 active addons, maxSize is 6
- When: A new session becomes active
- Then: Pool creates a new WebGL addon (total: 4)
- And: New terminal renders with GPU acceleration

**AC-05**: Pool evicts LRU when full
- Given: Pool is at maxSize (e.g., 6 active addons)
- When: A new session becomes active
- Then: Least recently used session's addon is evicted
- And: New session acquires WebGL successfully
- And: Evicted session falls back to DOM renderer

### Session Switching

**AC-06**: Fast session switching reuses pool
- Given: 10 sessions exist, pool maxSize is 6
- When: User switches between sessions rapidly
- Then: Active session always has WebGL (within one frame)
- And: No WebGL context errors in console
- And: No blank terminal states

**AC-07**: Session switching preserves terminal content
- Given: Session A has terminal output, Session B is active
- When: User switches back to Session A
- Then: All previous output is visible
- And: Cursor position is preserved
- And: Terminal is responsive to input

### Graceful Degradation

**AC-08**: Context loss falls back to DOM
- Given: A terminal has WebGL addon
- When: WebGL context is lost (GPU reset, system sleep)
- Then: Terminal automatically falls back to DOM renderer
- And: Pool marks the slot as available
- And: No error shown to user (warning in console only)

**AC-09**: Pool exhaustion doesn't crash
- Given: Pool is full and all slots actively used
- When: New session becomes active but can't acquire addon
- Then: Session operates with DOM renderer
- And: No error shown to user
- And: Pool stats show exhausted state

### Observability

**AC-10**: Pool stats available for debugging
- Given: Developer needs to debug WebGL allocation
- When: Calling `webglPool.getStats()` (or inspecting store)
- Then: Returns accurate counts: { maxSize, activeCount, availableCount }
- And: Device capability detection result is visible

### Device Detection

**AC-11**: GPU capability detection runs once on app start
- Given: App initializes
- Then: GPU is detected via WEBGL_debug_renderer_info
- And: Pool maxSize is set appropriately:
  - Apple Silicon: 6
  - Intel integrated: 4
  - NVIDIA/AMD discrete: 8
  - Unknown/WebGL unavailable: 4 (conservative default)

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Addon transfer timing** - Flicker or blank frame during session switch | Medium | Medium | requestAnimationFrame + terminal.refresh() sequence |
| **Memory leaks** - Disposed addons not fully cleaned up | Low | High | Explicit dispose() in release(), memory profiling in tests |
| **LRU correctness** - Wrong session evicted | Low | Medium | Track lastAccess timestamp, unit tests for ordering |
| **Device detection false negatives** - Capable GPU detected as weak | Medium | Low | Conservative defaults are safe; can add user override setting |
| **Context loss cascades** - One context loss triggers others | Low | High | Isolate context loss handling per pool slot |

### Assumptions

1. **Browser support**: Target browsers support WEBGL_debug_renderer_info extension (Chrome, Firefox, Safari, Edge all do)
2. **xterm.js stability**: WebglAddon.dispose() fully releases WebGL resources without leaks
3. **React timing**: useEffect with isActive dependency fires before next paint
4. **User behavior**: Users don't switch sessions faster than 60fps (requestAnimationFrame is sufficient)
5. **Pool size adequacy**: 4-8 pooled contexts is sufficient for typical usage (active + recently viewed)

---

## Testing Strategy

**Approach**: Hybrid (TDD + Lightweight)

**Rationale**: Pool mechanics (acquire/release/LRU) are algorithmic and benefit from TDD. GPU detection is heuristic-based and benefits from lightweight validation.

**Focus Areas**:
- **TDD**: Pool store (acquire, release, eviction ordering, capacity limits)
- **TDD**: Session switching integration (WebGL transfer, state preservation)
- **Lightweight**: GPU detection utility (heuristics, fallback behavior)
- **Lightweight**: Context loss recovery paths

**Excluded**:
- xterm.js WebglAddon internals (library responsibility)
- Visual rendering verification (manual testing)
- Cross-browser GPU detection variations (too many permutations)

**Mock Policy**: FAKES ONLY (per constitution ADR-0004)
- Create `FakeWebglAddon` for pool tests (tracks dispose() calls, simulates context loss)
- Create `FakeGPUContext` for detection tests (returns controlled renderer strings)
- No mocking frameworks (jest.mock, sinon) permitted

**TDD-Specific**:
- Pool store tests written before implementation
- Edge cases: rapid acquire/release, eviction tiebreakers, pool exhaustion
- Integration tests verify Terminal component correctly uses pool

---

## Documentation Strategy

**Location**: docs/how/ only

**Rationale**: WebGL pooling is an internal optimization transparent to users. No user-facing changes warrant README updates. Architecture documentation helps future maintainers understand the pooling strategy.

**Content**:
- `docs/how/webgl-pooling.md`: Pool architecture, LRU strategy, device detection heuristics, debugging pool state

**Target Audience**: Contributors maintaining/extending terminal rendering

**Maintenance**: Update when pool strategy changes or new device heuristics added

---

## Open Questions

~~All resolved - see Clarifications section below.~~

1. ~~**[User Override]**: Should users be able to manually configure pool size in settings?~~
   - **RESOLVED**: No - automatic device detection only. Simpler UX.

2. ~~**[Eviction Strategy]**: Should eviction prefer terminals with less content/activity?~~
   - **RESOLVED**: Pure LRU. Sessions "reinflate" into WebGL when accessed, naturally prioritizing recently-used terminals.

3. ~~**[Metrics Persistence]**: Should pool metrics be persisted for debugging across sessions?~~
   - **RESOLVED**: In-memory only. DevTools inspection sufficient; no localStorage overhead.

---

## ADR Seeds (Optional)

### ADR-004: WebGL Addon Pool Strategy

**Decision Drivers**:
- xterm.js WebglAddon is 1:1 with terminal instances
- Browser limits WebGL contexts to 8-16 per tab
- Session switching should not incur WebGL context creation overhead
- Active terminal must always have WebGL for <50ms latency

**Candidate Alternatives**:
- A. **Addon Pool (dispose/recreate)** - Pool manages addon count, disposes on release, creates on acquire
- B. **Context Pool (lower level)** - Pool raw WebGL contexts, create addons as wrappers
- C. **Terminal Instance Pool** - Pool entire XTerm + addon combos, reassign to sessions
- D. **No pooling (status quo)** - Keep maxWebGLSessions=3, accept DOM fallback

**Stakeholders**: Frontend performance, user experience

**Recommended**: Option A - Addon Pool
- Works within xterm.js design constraints
- Cleaner implementation than Option B
- Less refactoring than Option C
- Significant improvement over Option D

---

## External Research

**Incorporated**:
- `003-sidebar-settings-sessions/research/webgl-context-pooling.md` (created during this planning session)
- `003-sidebar-settings-sessions/external-research/xterm-multiinstance-performance.md`
- `003-sidebar-settings-sessions/research-dossier.md` (Critical Finding 04)

**Key Findings**:
| Source | Insight | Applied To |
|--------|---------|------------|
| xterm-multiinstance | WebGL limit 8-16 per tab | Goals, AC-01, AC-11 |
| xterm-multiinstance | pause/resume renderer pattern | Non-Goals (already implemented via display:none) |
| xterm-multiinstance | VS Code uses fallback chain: WebGL→Canvas→DOM | AC-08, AC-09 |
| webgl-pooling-research | useWebGL prop frozen on mount | Summary (problem statement) |
| webgl-pooling-research | Addon 1:1 binding constraint | ADR-004 |
| webgl-pooling-research | LRU eviction strategy | AC-05 |
| research-dossier | PL-13: Dispose terminal on unmount | Risk mitigation |

**Applied To**:
- Problem statement: Research confirmed useWebGL prop limitation
- Goals: Realistic pool sizes from browser limits research
- Complexity: Reduced novelty score due to thorough research
- Risks: Memory leak risk highlighted by PL-13
- ADR: All alternatives informed by technical constraints from research

---

## Unresolved Research

**Topics**: None

All identified research opportunities have been addressed:
- WebGL context limits → covered in xterm-multiinstance-performance.md
- Addon lifecycle behavior → covered in webgl-context-pooling.md
- Device detection approaches → covered in webgl-context-pooling.md

---

---

## Clarifications

### Session 2026-02-05

**Q1: Workflow Mode**
- **Answer**: B (Full)
- **Rationale**: CS-3 complexity, performance-sensitive code, multiple phases. Full gates and testing warranted.

**Q2: Testing Strategy**
- **Answer**: E (Hybrid)
- **Rationale**: TDD for pool mechanics (acquire/release/LRU algorithmic logic), lightweight for GPU detection heuristics.

**Q3: Mock Policy**
- **Answer**: B (Fakes only)
- **Rationale**: Per constitution ADR-0004. Create FakeWebglAddon and FakeGPUContext for deterministic testing. No mocking libraries.

**Q4: Documentation Strategy**
- **Answer**: B (docs/how/ only)
- **Rationale**: Internal optimization transparent to users. Architecture docs help maintainers understand pooling strategy.

**Q5: User Override for Pool Size**
- **Answer**: A (No - automatic only)
- **Rationale**: Device detection handles it. Simpler UX, less confusion. Power users rarely need to tune this.

**Q6: Eviction Strategy**
- **Answer**: A (Pure LRU)
- **Rationale**: Simple, predictable. Sessions "reinflate" into WebGL when accessed - old sessions regain WebGL naturally when user returns to them. Matches user mental model.

**Q7: Metrics Persistence**
- **Answer**: A (In-memory only)
- **Rationale**: Pool metrics reset on refresh. DevTools inspection sufficient for debugging. No localStorage overhead.

---

**Spec Version**: 1.1.0
**Created**: 2026-02-05
**Status**: Clarified - Ready for Architecture

---

*Next step: Run `/plan-3-architect` to generate the phase-based plan.*
