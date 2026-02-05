import './App.css'
import { SidebarProvider, SidebarInset } from './components/ui/sidebar'
import { SessionSidebar } from './components/SessionSidebar'
import { EmptyState } from './components/EmptyState'
import { TerminalContainer } from './components/TerminalContainer'
import { useSessionStore, selectSessionCount } from './stores/sessions'
import { useUIStore, selectActiveSessionId, selectSidebarCollapsed } from './stores/ui'

function App() {
  const sessionCount = useSessionStore(selectSessionCount)
  const activeSessionId = useUIStore(selectActiveSessionId)
  const sidebarCollapsed = useUIStore(selectSidebarCollapsed)
  const setSidebarCollapsed = useUIStore(state => state.setSidebarCollapsed)

  // Show empty state when no sessions exist or no active session selected
  const showEmptyState = sessionCount === 0 || !activeSessionId

  return (
    <SidebarProvider
      open={!sidebarCollapsed}
      onOpenChange={(open) => setSidebarCollapsed(!open)}
    >
      <SessionSidebar />
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
