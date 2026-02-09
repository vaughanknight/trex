# Branded Login Page Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-09
**Spec**: [./login-page-spec.md](./login-page-spec.md)
**Status**: COMPLETE

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [Implementation](#implementation)
4. [Change Footnotes Ledger](#change-footnotes-ledger)

## Executive Summary

The current login gate renders a bare "Authentication Required" message inside
the app layout with the sidebar still visible. Replace it with a dedicated
full-screen `LoginPage` component featuring ASCII art "TREX" branding (built
from repeating "TREX" text as fill) and a centered "Login with GitHub" button.
The `needsLogin` check must short-circuit **before** `<SidebarProvider>` so no
app chrome is rendered.

## Critical Research Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `needsLogin` gate at App.tsx:53 is **inside** `<SidebarInset>` — sidebar renders even when logged out | Move `needsLogin` early return **above** `<SidebarProvider>` (line 46) |
| 02 | High | `useAuthInit()` must still run even on login page (it checks `/api/auth/enabled`) | Keep `useAuthInit()` call before the early return |
| 03 | High | Theme uses `bg-background` / `text-foreground` CSS classes (oklch colors) | Use these classes on the login page for theme consistency |
| 04 | Medium | `authLoading` guard prevents flash — `needsLogin` is false while loading | No change needed; existing guard handles logout→login transition (AC-05) |
| 05 | Medium | EmptyState pattern: centered flex container, muted text, icon above heading | Follow similar layout pattern for LoginPage |
| 06 | Low | ASCII art line wrapping on narrow viewports | Acceptable for v1 per spec; use `text-xs` or smaller for safety |

## Implementation (Single Phase)

**Objective**: Create a branded full-screen login page and render it before the
sidebar when authentication is required.

**Testing Approach**: Manual Only
**Mock Usage**: N/A

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|-------|
| [x] | T001 | Create ASCII art bitmap renderer | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/frontend/src/components/LoginPage.tsx` | Calling `renderAscii("TREX")` returns multi-line string with "TREX" fill pattern | Zero-dep inline function; ~1KB of code |
| [x] | T002 | Create LoginPage component | 1 | Core | T001 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/LoginPage.tsx` | Component renders full-screen with ASCII art + button; uses `bg-background text-foreground` theme classes | Single file with bitmap renderer + component |
| [x] | T003 | Move needsLogin gate above SidebarProvider in App.tsx | 1 | Core | T002 | `/Users/vaughanknight/GitHub/trex/frontend/src/App.tsx` | When `needsLogin=true`, LoginPage renders with no sidebar; `useAuthInit()` still runs | Early return pattern; remove old inline login UI (lines 53-65) |
| [x] | T004 | Run `npm run build` to verify | 1 | Validate | T003 | `/Users/vaughanknight/GitHub/trex/frontend/` | Build passes with zero new errors (AC-07) | Pre-push CI check per CLAUDE.md |
| [ ] | T005 | Manual verification via ngrok | 1 | Validate | T004 | -- | AC-01 through AC-06 verified visually | Clear cookies, load app, confirm login page |

### Acceptance Criteria
- [ ] AC-01: Login page renders full-screen with no sidebar or settings panel
- [ ] AC-02: ASCII art "TREX" displayed in block letters with "TREX" fill
- [ ] AC-03: "Login with GitHub" button navigates to `/auth/github`
- [ ] AC-04: Page uses current theme colors (terminal feel)
- [ ] AC-05: After logout, login page appears without flash
- [ ] AC-06: No new npm packages
- [x] AC-07: `npm run build` passes

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ASCII art wraps on narrow viewport | Low | Low | Use small font size; acceptable for v1 |

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
