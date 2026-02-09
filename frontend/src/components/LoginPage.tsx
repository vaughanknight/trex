/**
 * LoginPage - Full-screen branded login page.
 *
 * Fills the entire viewport with continuous "TREXTREXTREX..." text, each row
 * offset by 1 character creating a diagonal cascade. The center region shows
 * ">TREX_" in block letters — the "_" blinks like a terminal cursor.
 * A "Login with GitHub" button sits below the logo.
 */

import { useRef, useEffect, useState, useMemo } from 'react'

const PATTERN = 'TREX'

/** Bitmap definitions for block letters (7 rows tall). '#' = filled, ' ' = empty. */
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
  '>': [
    '##     ',
    ' ##    ',
    '  ##   ',
    '   ##  ',
    '  ##   ',
    ' ##    ',
    '##     ',
  ],
  '_': [
    '       ',
    '       ',
    '       ',
    '       ',
    '       ',
    '       ',
    '#######',
  ],
}

const LETTERS = ['>', 'T', 'R', 'E', 'X', '_']
const BLINK_LETTER = '_'

/** Build 2D masks: `highlight` for solid letters, `blink` for the blinking cursor. */
function buildMasks() {
  const height = BITMAP['T'].length
  const highlight: boolean[][] = []
  const blink: boolean[][] = []

  for (let row = 0; row < height; row++) {
    const hBits: boolean[] = []
    const bBits: boolean[] = []
    for (let i = 0; i < LETTERS.length; i++) {
      if (i > 0) {
        hBits.push(false, false)
        bBits.push(false, false)
      }
      const letter = LETTERS[i]
      for (const ch of BITMAP[letter][row]) {
        const filled = ch === '#'
        if (letter === BLINK_LETTER) {
          hBits.push(false)
          bBits.push(filled)
        } else {
          hBits.push(filled)
          bBits.push(false)
        }
      }
    }
    highlight.push(hBits)
    blink.push(bBits)
  }
  return { highlight, blink }
}

const { highlight: MASK_HIGHLIGHT, blink: MASK_BLINK } = buildMasks()
const MASK_HEIGHT = MASK_HIGHLIGHT.length
const MASK_WIDTH = MASK_HIGHLIGHT[0].length

type SpanType = 'dim' | 'highlight' | 'blink'

export function LoginPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState<{ cols: number; rows: number; charW: number; charH: number }>({
    cols: 0, rows: 0, charW: 0, charH: 0,
  })

  useEffect(() => {
    function measure() {
      const el = containerRef.current
      if (!el) return
      const probe = document.createElement('div')
      probe.className = 'font-mono text-sm'
      probe.style.cssText = 'visibility:hidden;position:absolute;white-space:pre;line-height:1'
      probe.textContent = 'TREX'
      el.appendChild(probe)
      const charW = probe.offsetWidth / 4
      const charH = probe.offsetHeight
      el.removeChild(probe)
      if (charW === 0 || charH === 0) return
      setDims({
        cols: Math.ceil(el.clientWidth / charW) + 2,
        rows: Math.ceil(el.clientHeight / charH) + 2,
        charW,
        charH,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const maskStartCol = Math.floor((dims.cols - MASK_WIDTH) / 2)
  const maskStartRow = Math.floor((dims.rows - MASK_HEIGHT) / 2)

  const gridRows = useMemo(() => {
    if (dims.cols === 0 || dims.rows === 0) return []

    return Array.from({ length: dims.rows }, (_, row) => {
      const spans: { text: string; type: SpanType }[] = []
      let currentType: SpanType = 'dim'
      let currentText = ''

      for (let col = 0; col < dims.cols; col++) {
        const ch = PATTERN[(col + row) % PATTERN.length]
        const mr = row - maskStartRow
        const mc = col - maskStartCol
        const inMask = mr >= 0 && mr < MASK_HEIGHT && mc >= 0 && mc < MASK_WIDTH

        let type: SpanType = 'dim'
        if (inMask && MASK_BLINK[mr][mc]) type = 'blink'
        else if (inMask && MASK_HIGHLIGHT[mr][mc]) type = 'highlight'

        if (col === 0) {
          currentType = type
          currentText = ch
        } else if (type === currentType) {
          currentText += ch
        } else {
          spans.push({ text: currentText, type: currentType })
          currentType = type
          currentText = ch
        }
      }
      if (currentText) {
        spans.push({ text: currentText, type: currentType })
      }
      return spans
    })
  }, [dims.cols, dims.rows, maskStartCol, maskStartRow])

  const spanClass: Record<SpanType, string> = {
    dim: 'text-foreground/10',
    highlight: 'text-foreground font-bold',
    blink: 'text-foreground font-bold animate-blink-cursor',
  }

  return (
    <div ref={containerRef} className="relative h-svh w-full bg-background overflow-hidden select-none">
      <div className="absolute inset-0 font-mono text-sm whitespace-pre" style={{ lineHeight: 1 }} aria-hidden="true">
        {gridRows.map((spans, row) => (
          <div key={row}>
            {spans.map((span, i) => (
              <span key={i} className={spanClass[span.type]}>
                {span.text}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div style={{ height: dims.charH * MASK_HEIGHT }} />
        <button
          onClick={() => { window.location.href = '/auth/github' }}
          className="pointer-events-auto mt-26 px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium shadow-lg"
        >
          Login with GitHub
        </button>
      </div>
    </div>
  )
}
