# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the trex project.

## What is an ADR?

An ADR documents a significant architectural decision, including:
- The context and problem being addressed
- Options considered
- The decision made and rationale
- Consequences (positive, negative, neutral)

## ADR Index

| ID | Title | Status | Date | Complexity |
|----|-------|--------|------|------------|
| [ADR-0001](./0001-go-backend-with-tmax-library.md) | Go backend leveraging tmax library | Accepted | 2026-02-04 | CS-4 |
| [ADR-0002](./0002-vite-react-over-nextjs.md) | Vite + React over Next.js | Accepted | 2026-02-04 | CS-3 |
| [ADR-0003](./0003-dual-distribution-web-and-electron.md) | Dual distribution: Web + Electron | Accepted | 2026-02-04 | CS-4 |
| [ADR-0004](./0004-fakes-only-testing-no-mocks.md) | Fakes-only testing (no mocks) | Accepted | 2026-02-04 | CS-2 |
| [ADR-0005](./0005-opentelemetry-for-observability.md) | OpenTelemetry for observability | Accepted | 2026-02-04 | CS-2 |
| [ADR-0006](./0006-xdg-compliant-configuration.md) | XDG-compliant configuration | Accepted | 2026-02-04 | CS-1 |
| [ADR-0007](./0007-agent-navigable-documentation.md) | Agent-navigable documentation | Accepted | 2026-02-04 | CS-1 |

## Status Definitions

| Status | Meaning |
|--------|---------|
| **Proposed** | Under discussion, not yet decided |
| **Accepted** | Decision made and in effect |
| **Deprecated** | No longer recommended, but may still exist |
| **Superseded** | Replaced by another ADR |

## Creating a New ADR

1. Copy the [template](./template.md)
2. Use the next available number (e.g., `0007-descriptive-name.md`)
3. Fill in all sections
4. Update this README index
5. Submit PR for review

## Front Matter Schema

ADRs use YAML front matter for quick parsing:

```yaml
---
id: ADR-NNNN
title: "Short descriptive title"
status: proposed | accepted | deprecated | superseded
date: YYYY-MM-DD
decision_makers: ["@username"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: ["tag1", "tag2"]
complexity: CS-1 | CS-2 | CS-3 | CS-4 | CS-5
---
```

## References

- [Constitution](../project-rules/constitution.md)
- [Rules](../project-rules/rules.md)
- [Michael Nygard's ADR format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
