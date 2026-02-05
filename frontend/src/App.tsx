import './App.css'
import { SidebarProvider, SidebarInset } from './components/ui/sidebar'
import { SessionSidebar } from './components/SessionSidebar'
import { SettingsPanel } from './components/SettingsPanel'
import { EmptyState } from './components/EmptyState'
import { TerminalContainer } from './components/TerminalContainer'
import { useSessionStore, selectSessionCount } from './stores/sessions'
import { useUIStore, selectActiveSessionId, selectSidebarCollapsed, selectSettingsPanelOpen } from './stores/ui'

function App() {
  const sessionCount = useSessionStore(selectSessionCount)
  const activeSessionId = useUIStore(selectActiveSessionId)
  const sidebarCollapsed = useUIStore(selectSidebarCollapsed)
  const setSidebarCollapsed = useUIStore(state => state.setSidebarCollapsed)
  const settingsPanelOpen = useUIStore(selectSettingsPanelOpen)
  const closeSettings = useUIStore(state => state.closeSettingsPanel)

  // Show empty state when no sessions exist or no active session selected
  const showEmptyState = sessionCount === 0 || !activeSessionId

  return (
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
  )
}

export default App
