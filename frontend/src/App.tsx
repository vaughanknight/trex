import './App.css'
import { SidebarProvider, SidebarInset } from './components/ui/sidebar'
import { SessionSidebar } from './components/SessionSidebar'
import { SettingsPanel } from './components/SettingsPanel'
import { EmptyState } from './components/EmptyState'
import { TerminalContainer } from './components/TerminalContainer'
import { LoginPage } from './components/LoginPage'
import { ThemePreviewProvider } from './contexts/ThemePreviewContext'
import { useSessionStore, selectSessionCount } from './stores/sessions'
import { useUIStore, selectActiveSessionId, selectSidebarCollapsed, selectSettingsPanelOpen } from './stores/ui'
import { useAuthStore, selectAuthEnabled, selectUser, selectAuthLoading } from './stores/auth'
import { useURLSync } from './hooks/useURLSync'
import { useAuthInit } from './hooks/useAuthInit'
import { useAppTheme, useAppThemePreview } from './hooks/useAppTheme'
import { ConfirmSessionsDialog } from './components/ConfirmSessionsDialog'

/** Syncs theme preview (hover in ThemeSelector) to CSS variables. Must be inside ThemePreviewProvider. */
function AppThemePreview() {
  useAppThemePreview()
  return null
}

function App() {
  useAppTheme()
  const sessionCount = useSessionStore(selectSessionCount)
  const activeSessionId = useUIStore(selectActiveSessionId)
  const sidebarCollapsed = useUIStore(selectSidebarCollapsed)
  const setSidebarCollapsed = useUIStore(state => state.setSidebarCollapsed)
  const settingsPanelOpen = useUIStore(selectSettingsPanelOpen)
  const closeSettings = useUIStore(state => state.closeSettingsPanel)
  const authEnabled = useAuthStore(selectAuthEnabled)
  const user = useAuthStore(selectUser)
  const authLoading = useAuthStore(selectAuthLoading)
  const { showConfirmDialog, pendingSessionCount, onConfirm, onCancel, onDisablePrompt } = useURLSync()
  useAuthInit()

  // When auth is enabled and still loading, show nothing to avoid flash
  const needsLogin = authEnabled === true && !user && !authLoading

  // Show login page before any app chrome (no sidebar, no settings panel)
  if (needsLogin) {
    return <LoginPage />
  }

  // Show empty state when no sessions exist or no active session selected
  const showEmptyState = sessionCount === 0 || !activeSessionId

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
          ) : (
            <TerminalContainer />
          )}
        </SidebarInset>
      </SidebarProvider>
    </ThemePreviewProvider>
    </>
  )
}

export default App
