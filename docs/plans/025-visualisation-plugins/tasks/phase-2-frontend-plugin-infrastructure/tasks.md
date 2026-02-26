# Phase 2: Frontend Plugin Infrastructure – Tasks & Alignment Brief

**Spec**: [../../visualisation-plugins-spec.md](../../visualisation-plugins-spec.md)
**Plan**: [../../visualisation-plugins-plan.md](../../visualisation-plugins-plan.md)
**Date**: 2026-02-26

---

## Executive Briefing

### Purpose
Build the frontend infrastructure that receives plugin data from the backend and makes it available to rendering components. This is the frontend counterpart to Phase 1's backend plumbing.

### What We're Building
1. **Plugin registry** — `registerPlugin()` API where plugins declare their ID, process triggers, components, and store
2. **Plugin store factory** — isolated Zustand stores per plugin (following activityStore pattern)
3. **WebSocket routing** — `plugin_data` messages routed to correct plugin store
4. **Plugin settings** — namespaced settings in settings store with per-plugin + per-surface toggles
5. **Active process tracking** — session store tracks detected process name per session

---

## Tasks

| Status | ID | Task | CS | Dependencies | Files | Validation |
|--------|------|------|-----|-------------|-------|------------|
| [ ] | T001 | Create plugin registry | 2 | – | `frontend/src/plugins/pluginRegistry.ts` | `registerPlugin()`, `getPlugin()`, `getEnabledPlugins()`. Type-safe VisualisationPlugin interface. |
| [ ] | T002 | Create plugin store factory | 2 | – | `frontend/src/plugins/pluginStore.ts` | `createPluginStore(pluginId)` returns Zustand store with `data: Map<sessionId, unknown>`, `updateData()`, `clearData()`. |
| [ ] | T003 | Route plugin_data in WebSocket handler | 2 | T002 | `frontend/src/hooks/useCentralWebSocket.ts` | `plugin_data` messages dispatched to registry's store for correct pluginId. |
| [ ] | T004 | Add pluginSettings to settings store | 2 | – | `frontend/src/stores/settings.ts` | `pluginSettings: Record<string, PluginSettingsEntry>`. Per-plugin enable + per-surface toggles. Persisted. |
| [ ] | T005 | Add activeProcess to session store | 1 | – | `frontend/src/stores/sessions.ts`, `frontend/src/hooks/useCentralWebSocket.ts` | Session has `activeProcess?: string[]`. Updated from process detection data or plugin_data messages. |
| [ ] | T006 | Verify build + tests | 1 | T001-T005 | all | `npm run build` clean. `npx vitest run` — all pass. |

---

## Alignment Brief

### Patterns to Follow
- **activityStore.ts** — isolated Zustand store with Map<sessionId, data>, scalar selectors
- **useShallow** — for any array/object selectors from plugin stores
- **WebSocket routing** — add handler before per-session dispatch (like cwd_update)
- **Settings persistence** — namespaced under `pluginSettings` object to avoid store bloat

### ADR Constraints
- **ADR-0004**: No mocks. Plugin store tests use real Zustand stores.
- **ADR-0011**: Plugins attach per-pane via unified WorkspaceItem model.

### Test Plan
| Test | Rationale |
|------|-----------|
| Plugin registry CRUD | Register, retrieve, list enabled |
| Plugin store isolation | Two stores don't cross-contaminate |
| WebSocket plugin_data routing | Message dispatched to correct store |

---
