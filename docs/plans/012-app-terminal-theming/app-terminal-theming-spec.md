# Apply Terminal Theme to Entire App UI

**Mode**: Simple
**GitHub Issue**: https://github.com/vaughanknight/trex/issues/40

## Research Context

Research was conducted inline (no separate dossier file). Key findings:

- **Components affected**: All shadcn/ui components (~15 files in `components/ui/`), sidebar, settings panel, login page, context menus, buttons, inputs, dialogs
- **Critical dependencies**: Tailwind CSS v4 `@theme inline` block bridges CSS variables to utility classes; ~28 CSS variables drive all UI colors; `.dark` class hardcoded on `<html>`
- **Modification risks**: Low — changing CSS variable values at runtime requires zero component modifications. All Tailwind classes (`bg-background`, `text-sidebar-foreground`, etc.) automatically reflect updated variable values.
- **Existing pattern**: `LoginPage.tsx` already applies terminal theme colors via inline styles, proving the concept works.
- **`isDark` flag**: Every `ThemeInfo` object has an `isDark` boolean but nothing currently reads it. Can be used to toggle `.dark` class dynamically.

## Summary

When a user selects a terminal theme (Dracula, Nord, Tokyo Night, etc.), only the xterm.js terminal changes color. The sidebar, settings panel, buttons, inputs, and all other app UI remain in a generic hardcoded dark mode. This creates a visual disconnect and undermines accessibility — users who chose a theme for vision needs don't get that benefit across the full interface.

This feature unifies terminal and app theming so the entire UI reflects the selected terminal theme. The approach overrides CSS custom properties dynamically from the terminal theme's color palette, requiring zero changes to individual components.

## Goals

- **Unified visual identity**: Sidebar, settings panel, dialogs, buttons, inputs, and all app chrome match the selected terminal theme
- **Accessibility parity**: Users who select a theme for vision needs (contrast, color sensitivity) get those benefits everywhere, not just in the terminal
- **Light/dark mode support**: Light themes (default-light, solarized-light, gruvbox-light, one-light) properly switch the app to light mode; dark themes use dark mode
- **Theme preview**: Hovering over a theme in the settings selector previews the full app appearance (not just terminal)
- **Zero-config**: Works automatically — selecting a terminal theme applies it everywhere
- **Instant switching**: Theme changes snap instantly with no transition animations (matches existing terminal behavior)

## Non-Goals

- Separate "app theme" and "terminal theme" selectors — a single theme selection drives everything
- Custom user-defined themes or theme editor
- CSS transition animations between themes
- Theme scheduling (auto light/dark by time of day)
- Per-session themes (different themes for different terminal sessions)

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=0, D=0, N=0, F=1, T=1
  - Surface Area (S=1): Touches multiple files but changes are concentrated — one new utility function, one integration point in App.tsx, and minor updates to LoginPage and ThemePreviewContext
  - Integration (I=0): Purely internal, no external dependencies
  - Data/State (D=0): No schema changes; uses existing settings store `theme` field
  - Novelty (N=0): Well-specified; research confirms approach and all 12 theme color mappings
  - Non-Functional (F=1): Must maintain WCAG AA contrast for derived colors; must not degrade terminal latency (<50ms per constitution)
  - Testing/Rollout (T=1): Unit tests for mapping function + manual visual verification
- **Confidence**: 0.90
- **Assumptions**:
  - Setting CSS variables on `document.documentElement.style` is performant and doesn't cause layout thrash
  - Derived colors (borders, muted text, accents) can be computed adequately from background + foreground via simple blending
  - All 12 themes have sufficient contrast for derived intermediate colors
- **Dependencies**: None beyond existing codebase
- **Risks**: Solarized Dark has tightest contrast at 7.02:1 — derived muted colors need care
- **Phases**: Single phase — create mapping function, integrate into App.tsx, extend theme preview

## Acceptance Criteria

- AC-01: When a dark terminal theme is selected (e.g., Dracula), the sidebar background, settings panel, and all UI elements use the theme's background and foreground colors
- AC-02: When a light terminal theme is selected (e.g., solarized-light), the app switches to light mode (`.dark` class removed) and UI uses the light theme's colors
- AC-03: Hovering over a theme in the settings selector previews the full app appearance (sidebar, settings panel colors change), not just the terminal
- AC-04: Borders, muted text, accent colors, and hover states are visually coherent with the selected theme (not clashing or unreadable)
- AC-05: All 12 built-in themes produce readable UI text (foreground on background meets WCAG AA 4.5:1 minimum)
- AC-06: Theme changes are instant — no visible transition or flash when switching themes
- AC-07: The login page continues to use the saved terminal theme (existing behavior preserved)
- AC-08: Terminal rendering latency remains under 50ms after theme integration
- AC-09: `npm run build` passes with zero new errors
- AC-10: No new npm packages added

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Derived colors (border, muted) have poor contrast on some themes | Medium | Medium | Test all 12 themes; use conservative blend ratios; add manual overrides per theme if needed |
| Setting ~28 CSS variables on every theme change causes paint/layout jank | Low | Medium | Batch all `setProperty` calls; browser optimizes CSS variable changes well |
| Theme preview (hover) updating full app feels jarring | Low | Low | Already established snap behavior for terminals; apply same to app |
| Some shadcn/ui components use `dark:` Tailwind prefix that conflicts with dynamic `.dark` toggling | Low | Medium | Verify button.tsx, select.tsx, input.tsx `dark:` classes work correctly when `.dark` is toggled dynamically |

## Testing Strategy

- **Approach**: Hybrid
- **Rationale**: Unit tests for the mapping function and color derivation logic; manual visual verification for all 12 themes' actual UI appearance
- **Focus Areas**: Color mapping function (ITheme → CSS variables), derived color calculations (borders, muted, accents), contrast ratios
- **Excluded**: Visual rendering tests — verified manually across all 12 themes
- **Mock Usage**: Fakes only (per ADR-0004); avoid fakes when real theme objects suffice for thorough testing

## Documentation Strategy

- **Location**: None
- **Rationale**: Internal change — theme unification is automatic. No user-facing documentation needed beyond the existing theme selector UI.

## Open Questions

None — research and clarification phases resolved all questions.

## Clarifications

### Session 2026-02-09

| # | Question | Answer | Sections Updated |
|---|----------|--------|-----------------|
| Q1 | Mode selection | Pre-set to Simple (CS-2 task) | Header |
| Q2 | Testing approach | Hybrid — unit tests for mapping + manual visual verification | Testing Strategy |
| Q3 | Mock usage | Fakes only; avoid when real objects suffice | Testing Strategy |
| Q4 | Documentation | No new documentation | Documentation Strategy |

**Coverage Summary**:
- **Resolved**: Mode, Testing, Mocks, Documentation
- **Deferred**: None
- **Outstanding**: None

## ADR Seeds (Optional)

- **Decision Drivers**: Single source of truth for colors; accessibility parity; zero component changes; instant switching
- **Candidate Alternatives**:
  - A: Override CSS variables on `:root` via `document.documentElement.style.setProperty()` (recommended — lightest touch)
  - B: Inject a `<style>` tag with `:root` overrides (similar but harder to clean up)
  - C: Use React context to pass theme colors as props (would require changing every component)
- **Stakeholders**: End users with accessibility needs; all users who select themes
