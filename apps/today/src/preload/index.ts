/** window.ct：界面和主进程说话的口（见 shared/api.ts）。主窗口和菜单栏小窗共用 */
import { contextBridge, ipcRenderer } from 'electron'
import type { CtApi } from '../shared/api'

const on =
  <A extends unknown[]>(channel: string) =>
  (cb: (...a: A) => void) => {
    const h = (_e: unknown, ...a: A) => cb(...a)
    ipcRenderer.on(channel, h)
    return () => void ipcRenderer.removeListener(channel, h)
  }

const api: CtApi = {
  state: () => ipcRenderer.invoke('ct:state'),
  chooseVault: () => ipcRenderer.invoke('ct:chooseVault'),
  snapshot: () => ipcRenderer.invoke('ct:snapshot'),
  onSnapshot: on('ct:snapshot'),
  edit: (req) => ipcRenderer.invoke('ct:edit', req),
  add: (text, ctx) => ipcRenderer.invoke('ct:add', text, ctx),
  undo: (id) => ipcRenderer.invoke('ct:undo', id),
  newList: (name) => ipcRenderer.invoke('ct:newList', name),
  git: () => ipcRenderer.invoke('ct:git'),
  onGit: on('ct:git'),
  openNote: (path, line) => ipcRenderer.invoke('ct:openNote', path, line),
  previewNotif: (key) => ipcRenderer.invoke('ct:previewNotif', key),
  setSettings: (p) => ipcRenderer.invoke('ct:setSettings', p),
  onSettings: on('ct:settings'),
  taskMenu: (key, lang) => ipcRenderer.invoke('ct:taskMenu', key, lang),
  onOpenTask: on('ct:openTask'),
  onClock: on('ct:clock'),
  onSay: on('ct:say'),
  showMain: (sel) => ipcRenderer.invoke('ct:showMain', sel),
  onMenu: on('ct:menu'),
  ready: () => ipcRenderer.invoke('ct:ready'),
  updateStatus: () => ipcRenderer.invoke('ct:updateStatus'),
  checkUpdate: () => ipcRenderer.invoke('ct:checkUpdate'),
  installUpdate: () => ipcRenderer.invoke('ct:installUpdate'),
  onUpdate: on('ct:update'),
  openRelease: () => ipcRenderer.invoke('ct:openRelease'),
  remState: () => ipcRenderer.invoke('ct:remState'),
  onRem: on('ct:rem'),
  remConnect: () => ipcRenderer.invoke('ct:remConnect'),
  remDisconnect: () => ipcRenderer.invoke('ct:remDisconnect'),
  remSetMirror: (on) => ipcRenderer.invoke('ct:remSetMirror', on),
  remSetList: (title) => ipcRenderer.invoke('ct:remSetList', title),
  remLists: () => ipcRenderer.invoke('ct:remLists'),
  remPreview: (o) => ipcRenderer.invoke('ct:remPreview', o),
  remImport: (o) => ipcRenderer.invoke('ct:remImport', o),
  remDeleteOriginals: (rids) => ipcRenderer.invoke('ct:remDeleteOriginals', rids),
  remDismissBanner: () => ipcRenderer.invoke('ct:remDismissBanner'),
  remOpenPrivacy: () => ipcRenderer.invoke('ct:remOpenPrivacy'),
  remOpenICloud: () => ipcRenderer.invoke('ct:remOpenICloud'),
  onNotice: on('ct:notice'),
}

contextBridge.exposeInMainWorld('ct', api)
