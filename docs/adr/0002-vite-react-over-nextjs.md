---
id: ADR-0002
title: "Vite + React over Next.js for frontend"
status: accepted
date: 2026-02-04
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: ["frontend", "architecture", "vite", "react", "nextjs"]
complexity: CS-3
---

# ADR-0002: Vite + React over Next.js for frontend

## Context

trex needs a modern React frontend for the web UI. The initial plan was Next.js, but upon analysis, the requirements were reassessed for both web and Electron distribution.

trex is a **localhost-only tool** with no public URL, no SEO requirements, and no server-side rendering needs. It's a single-page application that connects to a local Go backend.

## Decision Drivers

- **Simplicity**: Avoid unnecessary complexity
- **Electron support**: Need seamless dual distribution (web + desktop)
- **Build speed**: Fast development iteration
- **Bundle size**: Clean output for Go binary embedding
- **Developer experience**: Hot module replacement, TypeScript support

## Considered Options

### Option 1: Next.js with React

**Description**: Use Next.js App Router with React Server Components.

**Pros**:
- Industry standard for React apps
- Excellent documentation
- Built-in routing
- Server Components for performance

**Cons**:
- SSR complexity we don't need (localhost tool)
- App Router designed for server deployment
- Awkward fit with Electron (no server in desktop app)
- Heavier output bundle with Next.js runtime
- API routes duplicate Go backend functionality

### Option 2: Vite + React

**Description**: Use Vite as build tool with plain React SPA.

**Pros**:
- Blazing fast dev server (ESM-based)
- Simple SPA output (just HTML + JS + CSS)
- First-class Electron support via electron-vite
- No SSR complexity
- Smaller bundle size
- Same React components, same TypeScript

**Cons**:
- No built-in routing (need react-router)
- Less "batteries included" than Next.js
- Manual setup for some features

### Option 3: Remix

**Description**: Use Remix framework.

**Pros**:
- Modern React patterns
- Good data loading model

**Cons**:
- Server-focused like Next.js
- Same SSR overhead we don't need
- Less Electron ecosystem support

## Decision

**Chosen Option**: Option 2 (Vite + React) because:

1. **No SSR needed**: trex is localhost-only, no SEO, no public pages
2. **Electron support**: electron-vite provides seamless integration
3. **Simpler output**: Static files easy to embed in Go binary
4. **Faster development**: Vite's dev server is notoriously fast
5. **Right-sized tool**: Vite solves our actual problems without extras

## Consequences

### Positive

- Simpler architecture (pure SPA)
- Faster dev server and builds
- Same React codebase works in browser and Electron
- Cleaner Go binary embedding (just static files)
- Less framework-specific knowledge needed

### Negative

- Need to add react-router for routing
- No Server Components (but we don't need them)
- Less "magic" - more explicit configuration

### Neutral

- Same React components, hooks, and patterns
- Same TypeScript experience
- Same testing approach (Vitest instead of Jest)

## Implementation Notes

- Use `vite.config.ts` for build configuration
- Add `react-router-dom` for client-side routing
- Use `vitest` for unit testing (Vite-native)
- For Electron: use `electron-vite` tooling
- Build output goes to `dist/` for Go embedding

## References

- [Vite documentation](https://vitejs.dev/)
- [electron-vite](https://electron-vite.org/)
- [Constitution: Stack Decisions](../project-rules/constitution.md#stack-decisions)
