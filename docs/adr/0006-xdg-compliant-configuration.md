---
id: ADR-0006
title: "XDG-compliant configuration and data storage"
status: accepted
date: 2026-02-04
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: ["configuration", "storage", "xdg", "cross-platform"]
complexity: CS-1
---

# ADR-0006: XDG-compliant configuration and data storage

## Context

trex needs to persist user data:
- **Configuration**: Theme, fonts, keybindings, preferences
- **Data**: Favorites, groups, session history
- **Cache**: Temporary data, session thumbnails

We need to decide where these files live on the filesystem.

## Decision Drivers

- **Standard location**: Users should find config where expected
- **Cross-platform**: Work on macOS, Linux, and potentially Windows
- **Separation of concerns**: Config vs data vs cache
- **Backup-friendly**: Users can easily backup their config
- **Clean uninstall**: All trex data in known locations

## Considered Options

### Option 1: Single dotfile directory (~/.trex/)

**Description**: Store everything in `~/.trex/`.

**Pros**:
- Simple, everything in one place
- Easy to find

**Cons**:
- Mixes config, data, and cache
- Not XDG-compliant
- Clutters home directory

### Option 2: XDG Base Directory Specification

**Description**: Follow XDG spec - config in `~/.config/trex/`, data in `~/.local/share/trex/`, cache in `~/.cache/trex/`.

**Pros**:
- Industry standard on Linux
- Separation of concerns
- Respects user's XDG environment variables
- Works on macOS too
- Easy selective backup (just config, not cache)

**Cons**:
- Slightly more complex path resolution
- Windows needs different handling

### Option 3: OS-native paths

**Description**: Use macOS ~/Library, Windows AppData, Linux XDG.

**Pros**:
- Native feel per platform

**Cons**:
- Complex cross-platform logic
- Harder to document
- Inconsistent user experience

## Decision

**Chosen Option**: Option 2 (XDG Base Directory Specification) because:

1. **Industry standard** on Linux and increasingly macOS
2. **Clear separation** of config (backup), data (important), cache (disposable)
3. **Environment variable support** - users can customize
4. **Developer-friendly** - our target users understand XDG
5. **Clean** - no dotfile clutter in home directory

## Consequences

### Positive

- Standard locations that developers expect
- Users can selectively backup config vs data
- Cache is clearly disposable
- Respects XDG_* environment variables
- Works well with dotfile managers

### Negative

- Need to implement XDG path resolution
- Windows will need platform-specific handling in future

### Neutral

- Same paths for both Web and Electron modes
- JSON format for all persisted data

## Implementation Notes

### Paths

| Type | Path | Contents |
|------|------|----------|
| Config | `~/.config/trex/` | `config.json` |
| Data | `~/.local/share/trex/` | `favorites.json`, `groups.json`, `history.json` |
| Cache | `~/.cache/trex/` | Session thumbnails, temp files |

### Path Resolution (Go)

```go
func ConfigDir() string {
    if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
        return filepath.Join(xdg, "trex")
    }
    home, _ := os.UserHomeDir()
    return filepath.Join(home, ".config", "trex")
}

func DataDir() string {
    if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
        return filepath.Join(xdg, "trex")
    }
    home, _ := os.UserHomeDir()
    return filepath.Join(home, ".local", "share", "trex")
}

func CacheDir() string {
    if xdg := os.Getenv("XDG_CACHE_HOME"); xdg != "" {
        return filepath.Join(xdg, "trex")
    }
    home, _ := os.UserHomeDir()
    return filepath.Join(home, ".cache", "trex")
}
```

### File Format

All files are JSON with version field for future migrations:

```json
{
  "version": 1,
  "data": { ... }
}
```

## References

- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html)
- [Constitution: Data Persistence](../project-rules/constitution.md#data-persistence)
- [Idioms: Configuration Patterns](../project-rules/idioms.md#configuration-patterns)
