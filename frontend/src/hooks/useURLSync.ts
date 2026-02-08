/**
 * useURLSync - Syncs session state to/from URL query params.
 *
 * On mount: Reads URL params (?s=N&a=X), optionally shows confirmation dialog,
 * then creates sessions via WebSocket.
 *
 * On state change: Writes current session count and active index to URL
 * via history.replaceState (no history pollution).
 *
 * Per Plan 009: URL Routing (T006)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { parseSessionParams } from '@/lib/urlParams'
import { buildSessionParams } from '@/lib/urlParams'
import { useSessionStore, selectSessionCount, selectSessionList } from '@/stores/sessions'
// Note: selectSessionList is only used imperatively (getState), not as a subscription,
// because it creates new array refs on every call which would cause infinite re-renders.
import { useUIStore, selectActiveSessionId } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useCentralWebSocket } from './useCentralWebSocket'

export interface UseURLSyncReturn {
  showConfirmDialog: boolean
  pendingSessionCount: number
  onConfirm: () => void
  onCancel: () => void
  onDisablePrompt: () => void
}

export function useURLSync(): UseURLSyncReturn {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingSessionCount, setPendingSessionCount] = useState(0)
  const [pendingActiveIndex, setPendingActiveIndex] = useState<number | null>(null)

  // Ref to prevent URL writes during initialization
  const isInitializing = useRef(false)
  // Ref to track whether URL-driven creation has been handled
  const hasProcessedURL = useRef(false)

  const { createSession } = useCentralWebSocket()
  const addSession = useSessionStore((state) => state.addSession)
  const setActiveSession = useUIStore((state) => state.setActiveSession)

  // Create sessions from URL params sequentially.
  // Must be sequential because useCentralWebSocket.createSession() connects lazily:
  // the first call triggers connect(), and subsequent calls while WS is still in
  // CONNECTING state would silently drop (no create message sent). By chaining
  // each creation in the previous callback, the WS is guaranteed OPEN for calls 2+.
  const createSessionsFromURL = useCallback((count: number, activeIndex: number | null) => {
    isInitializing.current = true
    const createdIds: string[] = []

    const createNext = (index: number) => {
      if (index >= count) {
        // All sessions created — set active session
        const targetIndex = activeIndex !== null ? activeIndex : 0
        if (targetIndex < createdIds.length) {
          setActiveSession(createdIds[targetIndex])
        } else {
          setActiveSession(createdIds[0])
        }
        isInitializing.current = false
        return
      }

      createSession((sessionId, shellType) => {
        const newSession = {
          id: sessionId,
          name: `${shellType}-${index + 1}`,
          shellType,
          status: 'active' as const,
          createdAt: Date.now() + index, // Offset to preserve order
          userRenamed: false,
        }

        addSession(newSession)
        createdIds.push(sessionId)
        // Chain: create next session after this one completes
        createNext(index + 1)
      })
    }

    createNext(0)
  }, [createSession, addSession, setActiveSession])

  // Handle URL params on mount
  useEffect(() => {
    if (hasProcessedURL.current) return
    hasProcessedURL.current = true

    const parsed = parseSessionParams(window.location.search)

    // No URL params — do nothing, let normal behavior continue
    if (parsed.sessionCount === null) return

    const count = parsed.sessionCount
    const activeIndex = parsed.activeIndex

    // Check if confirmation is needed
    const waitForSettings = () => {
      const settings = useSettingsStore.getState()

      const needsConfirm =
        settings.urlConfirmAlways ||
        count > settings.urlConfirmThreshold

      if (needsConfirm) {
        setPendingSessionCount(count)
        setPendingActiveIndex(activeIndex)
        setShowConfirmDialog(true)
      } else {
        createSessionsFromURL(count, activeIndex)
      }
    }

    // Wait for settings store hydration before checking thresholds
    if (useSettingsStore.persist.hasHydrated()) {
      waitForSettings()
    } else {
      const unsub = useSettingsStore.persist.onFinishHydration(() => {
        unsub()
        waitForSettings()
      })
    }
  }, [createSessionsFromURL])

  // Dialog callbacks
  const onConfirm = useCallback(() => {
    setShowConfirmDialog(false)
    createSessionsFromURL(pendingSessionCount, pendingActiveIndex)
  }, [pendingSessionCount, pendingActiveIndex, createSessionsFromURL])

  const onCancel = useCallback(() => {
    setShowConfirmDialog(false)
    setPendingSessionCount(0)
    setPendingActiveIndex(null)
  }, [])

  const onDisablePrompt = useCallback(() => {
    useSettingsStore.getState().setUrlConfirmAlways(false)
  }, [])

  // Sync state changes back to URL
  // Only subscribe to scalar values (number, string|null) — never to selectors
  // that create new array refs (like selectSessionList), which cause infinite loops.
  const sessionCount = useSessionStore(selectSessionCount)
  const activeSessionId = useUIStore(selectActiveSessionId)

  useEffect(() => {
    // Skip URL writes during initialization to prevent feedback loop
    if (isInitializing.current) return
    // Don't write URL if no sessions exist
    if (sessionCount === 0) return

    // Read session list imperatively (not via subscription) to find active index
    const sessionList = selectSessionList(useSessionStore.getState())
    const activeIndex = activeSessionId
      ? sessionList.findIndex((s) => s.id === activeSessionId)
      : 0
    const clampedIndex = activeIndex >= 0 ? activeIndex : 0

    const params = buildSessionParams(sessionCount, clampedIndex)
    window.history.replaceState({}, '', '?' + params)
  }, [sessionCount, activeSessionId])

  return {
    showConfirmDialog,
    pendingSessionCount,
    onConfirm,
    onCancel,
    onDisablePrompt,
  }
}
