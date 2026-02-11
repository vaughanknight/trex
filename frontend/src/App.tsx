import './App.css'
import { SidebarProvider, SidebarInset } from './components/ui/sidebar'
import { SessionSidebar } from './components/SessionSidebar'
import { SettingsPanel } from './components/SettingsPanel'
import { EmptyState } from './components/EmptyState'
import { PaneContainer } from './components/PaneContainer'
import { PaneLayout } from './components/PaneLayout'
import { LoginPage } from './components/LoginPage'
import { FirstDragDropZone } from './components/FirstDragDropZone'
import { ThemePreviewProvider } from './contexts/ThemePreviewContext'
import { useSessionStore, selectSessionCount } from './stores/sessions'
import { useUIStore, selectSidebarCollapsed, selectSettingsPanelOpen } from './stores/ui'
import { useWorkspaceStore, selectActiveItemId, selectActiveSessionId } from './stores/workspace'
import { useAuthStore, selectAuthEnabled, selectUser, selectAuthLoading } from './stores/auth'
import { useURLSync } from './hooks/useURLSync'
import { useWorkspaceKeyboard } from './hooks/useWorkspaceKeyboard'
import { useAuthInit } from './hooks/useAuthInit'
import { useAppTheme, useAppThemePreview } from './hooks/useAppTheme'
import { ConfirmSessionsDialog } from './components/ConfirmSessionsDialog'
import { WhatsNewToast } from './components/WhatsNewToast'

/** Syncs theme preview (hover in ThemeSelector) to CSS variables. Must be inside ThemePreviewProvider. */
function AppThemePreview() {
  useAppThemePreview()
  return null
}

function App() {
  useAppTheme()
  const sessionCount = useSessionStore(selectSessionCount)
  const sidebarCollapsed = useUIStore(selectSidebarCollapsed)
  const setSidebarCollapsed = useUIStore(state => state.setSidebarCollapsed)
  const settingsPanelOpen = useUIStore(selectSettingsPanelOpen)
  const closeSettings = useUIStore(state => state.closeSettingsPanel)
  const authEnabled = useAuthStore(selectAuthEnabled)
  const user = useAuthStore(selectUser)
  const authLoading = useAuthStore(selectAuthLoading)

  // Workspace state
  const activeItemId = useWorkspaceStore(selectActiveItemId)
  const activeSessionId = useWorkspaceStore(selectActiveSessionId)

  // Get active item imperatively to determine type (safe in render since we depend on activeItemId scalar)
  const activeItem = activeItemId
    ? useWorkspaceStore.getState().items.find(i => i.id === activeItemId)
    : undefined

  const { showConfirmDialog, pendingSessionCount, onConfirm, onCancel, onDisablePrompt } = useURLSync()
  useAuthInit()
  useWorkspaceKeyboard()

  // When auth is enabled and still loading, show nothing to avoid flash
  const needsLogin = authEnabled === true && !user && !authLoading

  // Show login page before any app chrome (no sidebar, no settings panel)
  if (needsLogin) {
    return <LoginPage />
  }

  // Show empty state when no sessions exist or no active session selected
  const showEmptyState = sessionCount === 0 || !activeItemId

  return (
    <>
      {showConfirmDialog && (
        <ConfirmSessionsDialog
          open={showConfirmDialog}
          sessionCount={pendingSessionCount}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onDisablePrompt={onDisablePrompt}
        />
      )}
      <ThemePreviewProvider>
      <AppThemePreview />
      <SidebarProvider
        open={!sidebarCollapsed}
        onOpenChange={(open) => setSidebarCollapsed(!open)}
      >
        <SessionSidebar />
        <SettingsPanel open={settingsPanelOpen} onClose={closeSettings} />
        <SidebarInset className="app">
          {showEmptyState ? (
            <EmptyState />
          ) : activeItem?.type === 'layout' ? (
            <PaneLayout
              itemId={activeItem.id}
              layout={activeItem.tree}
              focusedPaneId={activeItem.focusedPaneId}
              showTitleBar={true}
            />
          ) : activeItem?.type === 'session' && activeSessionId ? (
            <FirstDragDropZone itemId={activeItem.id} activeSessionId={activeSessionId}>
              <PaneContainer
                itemId={activeItem.id}
                paneId={activeSessionId}
                sessionId={activeSessionId}
                isFocused={true}
                variant="standalone"
              />
            </FirstDragDropZone>
          ) : null}
        </SidebarInset>
      </SidebarProvider>
    </ThemePreviewProvider>
    <WhatsNewToast />
    </>
  )
}

export default App
