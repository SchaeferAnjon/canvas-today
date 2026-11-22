/**
 * 画布今日的主进程：打开和画布笔记同一个库、建索引、改库里那一行、提交、到点提醒、菜单栏、canvas-today:// 链接、检查更新。
 */
import { app, BrowserWindow, dialog, ipcMain, autoUpdater as nativeUpdater, nativeTheme, shell } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { hostname, homedir, userInfo } from 'node:os'
import { join, resolve } from 'node:path'
import * as git from '@cn/git'
import { Updater } from '../../../notes/src/main/updater'
import { activeSkin, skinOf } from '../../../notes/src/shared/appearance'
import { deviceDir } from '@cn/tasks'
import type { AddCtx, AppState, EditReq, GitInfo } from '../shared/api'
import PKG from '../../package.json'
import { BRAND, noteUrl, releaseUrl } from '../shared/brand'
import { type Lang, tr } from '../shared/i18n'
import type { TodaySettings } from '../shared/settings'
import { isoOf } from '../shared/when'
import { clockOffset, now, onClock } from './clock'
import { Committer } from './commit'
import { addTask, applyEdit, newList } from './edits'
import { appMenu, taskMenu } from './menu'
import { Reminders } from './remind'
import { effectiveLook, notesDataDir, notesVault, SettingsFile, watchNotesSettings } from './settings'
import { E2E, guardScreen } from './test-mode'
import { MenuBar } from './tray'
import { TaskVault } from './vault'

app.setPath('userData', process.env.CT_USER_DATA || join(app.getPath('appData'), BRAND.userDataDir))
app.setName(BRAND.name)
guardScreen()

const preload = () => join(__dirname, '../preload/index.js')
const notesDir = notesDataDir(homedir())
let settings: SettingsFile
let win: BrowserWindow | null = null
let vault: TaskVault | null = null
let committer: Committer | null = null
let reminders: Reminders | null = null
let updater: Updater | null = null
/** 检查更新建好了（发布包要先加载 electron-updater）；界面来问之前先等它 */
let updaterReady: Promise<void> = Promise.resolve()
let quitting = false
/** 界面还没准备好时来的 canvas-today:// 链接 */
const pendingUrls: string[] = []
let rendererReady = false

const today = () => isoOf(now())
const lang = (): Lang => settings.read().lang

function sysLang(): Lang {
  const l = (app.getPreferredSystemLanguages()[0] ?? app.getLocale() ?? 'zh').toLowerCase()
  return l.startsWith('zh') ? 'zh' : 'en'
}

/** 设备名（提醒记录按设备分文件）：电脑名，测试用 CT_DEVICE */
function device(): string {
  if (process.env.CT_DEVICE) return deviceDir(process.env.CT_DEVICE)
  try {
    return deviceDir(execFileSync('scutil', ['--get', 'ComputerName'], { encoding: 'utf8', timeout: 2000 }).trim())
  } catch {
    return deviceDir(hostname().replace(/\.local$/, ''))
  }
}
const DEVICE = device()

/** 所有窗口（主窗口、菜单栏小窗）都要知道的 */
function broadcast(channel: string, ...args: unknown[]) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, ...args)
}

function winColor(): string {
  const look = effectiveLook(settings.read(), notesDir)
  return skinOf(activeSkin({ ...look, homeStyle: 'a', homeWinBg: false, winBgFile: null }, nativeTheme.shouldUseDarkColors)).win
}

function isDir(p: string) {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

// ---------- 库 ----------

let gitTimer: NodeJS.Timeout | null = null
async function gitInfo(): Promise<GitInfo | null> {
  if (!vault) return null
  try {
    const [st, branch] = await Promise.all([git.status(vault.root), git.currentBranch(vault.root)])
    return { changed: st.length, branch }
  } catch {
    return { changed: 0, branch: '' }
  }
}
function refreshGit() {
  if (gitTimer) clearTimeout(gitTimer)
  gitTimer = setTimeout(() => void gitInfo().then((g) => g && broadcast('ct:git', g)), 400)
}

let snapTimer: NodeJS.Timeout | null = null
function pushSnapshot() {
  if (snapTimer) clearTimeout(snapTimer)
  snapTimer = setTimeout(() => {
    if (!vault) return
    broadcast('ct:snapshot', vault.snapshot())
    reminders?.soon()
    refreshGit()
  }, 30)
}

async function openVault(dir: string): Promise<void> {
  const root = resolve(dir)
  if (!(await git.isRepo(root))) await git.init(root)
  const u = userInfo().username
  await git.ensureIdentity(root, { name: u, email: `${u}@${hostname().replace(/\.local$/, '')}.local` })
  await committer?.flush()
  reminders?.stop()
  vault?.close()
  const v = new TaskVault(root)
  await v.scan()
  vault = v
  committer = new Committer(root)
  committer.onDone = () => refreshGit()
  committer.onError = (e) => {
    console.error('提交没成功', e)
    broadcast('ct:say', tr(lang(), 'failed', e.message))
  }
  v.onChange = pushSnapshot
  v.onWrote = (paths, msg) => committer?.add(paths, msg)
  v.onLogs = () => void reminders?.loadEvents().then(() => reminders?.soon())
  v.watch()
  reminders = new Reminders(v, DEVICE, {
    tasks: () => vault?.snapshot().tasks ?? [],
    noteTitle: (p) => p.replace(/^.*\//, '').replace(/\.md$/i, ''),
    lang,
    now,
    tick: async (t) => {
      const r = await applyEdit(v, { path: t.path, line: t.line, raw: t.raw, edit: { op: 'done', done: true } }, today())
      if (!r.ok) broadcast('ct:say', tr(lang(), 'gone'))
    },
    open: (t) => showMain({ key: t.key }),
    say: (text) => broadcast('ct:say', text),
    wrote: (paths, msg) => committer?.add(paths, msg),
  })
  await reminders.start()
  if (!process.env.CT_VAULT) settings.set({ lastVault: root })
}

/** 用哪个库：测试指定的 → 在画布今日里自己选过的 → 画布笔记上次打开的（两个软件同一个库）→ 画布今日上次的 */
function vaultDir(): string | null {
  const own = settings.read()
  const candidates = [process.env.CT_VAULT, own.vaultChosen ? own.lastVault : undefined, notesVault(notesDir), own.lastVault]
  return candidates.find((d): d is string => !!d && isDir(d)) ?? null
}

async function state(): Promise<AppState> {
  const s = settings.read()
  const g = vault ? await gitInfo() : null
  return {
    vault: vault ? { path: vault.root, name: vault.name, branch: g?.branch ?? '' } : null,
    settings: s,
    look: effectiveLook(s, notesDir),
    clockOffset: clockOffset(),
    device: DEVICE,
    // 开发时 Electron 找不到包里的 package.json，app.getVersion() 是 Electron 自己的版本：直接用 package.json 的
    version: PKG.version,
    e2e: E2E,
  }
}

// ---------- 窗口 ----------

function load(w: BrowserWindow, page: 'index' | 'tray') {
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${page}.html`)
  else void w.loadFile(join(__dirname, `../renderer/${page}.html`))
}

/** 红绿灯：标题栏 40 高（A、B 一样，同画布笔记），垂直居中、左边 16 */
function lights(frame: 'a' | 'b') {
  win?.setWindowButtonPosition({ x: 16, y: 14 })
}

function createWindow() {
  const look = effectiveLook(settings.read(), notesDir)
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    ...(E2E ? { x: -3000, y: 80 } : {}),
    title: BRAND.name,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: winColor(),
    show: false,
    webPreferences: { preload: preload(), contextIsolation: true, sandbox: true, ...(E2E ? { backgroundThrottling: false } : {}) },
  })
  win.once('ready-to-show', () => {
    if (!E2E) win?.show()
  })
  win.on('closed', () => {
    win = null
    rendererReady = false
  })
  load(win, 'index')
}

/** 打开主窗口（菜单栏小窗、通知、链接点过来）；sel 是要选中的那一条 */
function showMain(sel?: { id?: string; key?: string }) {
  if (!win) createWindow()
  if (sel) {
    if (rendererReady) win!.webContents.send('ct:openTask', sel)
    else win!.webContents.once('did-finish-load', () => setTimeout(() => win?.webContents.send('ct:openTask', sel), 300))
  }
  menuBar.hide()
  if (!E2E) {
    win!.show()
    win!.focus()
  }
}

/** canvas-today://task/<🆔> */
function handleUrl(url: string) {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return
  }
  if (u.protocol !== `${BRAND.scheme}:`) return
  const id = decodeURIComponent((u.hostname === 'task' ? u.pathname.replace(/^\//, '') : u.pathname.replace(/^\/*task\//, '')).trim())
  if (!id) return
  if (!rendererReady) {
    pendingUrls.push(url)
    return
  }
  showMain({ id })
}

const menuBar = new MenuBar({ preload: preload(), load, showMain: () => showMain(), lang: () => (settings ? lang() : 'zh'), bg: () => winColor(), update: () => updater?.status() ?? null, installUpdate: () => void installUpdate() })

// ---------- 界面问的 ----------

function needVault(): TaskVault {
  if (!vault) throw new Error('还没有打开库')
  return vault
}

function registerIpc() {
  ipcMain.handle('ct:state', () => state())
  ipcMain.handle('ct:ready', () => {
    rendererReady = true
    for (const u of pendingUrls.splice(0)) handleUrl(u)
  })
  ipcMain.handle('ct:chooseVault', async () => {
    const r = await dialog.showOpenDialog(win!, { title: tr(lang(), 'chooseTitle'), buttonLabel: lang() === 'zh' ? '打开' : 'Open', properties: ['openDirectory', 'createDirectory'] })
    if (!r.canceled && r.filePaths[0]) {
      await openVault(r.filePaths[0])
      settings.set({ vaultChosen: true })
      pushSnapshot()
    }
    return state()
  })
  ipcMain.handle('ct:snapshot', () => needVault().snapshot())
  ipcMain.handle('ct:edit', (_e, req: EditReq) => {
    if (!req || typeof req.path !== 'string' || typeof req.line !== 'number' || typeof req.raw !== 'string' || !req.edit) throw new Error('改动的参数不对')
    return applyEdit(needVault(), req, today())
  })
  ipcMain.handle('ct:add', (_e, text: unknown, ctx: AddCtx) => {
    if (typeof text !== 'string') throw new Error('加一条的参数不对')
    const v = needVault()
    return addTask(v, text, ctx, today(), v.snapshot())
  })
  ipcMain.handle('ct:undo', async (_e, id: unknown) => {
    if (typeof id !== 'string') throw new Error('撤销的参数不对')
    const r = await needVault().undo(id)
    return r === 'ok' ? { ok: true } : { ok: false, reason: r }
  })
  ipcMain.handle('ct:newList', (_e, name: unknown) => {
    if (typeof name !== 'string') throw new Error('清单名字不对')
    return newList(needVault(), name)
  })
  ipcMain.handle('ct:git', () => gitInfo())
  ipcMain.handle('ct:openNote', async (_e, path: unknown, line: unknown) => {
    if (typeof path !== 'string') throw new Error('路径不对')
    needVault().abs(path)
    try {
      await shell.openExternal(noteUrl(path, typeof line === 'number' ? line + 1 : undefined))
      return { ok: true }
    } catch (e) {
      console.error('打不开画布笔记', e)
      return { ok: false }
    }
  })
  ipcMain.handle('ct:previewNotif', (_e, key: unknown) => {
    const t = needVault()
      .snapshot()
      .tasks.find((x) => x.key === key)
    if (t) reminders?.preview(t)
  })
  ipcMain.handle('ct:setSettings', (_e, p: Partial<TodaySettings>) => {
    if (!p || typeof p !== 'object') throw new Error('设置参数不对')
    const before = settings.read()
    const s = settings.set(p)
    const look = effectiveLook(s, notesDir)
    if (s.lang !== before.lang) {
      appMenu(s.lang, menuHandlers)
      menuBar.relabel()
    }
    if (s.tray !== before.tray) menuBar.set(s.tray)
    win?.setBackgroundColor(winColor())
    lights(look.frame)
    broadcast('ct:settings', { settings: s, look })
    return { settings: s, look }
  })
  ipcMain.handle('ct:taskMenu', async (e, key: unknown, l: Lang) => {
    const t = needVault()
      .snapshot()
      .tasks.find((x) => x.key === key)
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!t || !w) return null
    return taskMenu(w, t, today(), l === 'en' ? 'en' : 'zh')
  })
  ipcMain.handle('ct:showMain', (_e, sel?: { key: string }) => showMain(sel))
  ipcMain.handle('ct:updateStatus', async () => {
    await updaterReady
    return updater!.status()
  })
  ipcMain.handle('ct:checkUpdate', async () => {
    await updaterReady
    try {
      const state = await updater!.check()
      return { ok: state.phase !== 'error', state }
    } catch {
      return { ok: false, state: updater!.status() }
    }
  })
  ipcMain.handle('ct:installUpdate', async () => {
    await updaterReady
    return installUpdate()
  })
  ipcMain.handle('ct:openRelease', async () => {
    await updaterReady
    await shell.openExternal(releaseUrl(updater!.status().version || PKG.version))
  })
}

const menuHandlers = {
  settings: () => win?.webContents.send('ct:menu', 'settings'),
  search: () => win?.webContents.send('ct:menu', 'search'),
  update: () => updater?.status() ?? null,
  checkUpdate: () => checkFromMenu(),
  installUpdate: () => void installUpdate(),
}

// ---------- 检查更新 ----------

/**
 * 照画布笔记（apps/notes/src/main/index.ts 的 setupUpdater，同一个 Updater 类）：发布包（打包时带了 app-update.yml）才查，
 * 开发版、本机自己打的包、端到端测试不查。查 GitHub 上 brand.json 里 repo 的 Release（latest-mac.yml），启动 30 秒后一次、之后每 6 小时；
 * 下好了界面底栏出「重启更新到 x」，不点就下次退出时装上。CT_UPDATE_URL：测试时指向本机的更新服务器（测试模式里只有给了它才查）
 */
async function setupUpdater() {
  const feedUrl = process.env.CT_UPDATE_URL ?? ''
  const supported = app.isPackaged && existsSync(join(process.resourcesPath, 'app-update.yml')) && (!E2E || !!feedUrl)
  // electron-updater 是 CommonJS，autoUpdater 是取值时才建的属性：从 ESM 里 import 时它在 default 上
  type Engine = ConstructorParameters<typeof Updater>[0]['engine']
  const mod = supported ? ((await import('electron-updater')) as unknown as { autoUpdater?: Engine; default?: { autoUpdater: Engine } }) : null
  const engine = mod ? (mod.default?.autoUpdater ?? mod.autoUpdater) : undefined
  updater = new Updater({
    supported,
    enabled: () => settings.read().autoUpdate,
    feedUrl,
    engine,
    native: process.platform === 'darwin' ? nativeUpdater : null,
    inApps: !app.isPackaged || app.isInApplicationsFolder(),
    version: PKG.version,
    checkedAt: settings.read().updateCheckedAt ?? 0,
  })
  let phase = ''
  updater.on('state', (st) => {
    broadcast('ct:update', st)
    if (st.phase === phase) return // 下载进度一秒好几次，菜单只在阶段变了时重建
    phase = st.phase
    if (st.phase === 'latest') settings.set({ updateCheckedAt: st.checkedAt })
    appMenu(lang(), menuHandlers)
  })
  updater.on('quitting', () => (quitting = true))
  nativeUpdater.on('before-quit-for-update', () => (quitting = true))
  appMenu(lang(), menuHandlers)
  broadcast('ct:update', updater.status())
  updater.start()
}

/** 下好的新版：先把排着的提交做完，再退出、装上、重新打开 */
async function installUpdate(): Promise<boolean> {
  if (updater?.status().phase !== 'ready') return false
  reminders?.stop()
  await Promise.race([committer?.flush(), new Promise((r) => setTimeout(r, 5000))]).catch((e) => console.error('更新前提交失败', e))
  vault?.close()
  quitting = true
  return updater.install()
}

/** 软件菜单「检查更新…」：打开主窗口的设置（状态在「版本和更新」那一行），立刻查一次 */
function checkFromMenu() {
  const fresh = !win
  showMain()
  if (fresh) win!.webContents.once('did-finish-load', () => setTimeout(() => menuHandlers.settings(), 300))
  else menuHandlers.settings()
  void updater?.check().catch(() => undefined)
}

// ---------- 起来、退出 ----------

app.on('open-url', (e, url) => {
  e.preventDefault()
  handleUrl(url)
})

if (app.isPackaged && !E2E) {
  if (!app.requestSingleInstanceLock()) app.quit()
  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a) => a.startsWith(`${BRAND.scheme}://`))
    if (url) handleUrl(url)
    else showMain()
  })
}

app.whenReady().then(async () => {
  settings = new SettingsFile(join(app.getPath('userData'), 'settings.json'), sysLang())
  if (E2E) app.dock?.hide()
  else if (!app.isPackaged) app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  if (app.isPackaged && !E2E) app.setAsDefaultProtocolClient(BRAND.scheme)
  registerIpc()
  appMenu(lang(), menuHandlers)
  updaterReady = setupUpdater()
  const dir = vaultDir()
  if (dir) await openVault(dir)
  createWindow()
  menuBar.set(settings.read().tray)
  onClock((off) => {
    broadcast('ct:clock', off)
    reminders?.soon()
  })
  watchNotesSettings(notesDir, () => {
    const s = settings.read()
    if (!s.followNotes) return
    const look = effectiveLook(s, notesDir)
    win?.setBackgroundColor(winColor())
    lights(look.frame)
    broadcast('ct:settings', { settings: s, look })
  })
  nativeTheme.on('updated', () => win?.setBackgroundColor(winColor()))
  app.on('activate', () => showMain())
})

// 关掉主窗口不退出：常驻菜单栏（关了菜单栏的照 macOS 习惯也留在程序坞里）
app.on('window-all-closed', () => {
  if (quitting || E2E) app.quit()
})

app.on('before-quit', (e) => {
  if (quitting || !committer) return
  quitting = true
  e.preventDefault()
  reminders?.stop()
  vault?.close()
  // 退出前把排着的提交掉，最多等 5 秒
  void Promise.race([committer.flush(), new Promise((r) => setTimeout(r, 5000))]).finally(() => app.quit())
})

