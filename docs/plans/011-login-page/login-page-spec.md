# Branded Login Page

**Mode**: Simple

## Summary

When authentication is enabled and the user is not logged in, trex currently shows a minimal "Authentication Required" message inside the main app layout (sidebar still visible). Replace this with a dedicated full-screen login page featuring large ASCII art "TREX" branding rendered in a terminal aesthetic, with a single "Login with GitHub" button below it. The sidebar and all other app chrome should be hidden.

**WHY**: The current login experience is bare and unpolished. A branded login page gives trex a distinct identity, signals professionalism, and provides a clear single-action entry point. Hiding the sidebar when logged out also prevents confusion — users shouldn't see session controls they can't use.

## Goals

- G-01: Full-screen login page with no sidebar, settings panel, or other app chrome visible
- G-02: Large ASCII art "TREX" text rendered in monospace, using repeating "TREX" characters as the fill pattern for block letters
- G-03: Single prominent "Login with GitHub" button centered below the ASCII art
- G-04: Page background styled as a full-screen terminal using the current theme's terminal background color, with the TREX logo centered — should feel like a terminal that has the current theme applied
- G-04a: Uses standard theme colors (text-foreground, bg-background) — no custom green/amber, just the user's current theme
- G-05: Zero additional npm dependencies — ASCII art is hardcoded or generated with inline code
- G-06: Login page also shown after a user logs out (same page, no flash of app UI)

## Non-Goals

- NG-01: No animation, typing effects, or CRT scan-line filters (keep it simple)
- NG-02: No "remember me" or alternative login methods
- NG-03: No custom branding configuration (logo, colors, tagline) — hardcoded for now
- NG-04: No responsive mobile layout optimizations beyond basic centering

## Complexity

- **Score**: CS-1 (trivial)
- **Breakdown**: S=0, I=0, D=0, N=0, F=0, T=0
  - Surface Area: 1 new component + minor edit to App.tsx (2 files)
  - Integration: Internal only, reuses existing auth store
  - Data/State: No state changes
  - Novelty: Well-specified, clear requirements
  - Non-Functional: Standard
  - Testing: Visual verification only
- **Confidence**: 0.95
- **Assumptions**: Existing `needsLogin` logic in App.tsx is correct and sufficient
- **Dependencies**: None — auth store and `/auth/github` route already exist
- **Risks**: None significant
- **Phases**: Single phase — create component, update App.tsx

## Acceptance Criteria

- AC-01: When `needsLogin` is true, the login page renders full-screen with no sidebar or settings panel visible
- AC-02: ASCII art "TREX" is displayed in large monospace block letters where filled regions use repeating "TREX" characters
- AC-03: A "Login with GitHub" button is centered below the ASCII art and navigates to `/auth/github` on click
- AC-04: The page looks like a full-screen terminal with the current theme applied — background uses the terminal/app background color, text uses theme foreground
- AC-05: After logging out, the user sees the login page (not a flash of the app)
- AC-06: No new npm packages are added to package.json
- AC-07: The frontend build (`npm run build`) passes with no new errors

## Risks & Assumptions

- **Assumption**: The ASCII art will be legible at typical desktop viewport widths. Very narrow windows may cause line wrapping — acceptable for v1.
- **Assumption**: The existing `needsLogin` derivation in App.tsx correctly handles the logout-to-login transition without UI flash (the `authLoading` guard should handle this).

## Testing Strategy

- **Approach**: Manual Only
- **Rationale**: Static UI page with a single button — visual verification is sufficient
- **Verification**: Open app with auth enabled and no session cookie; confirm login page renders correctly

## Documentation Strategy

- **Location**: None
- **Rationale**: Internal UI change, self-explanatory to users

## Open Questions

None — requirements are clear from the research and clarification phases.

## ADR Seeds (Optional)

Not applicable — no architectural decisions needed for this change.

## Clarifications

### Session 2026-02-09

- **Q1 (Mode)**: Simple — pre-set in spec (CS-1 trivial)
- **Q2 (Testing)**: Manual Only — visual verification sufficient for a static UI page
- **Q3 (Color scheme)**: Use current theme colors, not custom green/amber. The login page should look like a full-screen terminal with the current theme applied, TREX logo centered.
