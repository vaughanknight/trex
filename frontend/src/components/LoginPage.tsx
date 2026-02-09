/**
 * LoginPage - Full-screen branded login page.
 *
 * Renders ASCII art "TREX" logo built from repeating "TREX" characters
 * as fill pattern, with a "Login with GitHub" button below.
 * Styled as a full-screen terminal using the current theme.
 */

/** Bitmap definitions for each letter (7 rows tall). '#' = filled, ' ' = empty. */
const BITMAP: Record<string, string[]> = {
  T: [
    '########',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
    '   ##   ',
  ],
  R: [
    '###### ',
    '##   ##',
    '##   ##',
    '###### ',
    '##  ## ',
    '##   ##',
    '##   ##',
  ],
  E: [
    '#######',
    '##     ',
    '##     ',
    '#####  ',
    '##     ',
    '##     ',
    '#######',
  ],
  X: [
    '##   ##',
    ' ## ## ',
    '  ###  ',
    '   #   ',
    '  ###  ',
    ' ## ## ',
    '##   ##',
  ],
}

/** Render text as ASCII art using a repeating fill string for filled pixels. */
function renderAscii(text: string, fill = 'TREX'): string {
  const height = BITMAP['T'].length
  const lines: string[] = []
  for (let row = 0; row < height; row++) {
    let line = ''
    let fillIdx = 0
    for (let i = 0; i < text.length; i++) {
      const ch = text[i].toUpperCase()
      const bitmap = BITMAP[ch]
      if (bitmap) {
        for (const bit of bitmap[row]) {
          if (bit === '#') {
            line += fill[fillIdx++ % fill.length]
          } else {
            line += ' '
          }
        }
      }
      if (i < text.length - 1) line += '  '
    }
    lines.push(line.trimEnd())
  }
  return lines.join('\n')
}

const TREX_ART = renderAscii('TREX')

export function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center h-svh w-full bg-background">
      <pre className="font-mono text-foreground text-[10px] leading-tight select-none whitespace-pre mb-8 sm:text-xs">
        {TREX_ART}
      </pre>
      <button
        onClick={() => { window.location.href = '/auth/github' }}
        className="px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium"
      >
        Login with GitHub
      </button>
    </div>
  )
}
