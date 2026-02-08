import './App.css'
import { SidebarProvider, SidebarInset } from './components/ui/sidebar'
import { SessionSidebar } from './components/SessionSidebar'
import { SettingsPanel } from './components/SettingsPanel'
import { EmptyState } from './components/EmptyState'
import { TerminalContainer } from './components/TerminalContainer'
import { ThemePreviewProvider } from './contexts/ThemePreviewContext'
import { useSessionStore, selectSessionCount } from './stores/sessions'
import { useUIStore, selectActiveSessionId, selectSidebarCollapsed, selectSettingsPanelOpen } from './stores/ui'
import { useAuthStore, selectAuthEnabled, selectUser, selectAuthLoading } from './stores/auth'
import { useURLSync } from './hooks/useURLSync'
import { useAuthInit } from './hooks/useAuthInit'
import { ConfirmSessionsDialog } from './components/ConfirmSessionsDialog'

function App() {
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
      <SidebarProvider
        open={!sidebarCollapsed}
        onOpenChange={(open) => setSidebarCollapsed(!open)}
      >
        <SessionSidebar />
        <SettingsPanel open={settingsPanelOpen} onClose={closeSettings} />
        <SidebarInset className="app">
          {needsLogin ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4">
                <h2 className="text-xl font-semibold text-foreground">Authentication Required</h2>
                <p className="text-muted-foreground">Login with GitHub to access terminal sessions.</p>
                <button
                  onClick={() => { window.location.href = '/auth/github' }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Login with GitHub
                </button>
              </div>
            </div>
          ) : showEmptyState ? (
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
