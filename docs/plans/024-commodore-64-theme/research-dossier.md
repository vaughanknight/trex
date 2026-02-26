# Research Report: Commodore 64 Terminal Theme

**Generated**: 2026-02-24T13:55:00Z
**Research Query**: "Add a Commodore 64 theme with authentic colors and optional C64 font"
**Mode**: Pre-Plan
**Location**: docs/plans/024-commodore-64-theme/
**Findings**: 20+

## Executive Summary

### What We're Adding
A Commodore 64 retro terminal theme with the authentic VIC-II 16-color palette, mapped to xterm.js ANSI colors. Optionally, a bundled C64 pixel font for maximum nostalgia.

### How Themes Work Today
The app has 12 terminal themes defined in `frontend/src/themes/index.ts`, each implementing xterm.js `ITheme` (background, foreground, cursor, selection, 8 ANSI colors + 8 bright variants). Themes are selected via `ThemeSelector` dropdown, persisted in localStorage, and applied to both the terminal AND the app UI via CSS variables bridge (`themeCSS.ts`). Fonts are bundled via `@fontsource` packages and selectable in `FontSelector`.

### Key Insights
1. Adding a theme is **trivial** — just add an `ITheme` object to `themes/index.ts` and register it
2. Adding a font is **straightforward** — either bundle a `.woff2` file with `@font-face` or use an `@fontsource` package
3. The C64 font "C64 Pro Mono" from style64.org has WOFF2 format available; BESCII is CC0 licensed
4. The VIC-II palette has 16 colors that map naturally to ANSI 0-15

## VIC-II Color Palette (Authentic Hardware Values)

| Index | C64 Name | Hex | ANSI Mapping |
|-------|----------|-----|-------------|
| 0 | Black | `#000000` | black |
| 1 | White | `#FFFFFF` | white (foreground) |
| 2 | Red | `#68372B` | red |
| 3 | Cyan | `#70A4B2` | cyan |
| 4 | Purple | `#6F3D95` | magenta |
| 5 | Green | `#588D43` | green |
| 6 | Blue | `#352879` | blue |
| 7 | Yellow | `#B8C76F` | yellow |
| 8 | Orange | `#6F4F25` | brightRed (or brightYellow) |
| 9 | Brown | `#433900` | brightBlack (dark) |
| A | Light Red | `#9A6759` | brightRed |
| B | Dark Grey | `#444444` | brightBlack |
| C | Grey | `#6C6C6C` | white (dim) |
| D | Light Green | `#9AD284` | brightGreen |
| E | Light Blue | `#6C5EB5` | brightBlue |
| F | Light Grey | `#959595` | brightWhite |

**Classic C64 boot screen colors**: Blue background (`#352879`), light blue border/text (`#6C5EB5`), white cursor

## C64 Font Options

| Font | License | Formats | Notes |
|------|---------|---------|-------|
| **C64 Pro Mono** (style64.org) | Free (check terms) | TTF, WOFF, WOFF2 | Most authentic, monospace, 304 glyphs |
| **BESCII** (github) | CC0 (public domain) | TTF, WOFF, WOFF2 | PETSCII-inspired, 8×8 pixel, web-optimized |
| **Pet Me 64** (kreativekorp) | Free download | TTF | Complete C64 charset, less web-ready |

**Recommendation**: Use **C64 Pro Mono** for authenticity or **BESCII** for guaranteed CC0 license.

## How to Implement

### Theme Definition (1 file change)
Add to `frontend/src/themes/index.ts`:
```typescript
const commodore64: ITheme = {
  background: '#352879',      // C64 blue
  foreground: '#6C5EB5',      // Light blue
  cursor: '#6C5EB5',
  cursorAccent: '#352879',
  selectionBackground: '#6F3D9580',
  black: '#000000',
  red: '#68372B',
  green: '#588D43',
  yellow: '#B8C76F',
  blue: '#352879',
  magenta: '#6F3D95',
  cyan: '#70A4B2',
  white: '#6C6C6C',
  brightBlack: '#444444',
  brightRed: '#9A6759',
  brightGreen: '#9AD284',
  brightYellow: '#6F4F25',
  brightBlue: '#6C5EB5',
  brightMagenta: '#6F3D95',
  brightCyan: '#70A4B2',
  brightWhite: '#959595',
}
```

### Theme Registration (1 line)
Add to `themes` array in same file:
```typescript
{ id: 'commodore-64', name: 'Commodore 64', theme: commodore64, isDark: true }
```

### Type Update (1 line)
Add `'commodore-64'` to `TerminalTheme` union in `stores/settings.ts`.

### Font (optional, 3 steps)
1. Download C64 Pro Mono WOFF2 or BESCII WOFF2
2. Add `@font-face` declaration in CSS or create font import
3. Add to `BUNDLED_FONTS` array in `stores/settings.ts`

## Complexity Assessment
- **CS-1 (tiny)** — 3-4 lines for theme, 1 type update, optional font bundling
- No backend changes, no test changes needed
- Theme preview on hover works automatically

## Next Steps
This is simple enough to implement directly without a full plan. Just add the theme definition, register it, and optionally bundle the font.
