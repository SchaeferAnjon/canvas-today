import { ipcRenderer } from 'electron'
import type { CnCrashApi } from '../shared/crash'

export const crashApi: CnCrashApi = {
  e2e: process.argv.includes('--cn-e2e'),
  report: (r) => ipcRenderer.send('crash:report', r),
  reload: () => ipcRenderer.invoke('crash:reload'),
  logDir: () => ipcRenderer.invoke('crash:log-dir'),
  revealLogs: () => ipcRenderer.invoke('crash:reveal-logs'),
}
