import { app, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as http from 'http'

const BACKEND_PORT = 3000
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`
const HEALTH_CHECK_INTERVAL = 100
const HEALTH_CHECK_MAX_ATTEMPTS = 50

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null

function getBackendPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'trex')
  }
  return path.join(__dirname, '..', '..', 'dist', 'trex')
}

function startBackend(): ChildProcess {
  const backendPath = getBackendPath()
  console.log(`Starting backend: ${backendPath}`)

  const proc = spawn(backendPath, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  proc.stdout?.on('data', (data: Buffer) => {
    console.log(`[backend] ${data.toString().trim()}`)
  })

  proc.stderr?.on('data', (data: Buffer) => {
    console.error(`[backend] ${data.toString().trim()}`)
  })

  proc.on('error', (err: Error) => {
    console.error('Failed to start backend:', err)
  })

  proc.on('exit', (code: number | null) => {
    console.log(`Backend exited with code ${code}`)
    backendProcess = null
  })

  return proc
}

function waitForBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0

    const check = () => {
      attempts++
      const req = http.get(`${BACKEND_URL}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve()
        } else {
          retry()
        }
      })

      req.on('error', () => {
        retry()
      })

      req.setTimeout(1000, () => {
        req.destroy()
        retry()
      })
    }

    const retry = () => {
      if (attempts >= HEALTH_CHECK_MAX_ATTEMPTS) {
        reject(new Error('Backend failed to start'))
      } else {
        setTimeout(check, HEALTH_CHECK_INTERVAL)
      }
    }

    check()
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadURL(BACKEND_URL)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function initialize(): Promise<void> {
  backendProcess = startBackend()

  try {
    await waitForBackend()
    console.log('Backend is ready')
    createWindow()
  } catch (err) {
    console.error('Failed to initialize:', err)
    app.quit()
  }
}

function stopBackend(): void {
  if (backendProcess) {
    console.log('Stopping backend...')
    backendProcess.kill('SIGTERM')
    backendProcess = null
  }
}

app.whenReady().then(initialize)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null && backendProcess) {
    createWindow()
  }
})

app.on('before-quit', () => {
  stopBackend()
})

app.on('quit', () => {
  stopBackend()
})
