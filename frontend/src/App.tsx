import { useEffect, useState } from 'react'
import './App.css'

interface HealthResponse {
  status: string
  version: string
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: HealthResponse) => setHealth(data))
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <div className="app">
      <h1>trex is running</h1>
      <p className="subtitle">tmux session management UI</p>

      <div className="health-status">
        <h2>Backend Status</h2>
        {error && <p className="error">Error: {error}</p>}
        {health && (
          <div className="health-info">
            <p>
              Status: <span className="status-ok">{health.status}</span>
            </p>
            <p>Version: {health.version}</p>
          </div>
        )}
        {!health && !error && <p>Connecting...</p>}
      </div>
    </div>
  )
}

export default App
