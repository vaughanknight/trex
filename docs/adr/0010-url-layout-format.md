---
id: ADR-0010
title: "URI-safe compact prefix notation for URL layout encoding"
status: accepted
date: 2026-02-10
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: [url, serialization, layout, codec]
complexity: CS-2
---

# ADR-0010: URI-safe compact prefix notation for URL layout encoding

## Context

Plan 015 (Pane Splitting) requires persisting pane layout arrangements in the URL so users can share, bookmark, and restore multi-terminal configurations. The URL format is a **permanent public API** -- once shipped, existing bookmarks and shared links depend on it. The format must be compact (short URLs), URL-safe (no percent-encoding), human-readable (debuggable), and support round-trip fidelity (serialize then parse returns identical tree).

The existing URL format (`?s=N&a=X`) encodes only session count and active index. The new format must encode arbitrary binary tree layouts with split directions, ratios, and shell types while remaining backward-compatible with the legacy format.

## Decision Drivers

- **Compactness**: URLs should stay short. 8-pane worst case must fit under 200 characters.
- **URL safety**: Zero percent-encoding required. Only `[A-Za-z0-9]` characters.
- **Human readability**: Developers and users should be able to understand `H50bz` at a glance.
- **Round-trip fidelity**: `serialize(parse(s)) === s` must hold for all valid inputs.
- **Backward compatibility**: Existing `?s=N&a=X` URLs must continue working.
- **Simplicity**: No external dependencies. Pure functions. Small code footprint.

## Considered Options

### Option 1: URI-safe compact prefix notation

**Description**: Delimiter-free prefix notation using single characters. Splits encoded as `{direction}{ratio}{first}{second}`, leaves encoded as single shell character. Example: `H50bz` = horizontal split at 50%, bash left, zsh right.

**Pros**:
- Shortest URLs (1 char per leaf, 3 chars per split overhead)
- Zero percent-encoding (all alphanumeric)
- Human-readable for simple layouts
- Trivial recursive descent parser
- No delimiters needed (grammar is unambiguous)

**Cons**:
- Novel format (no existing parser libraries)
- Ratio limited to 2-digit integer percent (01-99)
- Not self-describing (requires knowledge of grammar)

### Option 2: Nested parentheses

**Description**: S-expression style: `(H 50 (bash) (zsh))`. More readable but requires percent-encoding for parentheses and spaces.

**Pros**:
- More human-readable for complex trees
- Self-describing structure

**Cons**:
- Requires percent-encoding (`(` → `%28`, `)` → `%29`, space → `%20`)
- 3-5x longer URLs
- More complex parser

### Option 3: JSON + base64

**Description**: Serialize tree as JSON, then base64url encode: `?layout=eyJ0eXBlIjoic3BsaXQi...`

**Pros**:
- Uses standard formats
- Extensible (add any field to JSON)

**Cons**:
- Completely opaque (not human-readable)
- Very long URLs (10-20x longer)
- base64 padding issues

### Option 4: Flat array with indices

**Description**: Encode tree as flat array with parent indices: `h,50,0,b,z` where elements reference parents by position.

**Pros**:
- Fixed-width per element
- Easy to extend

**Cons**:
- Requires delimiters (commas)
- Not human-readable
- Longer than prefix notation
- Parent index references are fragile

### Option 5: tmux-style layout string

**Description**: Adapt tmux's `{180x50,90x50,0,0,90x50,91,0}` format.

**Pros**:
- Proven format in tmux ecosystem

**Cons**:
- Encodes pixel dimensions (not percentages)
- Very long and opaque
- Commas require consideration for URL safety

### Option 6: Custom DSL with delimiters

**Description**: Something like `h:50:bash|zsh` with explicit delimiters.

**Pros**:
- More readable than prefix notation
- Self-describing separators

**Cons**:
- Longer URLs
- Pipe and colon may need encoding in some contexts
- More complex grammar

## Decision

**Chosen Option**: Option 1 (URI-safe compact prefix notation) because it produces the shortest URLs, requires zero percent-encoding, and its recursive descent parser is trivial to implement and test. The weighted evaluation from external research scored it 84/100, highest among all options.

The format:
- **Leaf**: Single character (`b` = bash, `z` = zsh, `f` = fish, `d` = default)
- **Split**: `{H|V}{ratio:2digits}{first}{second}` (e.g., `H50bz`)
- **Grammar**: Unambiguous prefix notation, no delimiters needed
- **Validation**: 8-pane maximum enforced by `validateLayout()`
- **Dispatch**: `?layout=` param takes precedence; malformed falls back to legacy `?s=&a=`

## Consequences

### Positive

- Shortest possible URLs: 8-pane worst case is 37 characters (`?layout=` + 29 char layout string)
- Zero percent-encoding: entire output is `[A-Za-z0-9]`
- Exhaustive round-trip testing verifies format integrity
- Backward compatible: existing `?s=N&a=X` URLs still work via dispatch logic

### Negative

- Format is permanent: cannot change encoding without breaking existing bookmarks
- Ratio precision limited to integer percent (1-99%)
- Shell type set is fixed (bash/zsh/fish/default); adding new shells requires codec extension

### Neutral

- Parser is ~80 lines of TypeScript (small maintenance surface)
- No versioning byte needed at v1; codec detection can be added later if format evolves

## Implementation Notes

- Codec lives in `frontend/src/lib/layoutCodec.ts`
- URL dispatch in `frontend/src/lib/urlParams.ts` via `parseURLParams()`
- URL sync in `frontend/src/hooks/useURLSync.ts` (read and write paths)
- 48 tests cover serialization, parsing, validation, round-trip, tree transforms, and URL dispatch

## References

- [Plan 015: Pane Splitting](../plans/015-pane-splitting/pane-splitting-plan.md)
- [External Research: URL Layout Serialization](../plans/015-pane-splitting/external-research/url-layout-serialization.md)
- [ADR-0008: react-resizable-panels](./0008-split-panel-library.md)
