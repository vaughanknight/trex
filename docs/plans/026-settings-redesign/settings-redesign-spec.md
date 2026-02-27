# Settings Panel Redesign

**Mode**: Simple

## Summary

Redesign the settings panel with collapsible accordion groups, search filtering, and proper mobile scrolling. Transform a flat 3000px scroll of 30+ controls into an organized, searchable interface that works beautifully on desktop and mobile.

**WHY**: The settings panel has grown to 11 ungrouped sections. On mobile it's especially painful — long scroll, no way to find settings, no visual hierarchy. Grouping with accordions makes settings discoverable; search makes them instant.

## Goals

1. **Accordion groups** — 5 collapsible sections organizing 11 settings components
2. **Search bar** — real-time filtering by keyword, shows matching settings
3. **Mobile scroll fix** — proper touch scrolling with `overscroll-behavior: contain`
4. **Smooth animations** — accordion open/close transitions
5. **Beautiful design** — clean typography, subtle dividers, modern feel

## Non-Goals

- No new settings — just reorganization
- No backend changes
- No new dependencies (use existing Tailwind + CSS transitions)

## Design

### Accordion Groups

| Group | Icon | Settings Inside |
|-------|------|----------------|
| **Appearance** | Palette | Theme, Font Family, Font Size |
| **Terminal** | Terminal | Title Bar, Idle Indicators, Unfocused Pane Refresh |
| **Layout** | Layout | Layout Icons, URL Session Settings |
| **Integrations** | Plug | Link Detection, tmux Integration, Plugins |
| **Theme Bundles** | Sparkles | CRT Border, Auto-apply |

### Search Behavior

- Input at top with magnifying glass icon
- Filters accordion groups — only shows groups containing matches
- Highlights/expands matching groups automatically
- Clears with X button
- Placeholder: "Search settings..."

### Mobile Specifics

- Full-screen overlay (existing)
- `touch-action: pan-y` on scroll container
- `overscroll-behavior: contain` to prevent pull-to-refresh
- Backdrop dismiss (existing)
- Sticky header with search (doesn't scroll away)

## Acceptance Criteria

**AC-01**: Settings organized into 5 collapsible accordion groups
**AC-02**: Each group has icon + label + chevron indicator
**AC-03**: Groups expand/collapse with smooth height animation
**AC-04**: Search bar filters settings in real-time
**AC-05**: Search highlights and auto-expands matching groups
**AC-06**: Mobile scrolls smoothly (no stuck scroll)
**AC-07**: Desktop maintains sidebar panel behavior
**AC-08**: All existing settings still functional (no regressions)
**AC-09**: Empty search shows all groups (collapsed)

## Implementation (Single Phase)

### Tasks

| Status | ID | Task | Notes |
|--------|------|------|-------|
| [ ] | T001 | Create SettingsGroup accordion component | Collapsible with icon, label, chevron, smooth animation |
| [ ] | T002 | Create SettingsSearch component | Input with filter state, clear button |
| [ ] | T003 | Reorganize SettingsPanel into 5 groups | Wrap existing components in SettingsGroup |
| [ ] | T004 | Wire search filtering | Filter groups by keyword matching against labels |
| [ ] | T005 | Fix mobile scrolling | touch-action, overscroll-behavior, proper height |
| [ ] | T006 | Build + test | All platforms, all settings functional |

## Testing & Documentation Strategy

- **Testing**: Lightweight — manual visual verification on desktop + mobile
- **Documentation**: None needed (UI-only change)
