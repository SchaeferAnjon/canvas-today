import { ipcRenderer } from 'electron'
import type { CnFamilyApi } from '../shared/family'

/** 设置 › 软件家族：实现在 main/family.ts */
export const familyApi: CnFamilyApi = {
  get: () => ipcRenderer.invoke('family:get'),
  recheck: () => ipcRenderer.invoke('family:recheck'),
  setLink: (id, on) => ipcRenderer.invoke('family:setLink', id, on),
  open: (id) => ipcRenderer.invoke('family:open', id),
  download: (id) => ipcRenderer.invoke('family:download', id),
  hub: () => ipcRenderer.invoke('family:hub'),
  readInParaRead: (rel) => ipcRenderer.invoke('family:readInParaRead', rel),
  onLinks: (f) => {
    const h = (_e: unknown, links: Record<string, boolean>) => f(links)
    ipcRenderer.on('family:links', h)
    return () => void ipcRenderer.off('family:links', h)
  },
  onChanged: (f) => {
    const h = () => f()
    ipcRenderer.on('family:changed', h)
    return () => void ipcRenderer.off('family:changed', h)
  },
}
