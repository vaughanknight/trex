/**
 * TerminalContainer - Manages multiple terminal instances with visibility control.
 *
 * Per Critical Finding 02: Need to pause inactive sessions to conserve GPU.
 * This component:
 * - Renders a Terminal for each session in the store
 * - Shows only the active session (others have display:none)
 * - Paused sessions don't render frames (xterm IntersectionObserver)
 * - Data continues to flow to all sessions via xterm.write()
 *
 * Per High Finding 04: All terminals use the central WebSocket with sessionId routing.
 *
 * WebGL Context Management:
 * - WebGL allocation is handled by the WebGL pool (see stores/webglPool.ts)
 * - Each Terminal acquires/releases WebGL based on isActive prop
 * - Pool dynamically manages contexts with LRU eviction and GPU detection
 */

import { useShallow } from 'zustand/shallow'
import { Terminal } from './Terminal'
import { useSessionStore, selectSessionIds } from '../stores/sessions'
import { useUIStore, selectActiveSessionId } from '../stores/ui'

/**
 * Container that manages all terminal instances.
 *
 * Implementation notes:
 * - All sessions are rendered but only active one is visible
 * - Hidden terminals use display:none which triggers xterm's
 *   IntersectionObserver optimization (stops rendering frames)
 * - Output continues to flow via xterm.write() regardless of visibility
 * - WebGL is managed by the pool based on isActive state (no static allocation)
 */
export function TerminalContainer() {
  // useShallow prevents infinite re-renders when selectSessionIds returns new array
  const sessionIds = useSessionStore(useShallow(selectSessionIds))
  const activeSessionId = useUIStore(selectActiveSessionId)

  return (
    <div className="relative h-full w-full">
      {sessionIds.map((sessionId) => {
        const isActive = sessionId === activeSessionId

        return (
          <div
            key={sessionId}
            className="absolute inset-0"
            style={{
              // Hidden terminals use display:none to trigger xterm's
              // IntersectionObserver optimization (stops rendering frames)
              display: isActive ? 'block' : 'none',
            }}
          >
            <Terminal sessionId={sessionId} isActive={isActive} />
          </div>
        )
      })}
    </div>
  )
}
