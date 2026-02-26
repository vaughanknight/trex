import './App.css'
import { SidebarProvider, SidebarInset, SidebarTrigger } from './components/ui/sidebar'
import { SessionSidebar } from './components/SessionSidebar'
import { SettingsPanel } from './components/SettingsPanel'
import { EmptyState } from './components/EmptyState'
import { PaneLayout } from './components/PaneLayout'
import { LoginPage } from './components/LoginPage'
import { ThemePreviewProvider } from './contexts/ThemePreviewContext'
import { useSessionStore, selectSessionCount } from './stores/sessions'
import { useUIStore, selectSidebarCollapsed, selectSettingsPanelOpen } from './stores/ui'
import { useSettingsStore, selectRetroBorderEnabled, selectTheme as selectSettingsTheme } from './stores/settings'
import { useWorkspaceStore, selectActiveItemId } from './stores/workspace'
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

  // Workspace state — subscribe to active item by reference.
  // splitPane/closePane etc. produce new item objects (immutable update),
  // so reference equality naturally triggers re-render when tree changes.
  // Workspace state
  const activeItemId = useWorkspaceStore(selectActiveItemId)
  const activeItem = useWorkspaceStore(
    (state) => state.activeItemId
      ? state.items.find(i => i.id === state.activeItemId)
      : undefined
  )

  // Retro mode
  const retroBorderEnabled = useSettingsStore(selectRetroBorderEnabled)
  const currentTheme = useSettingsStore(selectSettingsTheme)

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
          <SidebarTrigger className="absolute top-2 left-2 z-40 md:hidden" />
          {showEmptyState ? (
            <EmptyState />
          ) : activeItem ? (
            <div
              className="flex-1 min-h-0 flex"
              style={retroBorderEnabled ? {
                padding: '48px',
                backgroundColor: currentTheme === 'commodore-64' ? '#6C5EB5'
                  : currentTheme === 'apple-iie' ? '#33FF33'
                  : 'var(--foreground)',
              } : undefined}
            >
              <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                <PaneLayout
                  itemId={activeItem.id}
                  layout={activeItem.tree}
                  focusedPaneId={activeItem.focusedPaneId}
                  showTitleBar={true}
                />
              </div>
            </div>
          ) : null}
        </SidebarInset>
      </SidebarProvider>
    </ThemePreviewProvider>
    <WhatsNewToast />
    </>
  )
}

export default App
