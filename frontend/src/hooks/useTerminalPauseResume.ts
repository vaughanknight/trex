/**
 * Hook for managing terminal visibility and rendering state.
 *
 * Per Critical Finding 02: Need to pause inactive sessions to conserve GPU.
 *
 * Note: xterm.js automatically pauses rendering when the terminal element
 * is hidden (via IntersectionObserver in modern browsers). This hook
 * provides the control interface for TerminalContainer to manage visibility.
 *
 * The actual "pause" is achieved by hiding the terminal via CSS display:none,
 * which triggers xterm.js's built-in IntersectionObserver optimization.
 * Data continues to flow to all sessions via xterm.write() regardless of visibility.
 *
 * @see https://github.com/xtermjs/xterm.js/issues/880
 */

import { useCallback, useRef, useState } from 'react'
import type { Terminal } from '@xterm/xterm'

interface UseTerminalPauseResumeReturn {
  /** Whether the terminal is currently paused (hidden) */
  isPaused: boolean
  /** Pause rendering by hiding the terminal */
  pause: () => void
  /** Resume rendering by showing the terminal */
  resume: () => void
  /** Toggle pause state */
  toggle: () => void
  /** Ref to track the terminal instance for operations on pause/resume */
  terminalRef: React.MutableRefObject<Terminal | null>
}

/**
 * Hook to manage terminal pause/resume state.
 *
 * When paused:
 * - Terminal element is hidden (display: none)
 * - xterm.js IntersectionObserver stops rendering frames
 * - xterm.write() continues to work (output is buffered)
 *
 * When resumed:
 * - Terminal element is shown
 * - xterm.js re-renders to catch up with buffered output
 */
export function useTerminalPauseResume(): UseTerminalPauseResumeReturn {
  const [isPaused, setIsPaused] = useState(false)
  const terminalRef = useRef<Terminal | null>(null)

  const pause = useCallback(() => {
    setIsPaused(true)
    // Optional: Could blur terminal here if it has focus
    // terminalRef.current?.blur()
  }, [])

  const resume = useCallback(() => {
    setIsPaused(false)
    // Give terminal a chance to re-render, then optionally focus
    // Note: Focus is handled by TerminalContainer based on active session
  }, [])

  const toggle = useCallback(() => {
    setIsPaused((prev) => !prev)
  }, [])

  return {
    isPaused,
    pause,
    resume,
    toggle,
    terminalRef,
  }
}
