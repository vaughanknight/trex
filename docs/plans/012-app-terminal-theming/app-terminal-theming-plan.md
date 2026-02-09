# Apply Terminal Theme to Entire App UI - Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-09
**Spec**: [./app-terminal-theming-spec.md](./app-terminal-theming-spec.md)
**Status**: IN_PROGRESS

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [Implementation](#implementation)
4. [Change Footnotes Ledger](#change-footnotes-ledger)

## Executive Summary

The terminal theme (Dracula, Nord, Tokyo Night, etc.) currently only applies to
xterm.js. The sidebar, settings panel, buttons, and all other UI stay in a
hardcoded generic dark mode. This plan creates a utility function that maps
terminal theme colors to CSS custom properties and applies them to `:root`,
making the entire app visually match the selected terminal theme. The existing
Tailwind `@theme inline` bridge means zero component changes — all utilities
like `bg-background` and `text-sidebar-foreground` automatically pick up the new
values.

## Critical Research Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `@theme inline` maps `--color-background: var(--background)` — setting `--background` on `:root` via `style.setProperty()` cascades to all Tailwind utilities automatically | Set inner CSS vars (`--background`, `--foreground`, etc.); no component changes needed |
| 02 | Critical | CSS variables accept hex directly — no OKLCH conversion required; `--background: #282a36` works fine alongside existing OKLCH defaults | Use hex values from terminal themes directly |
| 03 | Critical | `ThemePreviewProvider` wraps only the main app (line 51 of App.tsx), NOT the LoginPage early return (line 33) | CSS var hook must read committed theme from store directly, and optionally use preview when context is available |
| 04 | High | `.dark` class is hardcoded on `<html>` in `index.html`; `isDark` flag exists on all ThemeInfo objects but is never read | Toggle `.dark` class dynamically based on `getThemeInfoById(id).isDark` |
| 05 | High | 15+ `dark:` prefixed Tailwind classes across button.tsx, input.tsx, select.tsx, tabs.tsx, context-menu.tsx, badge.tsx | These work correctly with dynamic `.dark` toggling — `@custom-variant dark (&:is(.dark *))` handles it |
| 06 | High | Terminal themes provide background + foreground + ANSI colors; ~15 CSS vars need derivation (border, muted, accent, etc.) | Compute derived colors in JS via hex color mixing; use `selectionBackground` for accent, `blue` for primary, `red` for destructive |
| 07 | High | `--sidebar-primary` and `--sidebar-primary-foreground` are defined in CSS but never used in sidebar.tsx | Set them anyway for completeness but they have no visual effect currently |
| 08 | Medium | Solarized Dark has muted foreground (#839496, contrast 7.02:1) — derived `--muted-foreground` could be too faint | Use higher mix ratio (60% fg) for Solarized-type themes, or use a minimum luminance floor |
| 09 | Medium | One Dark/One Light use blue cursor (#528bff/#526fff) different from foreground — `--primary` needs a consistent source | Use `theme.blue` (the ANSI blue) for `--primary` across all themes — it's the most consistently "accent-like" color |
| 10 | Medium | LoginPage currently uses inline styles from theme; once CSS vars are driven by theme, it can revert to Tailwind classes | Simplify LoginPage to use `bg-background`, `text-foreground` etc. instead of inline styles |
| 11 | Medium | `body { background-color: #1e1e1e }` in index.css (line 24) is hardcoded outside CSS variables | Remove or replace with `var(--background)` so body matches theme on initial load |
| 12 | Low | `--chart-1` through `--chart-5` exist but are unused in the app | Skip mapping chart colors — no visual impact |

## Implementation (Single Phase)

**Objective**: Make the entire app UI reflect the selected terminal theme by
dynamically overriding CSS custom properties on `:root`.

**Testing Approach**: Hybrid — unit tests for color mapping/derivation, manual visual verification for all 12 themes
**Mock Usage**: Fakes only (per ADR-0004); prefer real theme objects

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|-------|
| [x] | T001 | Create `applyThemeToCSS` utility with hex color mixing helpers | 2 | Core | -- | `/Users/vaughanknight/GitHub/trex/frontend/src/utils/themeCSS.ts` | Function accepts ITheme + isDark, returns Record<string, string> of ~28 CSS vars; hex mixing produces valid colors | Pure function, no side effects; handles both dark and light themes |
| [x] | T002 | Write unit tests for `applyThemeToCSS` | 2 | Test | T001 | `/Users/vaughanknight/GitHub/trex/frontend/src/utils/__tests__/themeCSS.test.ts` | Tests cover: all 12 themes produce valid hex output; derived colors differ from background; border/muted values are between bg and fg; isDark=false produces light-appropriate values | Test with real theme objects from themes/index.ts |
| [x] | T003 | Create `useAppTheme` hook that applies CSS vars to `:root` and toggles `.dark` | 2 | Core | T001 | `/Users/vaughanknight/GitHub/trex/frontend/src/hooks/useAppTheme.ts` | Hook reads committed theme from settings store; applies CSS vars via `document.documentElement.style.setProperty()`; toggles `.dark` class based on `isDark` | Must work outside ThemePreviewProvider (for LoginPage) |
| [x] | T004 | Integrate `useAppTheme` in App.tsx — call before needsLogin check | 1 | Integration | T003 | `/Users/vaughanknight/GitHub/trex/frontend/src/App.tsx` | CSS vars applied on initial render and when theme changes; LoginPage and main app both see correct theme colors | Call hook at top of App() before any early returns |
| [x] | T005 | Extend `useAppTheme` to support theme preview (hover in ThemeSelector) | 2 | Core | T003, T004 | `/Users/vaughanknight/GitHub/trex/frontend/src/hooks/useAppTheme.ts` | When hovering over theme in selector, sidebar/settings panel colors change in real-time; reverts on mouse leave | Use optional ThemePreviewContext — gracefully handle being outside provider |
| [x] | T006 | Simplify LoginPage — remove inline theme styles, use Tailwind classes | 1 | Cleanup | T004 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/LoginPage.tsx` | LoginPage uses `bg-background`, `text-foreground` etc. instead of inline styles; remove `useSettingsStore`/`getThemeById` imports | Keeps component simpler and DRY |
| [x] | T007 | Fix hardcoded `body { background-color: #1e1e1e }` in index.css | 1 | Cleanup | T001 | `/Users/vaughanknight/GitHub/trex/frontend/src/index.css` | Body background uses CSS variable, not hardcoded hex | Change to `background-color: var(--background)` or remove (base layer already sets `bg-background`) |
| [x] | T008 | Remove hardcoded `class="dark"` from index.html | 1 | Cleanup | T003 | `/Users/vaughanknight/GitHub/trex/frontend/index.html` | `.dark` class managed dynamically by useAppTheme hook; initial load uses settings store hydration | Kept `class="dark"` as default for flash prevention; hook overrides on hydration |
| [x] | T009 | Run `npm run build` to verify zero new errors | 1 | Validate | T001-T008 | `/Users/vaughanknight/GitHub/trex/frontend/` | Build passes (AC-09) | Pre-push CI check |
| [ ] | T010 | Manual verification — test all 12 themes visually | 1 | Validate | T009 | -- | AC-01 through AC-08 verified: sidebar, settings panel, buttons, inputs all match theme; light themes switch to light mode; preview works on hover; no flash on load | Use ngrok for full auth flow testing |

### Acceptance Criteria
- [ ] AC-01: Dark theme (e.g., Dracula) — sidebar, settings, all UI use theme's background/foreground
- [ ] AC-02: Light theme (e.g., solarized-light) — app switches to light mode, UI uses light colors
- [ ] AC-03: Theme preview on hover changes full app appearance (not just terminal)
- [ ] AC-04: Borders, muted text, accent colors are visually coherent per theme
- [ ] AC-05: All 12 themes produce readable UI text (WCAG AA 4.5:1)
- [ ] AC-06: Theme changes are instant — no transition or flash
- [ ] AC-07: Login page continues to use saved terminal theme
- [ ] AC-08: Terminal latency remains under 50ms
- [ ] AC-09: `npm run build` passes with zero new errors
- [ ] AC-10: No new npm packages added

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Derived colors have poor contrast on Solarized Dark | Medium | Medium | Test explicitly; use minimum luminance floor for muted-foreground |
| Body flash before settings hydration | Low | Medium | Keep `class="dark"` as default in HTML; hook overrides after hydration |
| `dark:` Tailwind classes don't respond to dynamic toggling | Low | High | Tested: `@custom-variant dark (&:is(.dark *))` handles dynamic class changes correctly |

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
