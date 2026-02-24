---
id: ADR-0012
title: "Compressed JSON URL encoding for full workspace state"
status: accepted
date: 2026-02-24
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: ADR-0010
superseded_by: null
tags: [url, serialization, workspace, codec, compression]
complexity: CS-3
---

# ADR-0012: Compressed JSON URL encoding for full workspace state

## Context

ADR-0010 established URI-safe compact prefix notation (`H50bz`) for encoding layout trees in URLs. This format is compact and human-readable but cannot encode per-pane metadata (tmux session names, working directories, shell types). With Plan 023 (Session Reconnect), each pane needs independent metadata for reconnection.

## Decision Drivers

- Per-pane metadata required (tmux name, window index, cwd, shell type)
- Future extensibility (arbitrary per-pane fields without format redesign)
- URL compactness (gzip compression achieves 94.5% reduction)
- Alpha stage — no backward compatibility required
- Not intended for human reading/editing

## Decision

**Replace prefix notation with gzip-compressed JSON** for the `?w=` URL parameter.

Encoding pipeline: `WorkspaceState → JSON.stringify → fflate.gzip → base64url`
Decoding pipeline: `base64url → fflate.gunzip → JSON.parse → WorkspaceState`

### Schema (v2)

```json
{
  "v": 2,
  "a": 0,
  "i": [
    {
      "n": "My Layout",
      "ur": true,
      "t": {
        "s": "h", "r": 0.5,
        "1": { "sh": "bash", "c": "/home/user/project" },
        "2": { "sh": "tmux", "tm": "api-server", "tw": 0 }
      },
      "fp": 0
    }
  ]
}
```

### Compression Results (spike)

| Items | Panes | Raw JSON | Gzipped | URL chars |
|-------|-------|----------|---------|-----------|
| 5 | 13 | 1.6 KB | 346 B | 462 |
| 10 | 26 | 3.2 KB | 448 B | 598 |
| 100 | 247 | 31 KB | 1.7 KB | 2,295 |

## Consequences

### Positive
- Per-pane metadata enables tmux reconnection and cwd restore
- Arbitrarily extensible — new fields without format changes
- URLs shorter than expected due to 94.5% compression ratio
- Single codec for all workspace state (no separate layout codec)

### Negative
- URLs are not human-readable (compressed binary in base64url)
- New dependency: fflate (~13KB bundled)
- All existing prefix notation tests must be rewritten
- `layoutCodec.ts` deleted (36+ tests)

## Implementation Notes

- Use `fflate` library (not browser-native CompressionStream) for Node/Vitest compatibility
- Short JSON keys minimize pre-compression size (`s`=split, `sh`=shell, `c`=cwd, `tm`=tmux)
- No URL length limit — compression keeps URLs naturally compact

## References

- [Plan 023: Session Reconnect](../plans/023-tmux-session-reconnect/tmux-session-reconnect-plan.md)
- [ADR-0010: URI-safe compact prefix notation](./0010-url-layout-format.md) (superseded)
- [Compression spike data](../plans/023-tmux-session-reconnect/tmux-session-reconnect-spec.md#compression-spike-results)
