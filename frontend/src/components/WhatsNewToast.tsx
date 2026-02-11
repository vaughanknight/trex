import { useState, useEffect } from 'react'

const DISMISSED_KEY = 'trex-whatsnew-dismissed'
const CURRENT_VERSION = 'pane-splitting-v1'

/**
 * Shows a dismissible "What's New" banner on first load after a feature launch.
 * Tracks dismissal in localStorage so it only shows once per feature version.
 */
export function WhatsNewToast() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (dismissed !== CURRENT_VERSION) {
      // Delay appearance slightly so it doesn't flash during initial render
      const timer = setTimeout(() => setVisible(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, CURRENT_VERSION)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-border bg-background/95 p-4 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            New: Split your terminal into panes!
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Drag sessions from the sidebar onto terminals to create side-by-side layouts.
          </p>
          <div className="mt-2 flex gap-2">
            <a
              href="/docs/how/pane-splitting.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Learn more
            </a>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
