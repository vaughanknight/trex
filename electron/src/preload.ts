// Preload script for trex desktop
// Minimal for baseline - no exposed APIs needed yet
// This runs in a privileged context before renderer loads

import { contextBridge } from 'electron'

// Expose minimal API to renderer
contextBridge.exposeInMainWorld('trex', {
  platform: process.platform,
})
