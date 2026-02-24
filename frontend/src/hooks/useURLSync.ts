/**
 * useURLSync - Syncs workspace state to/from URL query params.
 *
 * On mount: Reads ?w= URL param, decodes workspace schema, creates sessions/layouts.
 * On state change: Encodes workspace to ?w= URL param (300ms trailing debounce).
 *
 * Per Plan 016 Phase 6: Full workspace URL encoding v2.
 * Legacy ?layout= and ?s=&a= formats removed (alpha project, no backward compat).
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 6
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { parseWorkspaceURL, buildWorkspaceURL } from '@/lib/urlParams'
import {
  type WorkspaceURLSchema,
  countSchemaSessions,
  buildWorkspaceSchema,
  urlTreeToLayout,
  collectLeafMetadata,
  getPaneIdByIndex,
} from '@/lib/workspaceCodec'
import { getAllLeaves } from '@/lib/layoutTree'
import { useSessionStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'
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

  const isInitializing = useRef(false)
  const hasProcessedURL = useRef(false)
  const pendingSchemaRef = useRef<WorkspaceURLSchema | null>(null)
  const writeURLRef = useRef<(() => void) | null>(null)

  const { createSession, createTmuxSession } = useCentralWebSocket()
  const addSession = useSessionStore((state) => state.addSession)

  // Recreate workspace from URL schema
  const createWorkspaceFromSchema = useCallback((schema: WorkspaceURLSchema) => {
    isInitializing.current = true
    const ws = useWorkspaceStore.getState()
    const createdItemIds: string[] = []
    let itemIndex = 0

    const processNextItem = () => {
      if (itemIndex >= schema.i.length) {
        // All items created — set active item
        const targetIdx = schema.a >= 0 && schema.a < createdItemIds.length
          ? schema.a
          : 0
        if (createdItemIds.length > 0) {
          ws.setActiveItem(createdItemIds[targetIdx])
        }
        isInitializing.current = false
        // Trigger URL write now that initialization is complete
        writeURLRef.current?.()
        return
      }

      const urlItem = schema.i[itemIndex]
      itemIndex++

      try {
        const runtimeTree = urlTreeToLayout(urlItem.t)
        const focusedPaneId = urlItem.fp != null && urlItem.fp >= 0
          ? getPaneIdByIndex(runtimeTree, urlItem.fp)
          : null
        const leaves = getAllLeaves(runtimeTree)
        const leafMeta = collectLeafMetadata(urlItem.t)

        const itemId = ws.addItem(urlItem.n, runtimeTree, focusedPaneId ?? leaves[0]?.paneId ?? null)
        createdItemIds.push(itemId)

        let leafCompleted = 0
        const totalLeaves = leaves.length

        for (let li = 0; li < leaves.length; li++) {
          const leaf = leaves[li]
          const meta = leafMeta[li]

          if (meta?.tm) {
            // tmux leaf — reconnect silently
            createTmuxSession(meta.tm, meta.tw ?? 0, (sessionId, shellType, tmuxSessionName, _twIdx, cwd) => {
              ws.replaceSessionInPane(itemId, leaf.paneId, sessionId)
              addSession({
                id: sessionId,
                name: tmuxSessionName || meta.tm!,
                shellType,
                status: 'active' as const,
                createdAt: Date.now() + leafCompleted,
                userRenamed: false,
                tmuxSessionName: tmuxSessionName || meta.tm!,
                cwd,
              })
              leafCompleted++
              if (leafCompleted >= totalLeaves) processNextItem()
            })
          } else if (meta?.c) {
            // Leaf with cwd — create session with initial directory
            createSession((sessionId, shellType, _tmux, _twIdx, cwd) => {
              ws.replaceSessionInPane(itemId, leaf.paneId, sessionId)
              addSession({
                id: sessionId,
                name: `${shellType}-${leafCompleted + 1}`,
                shellType,
                status: 'active' as const,
                createdAt: Date.now() + leafCompleted,
                userRenamed: false,
                cwd: cwd ?? meta.c,
              })
              leafCompleted++
              if (leafCompleted >= totalLeaves) processNextItem()
            }, meta.c)
          } else {
            // Regular session
            createSession((sessionId, shellType, _tmux, _twIdx, cwd) => {
              ws.replaceSessionInPane(itemId, leaf.paneId, sessionId)
              addSession({
                id: sessionId,
                name: `${shellType}-${leafCompleted + 1}`,
                shellType,
                status: 'active' as const,
                createdAt: Date.now() + leafCompleted,
                userRenamed: false,
                cwd,
              })
              leafCompleted++
              if (leafCompleted >= totalLeaves) processNextItem()
            })
          }
        }

        if (totalLeaves === 0) processNextItem()
      } catch {
        processNextItem()
      }
    }

    processNextItem()
  }, [createSession, createTmuxSession, addSession])

  // Handle URL params on mount
  useEffect(() => {
    if (hasProcessedURL.current) return
    hasProcessedURL.current = true

    const schema = parseWorkspaceURL(window.location.search)
    if (!schema || schema.i.length === 0) return

    const waitForSettings = () => {
      const settings = useSettingsStore.getState()
      const sessionCount = countSchemaSessions(schema)
      const needsConfirm =
        settings.urlConfirmAlways ||
        sessionCount > settings.urlConfirmThreshold

      if (needsConfirm) {
        setPendingSessionCount(sessionCount)
        setShowConfirmDialog(true)
        pendingSchemaRef.current = schema
      } else {
        createWorkspaceFromSchema(schema)
      }
    }

    if (useSettingsStore.persist.hasHydrated()) {
      waitForSettings()
    } else {
      const unsub = useSettingsStore.persist.onFinishHydration(() => {
        unsub()
        waitForSettings()
      })
    }
  }, [createWorkspaceFromSchema])

  // Dialog callbacks
  const onConfirm = useCallback(() => {
    setShowConfirmDialog(false)
    if (pendingSchemaRef.current) {
      createWorkspaceFromSchema(pendingSchemaRef.current)
      pendingSchemaRef.current = null
    }
  }, [createWorkspaceFromSchema])

  const onCancel = useCallback(() => {
    setShowConfirmDialog(false)
    setPendingSessionCount(0)
  }, [])

  const onDisablePrompt = useCallback(() => {
    useSettingsStore.getState().setUrlConfirmAlways(false)
  }, [])

  // Debounced URL write via store subscriptions (300ms trailing)
  // Subscribes to both workspace and session stores to capture all changes.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const writeURL = () => {
      if (isInitializing.current) return

      const ws = useWorkspaceStore.getState()
      const sessions = useSessionStore.getState().sessions

      if (ws.items.length === 0) {
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      try {
        const schema = buildWorkspaceSchema(ws.items, ws.activeItemId, sessions)
        if (!schema) return // Pending sessions, skip
        const params = buildWorkspaceURL(schema)
        window.history.replaceState({}, '', '?' + params)
      } catch {
        // Silently fail on serialization errors
      }
    }

    writeURLRef.current = writeURL

    const debouncedWrite = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(writeURL, 300)
    }

    const unsub1 = useWorkspaceStore.subscribe(debouncedWrite)
    const unsub2 = useSessionStore.subscribe(debouncedWrite)

    return () => {
      unsub1()
      unsub2()
      if (timeoutId) clearTimeout(timeoutId)
      writeURLRef.current = null
    }
  }, [])

  return {
    showConfirmDialog,
    pendingSessionCount,
    onConfirm,
    onCancel,
    onDisablePrompt,
  }
}
