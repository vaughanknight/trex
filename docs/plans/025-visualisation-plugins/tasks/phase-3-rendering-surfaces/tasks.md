# Phase 3: Rendering Surfaces – Tasks & Alignment Brief

**Date**: 2026-02-26

---

## Executive Briefing

Add widget slots to PaneTitleBar (inline after session name), LayoutSidebarItem (per-pane below button), and a new PluginPanel component (inline overlay/pinned below title bar). Wire clicks to open panel.

---

## Tasks

| Status | ID | Task | CS | Files | Validation |
|--------|------|------|-----|-------|------------|
| [ ] | T001 | Add plugin widget slot to PaneTitleBar | 2 | `PaneTitleBar.tsx` | Enabled plugins render TitleBarWidget after session name. ≤40px per widget. |
| [ ] | T002 | Add plugin widget slot to LayoutSidebarItem | 2 | `LayoutSidebarItem.tsx` | Per-pane plugin widgets below sidebar button. Stacked for multi-pane. |
| [ ] | T003 | Create PluginPanel overlay component | 3 | `frontend/src/components/PluginPanel.tsx` | Overlay below title bar. Pin/unpin toggle. Dismiss on click outside. |
| [ ] | T004 | Wire panel open/close from widget clicks | 2 | `PaneTitleBar.tsx`, `PluginPanel.tsx` | Click widget → opens panel for that plugin. |
| [ ] | T005 | Add Plugins section to SettingsPanel | 2 | `SettingsPanel.tsx` | Lists plugins with per-plugin + per-surface toggles. |
| [ ] | T006 | Build + manual test | 1 | all | Build clean. Slots render. Panel opens/closes. |

---
