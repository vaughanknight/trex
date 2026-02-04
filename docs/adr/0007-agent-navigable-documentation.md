---
id: ADR-0007
title: "Agent-navigable documentation with YAML indexes"
status: accepted
date: 2026-02-04
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: ["documentation", "agent", "navigation", "dx", "llm"]
complexity: CS-1
---

# ADR-0007: Agent-navigable documentation with YAML indexes

## Context

LLM agents (Claude, etc.) working on this codebase need to find relevant documentation quickly. Without indexes, agents must:

1. Glob for files, then read each one to understand contents
2. Read entire files to determine relevance
3. Make multiple round-trips to navigate nested structures

This wastes tokens, time, and context window.

## Decision

Every documentation folder MUST contain a `_index.yaml` file that describes:
- What the folder contains (purpose)
- All files with summaries
- All subdirectories with summaries
- Navigation hints (when to look here)

All documentation files MUST have YAML front matter with:
- Unique identifier
- Title and summary
- Keywords for search
- Related files (cross-references)

## Specification

### Folder Index: `_index.yaml`

```yaml
# _index.yaml - Agent navigation manifest
purpose: "Brief description of what this folder contains"

# When should an agent look in this folder?
# These are natural-language triggers
triggers:
  - "questions about X"
  - "looking for Y"
  - "implementing Z"

files:
  - path: "filename.md"
    summary: "One-line description"
    keywords: [keyword1, keyword2]

  - path: "another-file.md"
    summary: "One-line description"
    keywords: [keyword3]

directories:
  - path: "subdir/"
    summary: "What this subdirectory contains"
    triggers:
      - "when to look here"
```

### File Front Matter

```yaml
---
id: unique-identifier
title: "Human-readable title"
summary: "1-2 sentence description for agents scanning files"
keywords: [searchable, terms, for, agents]
related:
  - path/to/related-file.md
  - another/related.md
updated: YYYY-MM-DD
---
```

### Navigation Algorithm

Agents SHOULD navigate documentation as follows:

1. Read `docs/_index.yaml` to find relevant subdirectory
2. Read subdirectory's `_index.yaml` to find relevant file
3. Read file's front matter to confirm relevance
4. Only then read full file content

This minimizes tokens consumed for navigation.

## Implementation

### Required Index Files

```
docs/
├── _index.yaml              # Root documentation index
├── project-rules/
│   ├── _index.yaml          # Governance docs index
│   ├── constitution.md
│   ├── rules.md
│   ├── architecture.md
│   └── idioms.md
├── adr/
│   ├── _index.yaml          # ADR index (replaces README.md function)
│   ├── template.md
│   └── NNNN-*.md
└── api/
    └── _index.yaml          # API docs index (future)
```

### Index File Conventions

- Filename: Always `_index.yaml` (underscore prefix sorts first)
- Format: YAML (faster to parse than markdown)
- Size: Keep under 100 lines (quick to read)
- Updates: Must be updated when files are added/removed/renamed

### Front Matter Conventions

- `id`: Use filename without extension for docs, ADR-NNNN for ADRs
- `summary`: Max 200 characters, written for agent comprehension
- `keywords`: Include synonyms and related terms agents might search
- `related`: Relative paths from repo root

## Consequences

### Positive

- Agents find docs in 2-3 reads instead of 10+
- Reduced token consumption during navigation
- Faster response times for doc lookups
- Self-documenting folder structure
- Keywords enable fuzzy matching to user queries

### Negative

- Index files must be maintained alongside docs
- Additional files in each folder
- Risk of indexes becoming stale

### Neutral

- Humans can ignore `_index.yaml` files
- Front matter is also useful for human readers
- Compatible with existing ADR front matter

## References

- [Constitution: Documentation Standards](../project-rules/constitution.md)
- [ADR-0001 through ADR-0006](./README.md) - Existing front matter pattern
