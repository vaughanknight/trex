import './App.css'
import { Terminal } from './components/Terminal'
import { SidebarProvider, SidebarInset } from './components/ui/sidebar'
import { SessionSidebar } from './components/SessionSidebar'

function App() {
  return (
    <SidebarProvider defaultOpen={false}>
      <SessionSidebar />
      <SidebarInset className="app">
        <Terminal />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
