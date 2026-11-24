/**
 * 画布今日的主进程：打开和画布笔记同一个库、建索引、改库里那一行、提交、到点提醒、菜单栏、canvas-today:// 链接、检查更新。
 */
import { app, BrowserWindow, dialog, ipcMain, autoUpdater as nativeUpdater, nativeTheme, shell } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { hostname, homedir, userInfo } from 'node:os'
import { join, resolve } from 'node:path'
import * as git from '@cn/git'
import { Updater } from '../../../notes/src/main/updater'
import { activeSkin, skinOf } from '../../../notes/src/shared/appearance'
import { ThemeStore } from '../../../notes/src/main/themes'
import { themeInfo } from '../../../notes/src/shared/vscode-theme'
import { deviceDir, lineAt, minutesOf, splitLines } from '@cn/tasks'
import type { AddCtx, AiSlot, AppState, LookState, EditReq, FocusOp, FocusTask, GitInfo, HabitOp, TaskView } from '../shared/api'
import type { Busy, SchedCandidate } from '../shared/ai-plan'
import type { CloseItem } from '../shared/plan'
import { type ChatCtx, chatTitle, type CtxEvent, type CtxTask, type ChatPlan, pickTasks, type TodayMsg } from '../shared/ai-chat'
import { INBOX_NOTE } from '../shared/brand'
import PKG from '../../package.json'
import { BRAND, noteUrl, releaseUrl } from '../shared/brand'
import { type Lang, tr } from '../shared/i18n'
import type { TodaySettings } from '../shared/settings'
import { findAgain, listed, open } from '../shared/views'
import { isoOf, isoPlus, localNowOf, localStamp, whenLabel } from '../shared/when'
import { clockOffset, now, onClock } from './clock'
import { Committer } from './commit'
import { aiLabel, aiPick, aiSchedule, aiSplit, aiWhen, BorrowNeeded, warmUp } from './ai'
import { borrowFromNotes, dropTodayKey, initKeys, needBorrow, notesHasKey, todayKeyTail } from './ai-keys'
import { API_IDS, isApi } from '@cn/ai-engines/shared'
import { calPrefsPath } from './cal-hidden'
import { CalendarLink } from './calendar'
import { addSubtasks, addTask, applyEdit, applyPlan, ensureTaskId, newList, setTimes } from './edits'
import { TodayChats } from './ai-chat'
import { ENGINE_LABEL, pickLabel } from '@cn/ai-engines/shared'
import { FocusTimer } from './focus'
import { habitEdit } from './habits'
import { appMenu, calMenu, habitMenu, taskMenu } from './menu'
import { RemMirror } from './mirror'
import { helperCommand, RemHelper } from './rem-helper'
import { notifier, Reminders } from './remind'
import { McLink } from './mc'
import { effectiveLook, notesDataDir, notesVault, SettingsFile, themesDir, watchNotesSettings, watchThemes } from './settings'
import { E2E, guardScreen } from './test-mode'
import { registerFamily } from '../../../notes/src/main/family'
import { journalOf, PlanDayFile, writeClose } from './plan'
import { trayLine } from '../shared/plan'
import { MenuBar } from './tray'
import { QuickPanel } from './quick'
import type { QuickAddResult, QuickItem } from '../shared/api'
import { pathTitle } from '../shared/quick'
import { cntToday } from '../shared/views'
import { TaskVault } from './vault'
import { RECYCLE_DIR, sweepTemps } from '@cn/atomic'

app.setPath('userData', process.env.CT_USER_DATA || join(app.getPath('appData'), BRAND.userDataDir))
app.setName(BRAND.name)
guardScreen()

const preload = () => join(__dirname, '../preload/index.js')
const notesDir = notesDataDir(homedir())
/** 导入的 VS Code 主题：和画布笔记同一个文件夹（main/settings.ts themesDir） */
const themes = new ThemeStore(themesDir(notesDir, app.getPath('userData')))
const userSkins = () => themes.list().map(themeInfo)
/** 现在该用的外观（跟画布笔记时是画布笔记的，导入的主题也认） */
const lookOf = (s: TodaySettings) => effectiveLook(s, notesDir, userSkins())
/** 设置、外观、导入的主题一起：推给界面的那一份 */
const lookState = (s: TodaySettings = settings.read()): LookState => ({ settings: s, look: lookOf(s), themes: themes.list() })
let settings: SettingsFile
let win: BrowserWindow | null = null
let vault: TaskVault | null = null
/** 设置 › 软件家族（和画布笔记同一份 main/family.ts）：whenReady 里建好 */
let family: ReturnType<typeof registerFamily> | null = null
let committer: Committer | null = null
let reminders: Reminders | null = null
/** MeetCaption 联动（main/mc.ts）：上课前问开字幕、今日页那节课、待办来自哪节课 */
let mc: McLink | null = null
/** 镜像进系统提醒事项（task-b9y8i）：whenReady 里建好 */
let mirror: RemMirror | null = null
let updater: Updater | null = null
/** 番茄钟（main/focus.ts）：whenReady 里建好 */
let focus: FocusTimer | null = null
/** 系统日历（只读，main/calendar.ts）：和提醒事项共用一个小助手 */
let calendar: CalendarLink | null = null
/** 检查更新建好了（发布包要先加载 electron-updater）；界面来问之前先等它 */
let updaterReady: Promise<void> = Promise.resolve()
let quitting = false
/** 排一天：这台设备今天排过没有、收工没有（main/plan.ts） */
let planDay: PlanDayFile | null = null
/** 界面还没准备好时来的 canvas-today:// 链接 */
const pendingUrls: string[] = []
let rendererReady = false
/** 「快捷键被占了」打开时已经说过 */
let quickTakenSaid = false

const today = () => isoOf(now())
/** 软件的钟现在是当天第几分钟 */
const nowMin = () => {
  const d = new Date(now())
  return d.getHours() * 60 + d.getMinutes()
}

/** 菜单栏图标旁边那一行：正在做的那一块和还剩几分钟，没有就是下一块（排一天，设置能关） */
function trayTitle() {
  const s = settings.read()
  menuBar.setLine(s.plan.tray && vault ? trayLine(lang(), vault.snapshot().tasks, today(), nowMin()) : '')
}
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
  const look = lookOf(settings.read())
  return skinOf(activeSkin({ ...look, homeStyle: 'a', homeWinBg: false, winBgFile: null }, nativeTheme.shouldUseDarkColors), userSkins()).win
}

/** 外观变了：窗口底色、红绿灯、所有窗口都换上 */
function pushLook(s: TodaySettings): LookState {
  const ls = lookState(s)
  win?.setBackgroundColor(winColor())
  lights(ls.look.frame)
  broadcast('ct:settings', ls)
  return ls
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
    // 同步途中（pull --rebase，HEAD 临时分离）分支照样拿得到（headState），不落到下面那个空分支
    const [st, head] = await Promise.all([git.status(vault.root), git.headState(vault.root)])
    return { changed: st.length, branch: head.branch ?? '' }
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
    const snap = vault.snapshot()
    broadcast('ct:snapshot', snap)
    menuBar.setCount(cntToday(snap.tasks, today()))
    reminders?.soon()
    refreshGit()
    trayTitle()
  }, 30)
}

/**
 * 「打开笔记，到这一行」：设置 › 软件家族「用画布笔记打开」开着（默认）时 canvas-notes://open 跳进画布笔记那一行；
 * 关了用系统里默认打开 .md 的软件打开这一篇（不带行号）
 */
async function openNote(path: string, line?: number): Promise<'notes' | 'default'> {
  if (family?.linkOn('cn-open') === false) {
    const err = await shell.openPath(needVault().abs(path))
    if (err) throw new Error(err)
    return 'default'
  }
  await shell.openExternal(noteUrl(path, line === undefined ? undefined : line + 1))
  return 'notes'
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
  // 上次崩溃、断电留下的临时文件（没换上去的那次保存）挪进 .canvas-notes/回收/、记一行（task-8dula）；不挡着打开
  void sweepTemps(root).then(
    (m) => m.length && console.log(`挪走 ${m.length} 个崩溃留下的临时文件，见 ${RECYCLE_DIR}/记录.txt`),
    (e) => console.error('收拾崩溃留下的临时文件没成功', e),
  )
  await v.scan()
  vault = v
  committer = new Committer(root)
  committer.onDone = () => refreshGit()
  committer.onError = (e) => {
    console.error('提交没成功', e)
    broadcast('ct:say', tr(lang(), 'failed', e.message))
  }
  v.onChange = () => {
    pushSnapshot()
    mirror?.soon()
  }
  v.onWrote = (paths, msg) => committer?.add(paths, msg)
  v.onLogs = () => void reminders?.loadEvents().then(() => reminders?.soon())
  v.onFocusLogs = () => void focus?.load()
  v.watch()
  family?.watch(root)
  // 先认出哪些镜像着（索引里 ringBy: 'reminders'），本机通知再开始排：重开软件时不把提醒事项已经响过的再补响一次
  mirror?.setVault(v)
  reminders = new Reminders(v, DEVICE, {
    // 抄了好几遍的同一条只响显示的那一份
    tasks: () => vault?.snapshot().tasks.filter((t) => !t.dupOf) ?? [],
    noteTitle: (p) => p.replace(/^.*\//, '').replace(/\.md$/i, ''),
    lang,
    now,
    tick: async (t) => {
      const r = await applyEdit(v, { path: t.path, line: t.line, raw: t.raw, edit: { op: 'done', done: true } }, today())
      if (!r.ok) broadcast('ct:say', tr(lang(), 'gone'))
    },
    open: (t) => showMain({ key: t.key }),
    openNote: (t) => void openNote(t.path, t.line).catch((e) => console.error('打不开笔记', e)),
    say: (text) => broadcast('ct:say', text),
    wrote: (paths, msg) => committer?.add(paths, msg),
    remindAll: () => settings.read().remindAll,
  })
  await reminders.start()
  await focus?.load()
  if (!process.env.CT_VAULT) settings.set({ lastVault: root })
  void mc?.check()
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
    look: lookOf(s),
    themes: themes.list(),
    clockOffset: clockOffset(),
    device: DEVICE,
    // 开发时 Electron 找不到包里的 package.json，app.getVersion() 是 Electron 自己的版本：直接用 package.json 的
    version: PKG.version,
    e2e: E2E,
  }
}

// ---------- 窗口 ----------

function load(w: BrowserWindow, page: 'index' | 'tray' | 'quick') {
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${page}.html`)
  else void w.loadFile(join(__dirname, `../renderer/${page}.html`))
}

/** 红绿灯：标题栏 40 高（A、B 一样，同画布笔记），垂直居中、左边 16 */
function lights(frame: 'a' | 'b') {
  win?.setWindowButtonPosition({ x: 16, y: 14 })
}

function createWindow() {
  const look = lookOf(settings.read())
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

const menuBar = new MenuBar({
  preload: preload(),
  load,
  showMain: () => showMain(),
  lang: () => (settings ? lang() : 'zh'),
  bg: () => winColor(),
  update: () => updater?.status() ?? null,
  installUpdate: () => void installUpdate(),
  quick: () => {
    menuBar.hide()
    void quick.show()
  },
  quickKey: () => (quick.registered ? quick.wanted : null),
})

/** 全局快速加一条（main/quick.ts）：whenReady 里照设置注册那组键 */
const quick = new QuickPanel({
  preload: preload(),
  load,
  bg: () => winColor(),
  key: () => settings.read().quickKey,
  changed: () => broadcast('ct:quickState', { key: quick.wanted, registered: quick.registered }),
})

/**
 * 小框里回车：一条条写进库（没写 # 的进收件箱、不定日子），收起、焦点还给原来的软件，弹一条通知（点了在画布今日里打开，「撤销」一起撤掉）。
 * 写不进去时小框不收，说哪里不对
 */
async function quickAdd(items: QuickItem[], openIt: boolean): Promise<QuickAddResult> {
  const v = needVault()
  const l = lang()
  const d = today()
  const done: { undo: string; key: string; title: string; path: string; date: string | null; time: string | null }[] = []
  // 几条一次提交
  const failed = await committer!.batch(async () => {
    for (const it of items) {
      const r = await addTask(v, it.text, 'inbox', d, v.snapshot(), it.when, localNowOf(now()), it.dest)
      if (!r.ok) {
        if (r.reason === 'empty') continue
        for (const x of [...done].reverse()) await v.undo(x.undo)
        return r.message ?? ''
      }
      done.push({ undo: r.undo, key: `${r.path}#${r.line}`, title: r.title, path: r.path, date: r.date, time: r.time })
    }
    return null
  })
  if (failed !== null) return { ok: false, message: tr(l, 'failed', failed) }
  if (!done.length) return { ok: false, message: tr(l, 'qEmpty') }
  quick.hide(true)
  const first = done[0]!
  const one = done.length === 1
  const where = new Set(done.map((x) => x.path)).size === 1 ? tr(l, 'qInto', pathTitle(first.path)) : tr(l, 'qIntoMany')
  notifier().show(
    {
      title: one ? tr(l, 'qAdded', first.title) : tr(l, 'qAddedN', done.length),
      body: one && first.date ? `${where} · ${whenLabel(l, first, d)}` : where,
      actions: [tr(l, 'undo')],
      key: first.key,
      due: '',
      at: localStamp(now()),
    },
    // 通知上唯一的按钮是「撤销」（第 0 个按钮，notifier 记成 done）；点通知本身在画布今日里打开那一条
    (a) => {
      if (a === 'click') showMain({ key: first.key })
      else if (a === 'done')
        void (async () => {
          for (const x of [...done].reverse()) await v.undo(x.undo)
          broadcast('ct:say', one ? tr(l, 'qUndone', first.title) : tr(l, 'qUndoneN', done.length))
        })()
    },
  )
  if (openIt) showMain({ key: first.key })
  return { ok: true, n: done.length }
}

// ---------- 界面问的 ----------

/** 界面交来的专注动作：一项项查 */
function focusOp(x: unknown): FocusOp {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const key = o.key === null || typeof o.key === 'string' ? (o.key as string | null) : undefined
  if (o.op === 'start') return o.key === undefined ? { op: 'start' } : key !== undefined ? { op: 'start', key } : bad()
  if (o.op === 'pause' || o.op === 'stop') return { op: o.op }
  if (o.op === 'task' && key !== undefined) return { op: 'task', key }
  return bad()
}
const bad = (): never => {
  throw new Error('专注的参数不对')
}

const focusTaskOf = (t: TaskView): FocusTask => ({ key: t.key, id: t.id, path: t.path, line: t.line, raw: t.raw, title: t.title })

/** 番茄钟：满了记进库里、弹通知、界面说一句 */
function setupFocus() {
  focus = new FocusTimer({
    vault: () => vault,
    device: DEVICE,
    now,
    find: (t) => {
      const x = vault ? findAgain(t, vault.snapshot().tasks) : null
      return x ? focusTaskOf(x) : null
    },
    ensureId: async (t) => {
      if (!vault) return null
      const r = await ensureTaskId(vault, t)
      return r ? { ...t, line: r.line, raw: r.raw, id: r.id } : null
    },
    done: (r, file) => {
      const l = lang()
      notifier().show({ title: tr(l, 'focusNotif'), body: tr(l, 'focusNotifBody', r.title), actions: [], key: r.id ?? '', due: r.end, at: r.end }, () => showMain())
      broadcast('ct:notice', { msg: tr(l, 'focusDone', r.title), sub: tr(l, 'focusDoneSub', file) })
    },
    emit: (info) => broadcast('ct:focus', info),
  })
}

/** 界面交来的习惯改动：一项项查 */
function habitOp(x: unknown): HabitOp {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const str = (k: string) => {
    if (typeof o[k] !== 'string') throw new Error('习惯的参数不对')
    return o[k] as string
  }
  if (o.op === 'check') {
    if (typeof o.on !== 'boolean' || !/^\d{4}-\d{2}-\d{2}$/.test(str('date'))) throw new Error('习惯的参数不对')
    return { op: 'check', path: str('path'), date: str('date'), on: o.on }
  }
  if (o.op === 'new') return { op: 'new', name: str('name'), rule: str('rule') }
  if (o.op === 'rule') return { op: 'rule', path: str('path'), rule: str('rule') }
  if (o.op === 'delete') return { op: 'delete', path: str('path') }
  throw new Error('习惯的参数不对')
}

function needVault(): TaskVault {
  if (!vault) throw new Error('还没有打开库')
  return vault
}

function registerIpc() {
  ipcMain.handle('ct:state', () => state())
  ipcMain.handle('ct:ready', () => {
    rendererReady = true
    for (const u of pendingUrls.splice(0)) handleUrl(u)
    // 那组键被别的软件占了：打开时说一次（设置 › 一般 和菜单栏小窗里一直写着）
    if (!quick.registered && !quickTakenSaid) {
      quickTakenSaid = true
      win?.webContents.send('ct:notice', { msg: tr(lang(), 'qTakenNotice', quick.wanted), sub: tr(lang(), 'qTakenNoticeSub'), bg: true })
    }
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
  ipcMain.handle('ct:add', (_e, text: unknown, ctx: AddCtx, when: unknown) => {
    if (typeof text !== 'string') throw new Error('加一条的参数不对')
    const v = needVault()
    return addTask(v, text, ctx, today(), v.snapshot(), when, localNowOf(now()))
  })
  // 写时间问 AI（task-pd289）：「小活」那一家，Claude Code 用 Haiku，只送这一句；工作目录是自己设置目录里单独一格
  ipcMain.handle('ct:whenAi', (_e, text: unknown, now: unknown) => {
    if (typeof text !== 'string' || typeof now !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(now)) return null
    const cwd = join(app.getPath('userData'), 'ai-when')
    mkdirSync(cwd, { recursive: true })
    return aiWhen(aiPick(notesDir), text, now, cwd)
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
      return { ok: true, by: await openNote(path, typeof line === 'number' ? line : undefined) }
    } catch (e) {
      console.error('打不开画布笔记', e)
      return { ok: false }
    }
  })
  // ---------- MeetCaption 联动（main/mc.ts） ----------
  ipcMain.handle('ct:mcState', () => mc!.state())
  ipcMain.handle('ct:mcStart', (_e, key: unknown) => {
    if (typeof key !== 'string') throw new Error('哪一节课不对')
    return mc!.startKey(key)
  })
  ipcMain.handle('ct:mcOpenLive', () => mc!.openLive())
  ipcMain.handle('ct:mcJump', async (_e, key: unknown) => {
    if (typeof key !== 'string') throw new Error('哪一条不对')
    const t = needVault()
      .snapshot()
      .tasks.find((x) => x.key === key)
    if (!t) return { ok: false }
    try {
      return { ok: true, by: await mc!.jump(t) }
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
    if (s.lang !== before.lang) {
      appMenu(s.lang, menuHandlers)
      menuBar.relabel()
    }
    if (s.tray !== before.tray) menuBar.set(s.tray)
    if (s.plan.tray !== before.plan.tray || s.lang !== before.lang) trayTitle()
    if (s.quickKey !== before.quickKey) quick.applyKey()
    // 提醒所有带钟点的待办：重排本机通知、重新镜像（关了的那批从提醒事项拿掉）
    if (s.remindAll !== before.remindAll) {
      reminders?.soon()
      void mirror?.sync()
    }
    if (s.mcLead !== before.mcLead) void mc?.check()
    return pushLook(s)
  })
  // 导入 VS Code 主题（同画布笔记 themes:import）：存进和画布笔记同一个文件夹，导进来就用上（跟系统时按浅深换白天或夜里那套）
  ipcMain.handle('ct:importTheme', async (): Promise<{ added: { id: string; name: string }[]; state: LookState } | null> => {
    const l = lang()
    const r = await dialog.showOpenDialog(win!, {
      title: tr(l, 'themeDlgTitle'),
      buttonLabel: tr(l, 'themeDlgBtn'),
      properties: ['openFile'],
      filters: [{ name: tr(l, 'themeDlgFilter'), extensions: ['json', 'vsix'] }],
    })
    if (r.canceled || !r.filePaths[0]) return null
    const added = themes.import(r.filePaths[0])
    const a = settings.read().appearance
    const first = themeInfo(added[0]!)
    const appearance = !a.followSystem ? { ...a, skin: first.id } : first.tone === 'light' ? { ...a, day: first.id } : { ...a, night: first.id }
    return { added: added.map((t) => ({ id: t.id, name: t.name })), state: pushLook(settings.set({ appearance })) }
  })
  ipcMain.handle('ct:removeTheme', (_e, id: unknown): LookState => {
    if (typeof id !== 'string') throw new Error('主题 id 不对')
    themes.remove(id)
    return pushLook(settings.read())
  })
  ipcMain.handle('ct:taskMenu', async (e, key: unknown, l: Lang) => {
    const t = needVault()
      .snapshot()
      .tasks.find((x) => x.key === key)
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!t || !w) return null
    return taskMenu(w, t, today(), l === 'en' ? 'en' : 'zh')
  })
  ipcMain.handle('ct:habit', (_e, op: unknown) => habitEdit(needVault(), habitOp(op), today()))
  ipcMain.handle('ct:habitMenu', async (e, path: unknown, l: Lang) => {
    const h = needVault()
      .snapshot()
      .habits.find((x) => x.path === path)
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!h || !w) return null
    return habitMenu(w, h, l === 'en' ? 'en' : 'zh')
  })
  // ---------- AI：拆成小步、排进空着的时间（先给看，收下才写） ----------
  const jobs = new Map<string, AbortController>()
  const job = (id: unknown) => {
    if (typeof id !== 'string' || !id) throw new Error('AI 的参数不对')
    const ac = new AbortController()
    jobs.get(id)?.abort()
    jobs.set(id, ac)
    return { ac, done: () => jobs.get(id) === ac && jobs.delete(id) }
  }
  // 要的那把 Key 画布今日还没有：界面问「用画布笔记那把？」（borrow 是哪一家）
  const failText = (e: unknown) => ({ ok: false as const, message: String((e as Error)?.message ?? e), ...((e as Error)?.name === 'AbortError' ? { aborted: true } : {}), ...(e instanceof BorrowNeeded ? { borrow: e.engine } : {}) })
  initKeys(app.getPath('userData'), notesDir)
  ipcMain.handle('ct:aiInfo', () => {
    const p = aiPick(notesDir)
    const borrow = needBorrow(p.engine)
    return { ...aiLabel(p), ...(borrow ? { borrow } : {}) }
  })
  // Key 借用（task-587os）：同意后从画布笔记那份解出来，存一份到画布今日自己的钥匙串项
  ipcMain.handle('ct:aiBorrow', async (_e, id: unknown) => {
    if (!isApi(id)) throw new Error('AI 的参数不对')
    try {
      await borrowFromNotes(id)
      return { ok: true }
    } catch (e) {
      return { ok: false, message: String((e as Error)?.message ?? e) }
    }
  })
  // 设置 › AI：每一家画布今日有没有自己的一份、画布笔记有没有
  ipcMain.handle('ct:aiKeys', () => API_IDS.map((id) => ({ id, tail: todayKeyTail(id) ?? null, notes: notesHasKey(id) })))
  ipcMain.handle('ct:aiKeyDrop', (_e, id: unknown) => {
    if (!isApi(id)) throw new Error('AI 的参数不对')
    dropTodayKey(id)
  })
  ipcMain.handle('ct:aiCancel', (_e, id: unknown) => void (typeof id === 'string' && jobs.get(id)?.abort()))
  ipcMain.handle('ct:aiSplit', async (_e, key: unknown, id: unknown) => {
    const v = needVault()
    const s = v.snapshot()
    const t = s.tasks.find((x) => x.key === key)
    if (!t) return { ok: false, message: tr(lang(), 'gone') }
    const text = (await v.current(t.path))?.text ?? ''
    const lines = splitLines(text)
    const around = lines.slice(Math.max(0, t.line - 6), t.line + 7).map((_, i) => lineAt(text, Math.max(0, t.line - 6) + i) ?? '').join('\n')
    const subs = t.subs.map((k) => s.tasks.find((x) => x.key === k)?.title).filter((x): x is string => !!x)
    const j = job(id)
    try {
      return { ok: true, steps: await aiSplit(aiPick(notesDir), { title: t.title, date: t.date, path: t.path, heading: t.heading, subs, around }, v.root, j.ac.signal) }
    } catch (e) {
      return failText(e)
    } finally {
      j.done()
    }
  })
  ipcMain.handle('ct:aiSplitAccept', (_e, key: unknown, steps: unknown) => {
    if (!Array.isArray(steps) || !steps.every((x) => typeof x === 'string')) throw new Error('AI 的参数不对')
    const v = needVault()
    const t = v.snapshot().tasks.find((x) => x.key === key)
    if (!t) return { ok: false, reason: 'gone' }
    return addSubtasks(v, t, steps as string[])
  })
  ipcMain.handle('ct:aiSchedule', async (_e, id: unknown) => {
    const v = needVault()
    const d = today()
    const tom = isoPlus(d, 1)
    const nowT = localStamp(now()).slice(11, 16)
    const tasks = v.snapshot().tasks
    const cands: SchedCandidate[] = tasks.filter((t) => open(t) && listed(t) && !t.time && (t.date === d || t.date === tom)).map((t) => ({ key: t.key, title: t.title, date: t.date!, prio: t.prio }))
    const busy: Busy[] = tasks
      .filter((t) => !t.done && !t.cancelled && t.time && (t.date === d || t.date === tom))
      .map((t) => ({ date: t.date!, from: minutesOf(t.time!), to: Math.min(1440, minutesOf(t.time!) + 60), title: t.title }))
    const evs = await calendar!.events(d, tom)
    for (const e of evs) {
      if (e.allDay) continue
      for (const day of [d, tom]) {
        const sd = e.start.slice(0, 10)
        const ed = e.end.slice(0, 10)
        if (day < sd || day > ed) continue
        busy.push({ date: day, from: day === sd ? minutesOf(e.start.slice(11, 16)) : 0, to: day === ed ? minutesOf(e.end.slice(11, 16)) : 1440, title: e.title })
      }
    }
    const j = job(id)
    try {
      const slots = await aiSchedule(aiPick(notesDir), { date: d, time: nowT }, cands, busy, v.root, j.ac.signal)
      const byKey = new Map(cands.map((c) => [c.key, c.title]))
      return { ok: true, slots: slots.map((x) => ({ ...x, title: byKey.get(x.key) ?? '' })), candidates: cands.length, events: evs.filter((e) => !e.allDay).length }
    } catch (e) {
      return failText(e)
    } finally {
      j.done()
    }
  })
  ipcMain.handle('ct:aiScheduleAccept', (_e, slots: unknown) => {
    if (!Array.isArray(slots)) throw new Error('AI 的参数不对')
    const v = needVault()
    const tasks = v.snapshot().tasks
    const items = (slots as AiSlot[]).flatMap((x) => {
      const t = tasks.find((y) => y.key === x?.key)
      return t && typeof x.time === 'string' && /^\d{2}:\d{2}$/.test(x.time) ? [{ path: t.path, line: t.line, raw: t.raw, title: t.title, time: x.time }] : []
    })
    return setTimes(v, items, today())
  })

  // ---------- 右栏 AI 对话（task-ykkoz，main/ai-chat.ts） ----------
  const chats = new TodayChats(notesDir, app.getPath('userData'))
  app.on('will-quit', () => chats.dispose())
  const chatId = (id: unknown) => {
    if (typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)) throw new Error('对话的参数不对')
    return id
  }
  /** AI 这一问看得到的：近两周的待办、收件箱里没定日子的、系统日历两周的日程（藏起的日历 events() 已经去掉） */
  const chatCtx = async (): Promise<ChatCtx> => {
    const v = needVault()
    const d = today()
    const end = isoPlus(d, 13)
    const all = v.snapshot().tasks
    const tasks: CtxTask[] = pickTasks(all, d, INBOX_NOTE).map((t, i) => ({
      id: `t${i + 1}`,
      key: t.key,
      title: t.title,
      path: t.path,
      line: t.line,
      raw: t.raw,
      date: t.date,
      time: t.time,
      prio: t.prio,
      subs: t.subs.map((k) => all.find((x) => x.key === k)?.title).filter((x): x is string => !!x),
      child: t.parent !== null,
    }))
    const events: CtxEvent[] = []
    if (calendar?.state().active)
      for (const e of await calendar.events(d, end)) {
        const sd = e.start.slice(0, 10)
        const ed = e.end.slice(0, 10)
        for (let day = sd < d ? d : sd; day <= ed && day <= end; day = isoPlus(day, 1)) {
          if (e.allDay) events.push({ title: e.title, date: day })
          else events.push({ title: e.title, date: day, from: day === sd ? minutesOf(e.start.slice(11, 16)) : 0, to: day === ed ? minutesOf(e.end.slice(11, 16)) : 1440 })
        }
      }
    return { now: { date: d, time: localStamp(now()).slice(11, 16) }, tasks, events }
  }
  const seenOf = (c: ChatCtx) => ({
    tasks: c.tasks.filter((t) => t.date).length,
    inbox: c.tasks.filter((t) => !t.date).length,
    events: c.events.length,
    // 先说有钟点的（组会、ecp 课），全天的排后面
    eventNames: [...new Set([...c.events.filter((e) => e.from !== undefined), ...c.events.filter((e) => e.from === undefined)].map((e) => e.title))].slice(0, 3),
  })
  ipcMain.handle('ct:chatInfo', async (_e, id: unknown) => {
    const v = needVault()
    const p = chats.pickFor(v.root, chatId(id))
    const c = await chatCtx()
    return { engines: chats.engineList(), pick: p.pick, own: p.own, label: p.label, seen: { ...seenOf(c), cal: !!calendar?.state().active } }
  })
  ipcMain.handle('ct:chatDefault', () => {
    const p = chats.defaultPick()
    return { engine: p.engine, label: ENGINE_LABEL[p.engine], full: pickLabel(p, chats.modelsOf(p.engine)) }
  })
  ipcMain.handle('ct:chatList', () => chats.list(needVault().root))
  ipcMain.handle('ct:chatLoad', (_e, id: unknown) => chats.load(needVault().root, chatId(id)))
  ipcMain.handle('ct:chatPick', (_e, id: unknown, pick: unknown) => {
    const v = needVault()
    chats.setPick(v.root, chatId(id), pick)
    return chats.pickFor(v.root, chatId(id))
  })
  ipcMain.handle('ct:chatAsk', async (_e, id: unknown, text: unknown, jobId: unknown) => {
    const cid = chatId(id)
    if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw new Error('对话的参数不对')
    const v = needVault()
    const { msgs } = chats.load(v.root, cid)
    const before = msgs.slice()
    const nextId = () => (msgs.length ? Math.max(...msgs.map((m) => m.id)) + 1 : 1)
    msgs.push({ id: nextId(), role: 'user', time: now(), text: text.trim() })
    const title = before.length ? undefined : chatTitle(text)
    chats.save(v.root, cid, msgs, title)
    const { pick, label } = chats.pickFor(v.root, cid)
    const j = job(jobId)
    try {
      const c = await chatCtx()
      const r = await chats.ask(pick, c, before, text.trim(), join(app.getPath('userData'), 'ai-chat'), j.ac.signal)
      const plan: ChatPlan | undefined = r.changes.length || r.dropped.length ? { changes: r.changes, dropped: r.dropped, ...(r.keep ? { keep: r.keep } : {}), state: r.changes.length ? 'open' : 'dropped' } : undefined
      msgs.push({ id: nextId(), role: 'ai', time: now(), text: r.say, engine: pick.engine, by: label, seen: seenOf(c), ...(plan ? { plan } : {}), ...(r.keep && !plan ? { text: `${r.say}\n${r.keep}` } : {}) })
      chats.save(v.root, cid, msgs)
      return { ok: true, msgs }
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError'
      if (!aborted) {
        msgs.push({ id: nextId(), role: 'ai', time: now(), text: '', engine: pick.engine, by: label, error: String((e as Error)?.message ?? e) })
        chats.save(v.root, cid, msgs)
      }
      return { ok: false, aborted, msgs }
    } finally {
      j.done()
    }
  })
  /** 改动卡：收下（on 是勾着的那几条）/ 不要 / 撤销了 */
  const setPlan = (v: TaskVault, cid: string, msgId: unknown, f: (p: ChatPlan) => ChatPlan) => {
    const { msgs } = chats.load(v.root, cid)
    const m = msgs.find((x) => x.id === msgId)
    if (!m?.plan) throw new Error('这张改动卡找不到了')
    m.plan = f(m.plan)
    chats.save(v.root, cid, msgs)
    return msgs
  }
  ipcMain.handle('ct:chatAccept', async (_e, id: unknown, msgId: unknown, on: unknown) => {
    const cid = chatId(id)
    if (!Array.isArray(on) || !on.every((x) => typeof x === 'number')) throw new Error('对话的参数不对')
    const v = needVault()
    const { msgs, title } = chats.load(v.root, cid)
    const m: TodayMsg | undefined = msgs.find((x) => x.id === msgId)
    if (!m?.plan || m.plan.state !== 'open') throw new Error('这张改动卡找不到了')
    const picked = m.plan.changes.filter((_, i) => (on as number[]).includes(i))
    if (!picked.length) return { ok: false, reason: 'failed', message: '一条都没勾' }
    const r = await applyPlan(v, picked, title || '画布今日的 AI 对话', today())
    if (!r.ok) return r
    return { ...r, msgs: setPlan(v, cid, msgId, (p) => ({ ...p, state: 'took', on: on as number[], undo: r.undo, n: r.n })) }
  })
  ipcMain.handle('ct:chatPlanState', (_e, id: unknown, msgId: unknown, st: unknown) => {
    if (st !== 'dropped' && st !== 'undone') throw new Error('对话的参数不对')
    return setPlan(needVault(), chatId(id), msgId, (p) => ({ ...p, state: st }))
  })

  ipcMain.handle('ct:focusInfo', () => focus!.info())
  ipcMain.handle('ct:focus', (_e, op: unknown) => {
    const o = focusOp(op)
    const byKey = (k: string | null | undefined) => {
      if (!k) return null
      const t = needVault()
        .snapshot()
        .tasks.find((x) => x.key === k)
      if (!t) throw new Error('这一条找不到了')
      return focusTaskOf(t)
    }
    if (o.op === 'start') focus!.start(o.key === undefined ? undefined : byKey(o.key))
    else if (o.op === 'pause') focus!.pause()
    else if (o.op === 'stop') focus!.stop()
    else focus!.setTask(byKey(o.key))
    return focus!.info()
  })
  ipcMain.handle('ct:showMain', (_e, sel?: { key: string }) => showMain(sel))
  // ---------- 全局快速加一条（main/quick.ts） ----------
  ipcMain.handle('ct:quickShow', () => {
    menuBar.hide()
    return quick.show()
  })
  ipcMain.handle('ct:quickClose', () => quick.hide(true))
  ipcMain.handle('ct:quickState', () => ({ key: quick.wanted, registered: quick.registered }))
  ipcMain.handle('ct:openSettings', () => openSettings())
  ipcMain.handle('ct:quickAdd', (_e, items: unknown, openIt: unknown) => {
    if (!Array.isArray(items) || !items.length || items.length > 50) throw new Error('快速加一条的参数不对')
    const ok = items.every((x) => x && typeof x === 'object' && typeof x.text === 'string' && (x.dest === null || typeof x.dest === 'string'))
    if (!ok) throw new Error('快速加一条的参数不对')
    return quickAdd(
      (items as QuickItem[]).map((x) => ({ text: x.text, dest: x.dest, when: x.when ?? null })),
      openIt === true,
    )
  })
  // 小窗、小框量好自己多高
  ipcMain.handle('ct:fit', (e, h: unknown) => {
    if (typeof h !== 'number' || !Number.isFinite(h)) return
    if (e.sender.id === quick.webContentsId) quick.fit(h)
    else if (e.sender.id === menuBar.webContentsId) menuBar.fit(h)
  })
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

  // ---------- 提醒事项 ----------
  const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
  const importOpts = (o: unknown) => {
    const x = o as { lists?: unknown; completed?: unknown }
    if (!x || !strs(x.lists) || typeof x.completed !== 'boolean') throw new Error('导入的参数不对')
    return { lists: x.lists, completed: x.completed }
  }
  ipcMain.handle('ct:remState', () => mirror!.state())
  ipcMain.handle('ct:remConnect', () => mirror!.connect())
  ipcMain.handle('ct:remDisconnect', () => mirror!.disconnect())
  ipcMain.handle('ct:remSetMirror', (_e, on: unknown) => {
    if (typeof on !== 'boolean') throw new Error('镜像开关的参数不对')
    return mirror!.setMirror(on)
  })
  ipcMain.handle('ct:remSetList', (_e, title: unknown) => {
    if (typeof title !== 'string') throw new Error('列表名字不对')
    return mirror!.setList(title)
  })
  ipcMain.handle('ct:remLists', () => mirror!.lists())
  ipcMain.handle('ct:remPreview', (_e, o: unknown) => mirror!.preview(importOpts(o)))
  ipcMain.handle('ct:remImport', (_e, o: unknown) => mirror!.import(importOpts(o)))
  ipcMain.handle('ct:remDeleteOriginals', (_e, rids: unknown) => {
    if (!strs(rids)) throw new Error('要删的参数不对')
    return mirror!.deleteOriginals(rids)
  })
  ipcMain.handle('ct:remDismissBanner', () => mirror!.dismissBanner())
  ipcMain.handle('ct:remOpenPrivacy', () => mirror!.openPrivacy())
  ipcMain.handle('ct:remOpenICloud', () => mirror!.openICloud())

  // ---------- 系统日历（只读） ----------
  const day = (v: unknown) => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('日子的参数不对')
    return v
  }
  ipcMain.handle('ct:calState', () => calendar!.state())
  ipcMain.handle('ct:calConnect', (_e, andReminders: unknown) => calendar!.connect(andReminders === true))
  ipcMain.handle('ct:calShow', (_e, on: unknown) => {
    if (typeof on !== 'boolean') throw new Error('日历开关的参数不对')
    return calendar!.setShow(on)
  })
  ipcMain.handle('ct:calEvents', (_e, from: unknown, to: unknown) => calendar!.events(day(from), day(to)))
  ipcMain.handle('ct:calOpenPrivacy', () => calendar!.openPrivacy())
  ipcMain.handle('ct:openCalendarApp', async () => {
    const err = await shell.openPath('/System/Applications/Calendar.app')
    if (err) throw new Error(err)
  })
  ipcMain.handle('ct:calHide', (_e, id: unknown, hide: unknown) => {
    if (typeof id !== 'string' || typeof hide !== 'boolean') throw new Error('日历的参数不对')
    return calendar!.setHidden(id, hide)
  })
  ipcMain.handle('ct:calMenu', async (e, id: unknown) => {
    const st = calendar!.state()
    const c = st.calendars.find((x) => x.id === id)
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!c || !w) return st
    const pick = await calMenu(w, c.hidden, st.calendars.some((x) => x.hidden), lang())
    if (pick === 'showAll') return calendar!.showAll()
    if (pick) return calendar!.setHidden(c.id, pick === 'hide')
    return calendar!.state()
  })
}

/** 界面交来的「排过了 / 收工了」：一项项查 */
function planPatch(x: unknown): { morning?: 'done' | 'skipped' | null; closed?: string | null } {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const out: { morning?: 'done' | 'skipped' | null; closed?: string | null } = {}
  if ('morning' in o) {
    if (o.morning !== null && o.morning !== 'done' && o.morning !== 'skipped') throw new Error('排一天的参数不对')
    out.morning = o.morning as 'done' | 'skipped' | null
  }
  if ('closed' in o) {
    if (o.closed !== null && typeof o.closed !== 'string') throw new Error('排一天的参数不对')
    out.closed = o.closed as string | null
  }
  return out
}

/** 界面交来的收工那几条：一项项查 */
function closeItems(x: unknown): CloseItem[] {
  if (!Array.isArray(x) || x.length > 500) throw new Error('收工的参数不对')
  return x.map((y) => {
    const o = (y && typeof y === 'object' ? y : {}) as Record<string, unknown>
    if (typeof o.title !== 'string' || typeof o.note !== 'string' || !['done', 'moved', 'dropped', 'left'].includes(o.how as string)) throw new Error('收工的参数不对')
    if (o.how === 'moved' && (typeof o.to !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.to))) throw new Error('收工的参数不对')
    return { title: o.title.replace(/[\r\n]+/g, ' '), note: o.note.replace(/[\r\n\[\]|]+/g, ' '), how: o.how as CloseItem['how'], ...(o.how === 'moved' ? { to: o.to as string } : {}) }
  })
}

function registerPlanIpc() {
  ipcMain.handle('ct:planState', () => planDay!.read(today()))
  ipcMain.handle('ct:planMark', (_e, p: unknown) => planDay!.mark(today(), planPatch(p)))
  ipcMain.handle('ct:journal', () => journalOf(needVault(), settings.read().plan.journal, lang(), today()))
  ipcMain.handle('ct:planClose', async (_e, o: unknown) => {
    const r = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>
    const f = (r.focus && typeof r.focus === 'object' ? r.focus : {}) as Record<string, unknown>
    if (typeof r.time !== 'string' || !/^\d{2}:\d{2}$/.test(r.time) || typeof f.n !== 'number' || typeof f.minutes !== 'number') throw new Error('收工的参数不对')
    const v = needVault()
    const res = await writeClose(v, { place: journalOf(v, settings.read().plan.journal, lang(), today()), today: today(), lang: lang(), time: r.time, items: closeItems(r.items), focus: { n: f.n, minutes: f.minutes } })
    if (res.ok) planDay!.mark(today(), { closed: res.path })
    return res
  })
}

/** 提醒事项小助手和镜像：测试模式里小助手一律带 --memory（假提醒事项），globalThis.ctRem 让测试像人一样在提醒事项里改 */
function setupMirror() {
  const helper = new RemHelper(helperCommand(process.env, { e2e: E2E, packaged: app.isPackaged, execPath: process.execPath, here: __dirname }))
  calendar = new CalendarLink(helper, {
    settings: () => settings.read(),
    save: (calendar) => void settings.set({ calendar }),
    lang,
    state: (s) => {
      broadcast('ct:cal', s)
      void mc?.check()
    },
    changed: () => {
      broadcast('ct:calChanged')
      void mc?.check()
    },
    notice: (n) => broadcast('ct:notice', n),
    openExternal: (url) => shell.openExternal(url),
    // 和画布笔记共用：放在画布笔记的设置目录里（测试模式没指定画布笔记的设置目录时放在自己的里面，同导入的主题）
    hiddenFile: calPrefsPath(notesDir, app.getPath('userData')),
    connectReminders: async () => {
      const r = mirror!.state()
      if (r.connected) return null
      const s = await mirror!.connect(true)
      return s.connected && s.active ? { mirrored: s.mirrored, list: s.list?.title ?? '' } : null
    },
  })
  mirror = new RemMirror(helper, join(app.getPath('userData'), 'reminders-mirror.json'), {
    settings: () => settings.read(),
    saveRem: (p) => void settings.set({ reminders: { ...settings.read().reminders, ...p } }),
    lang,
    today,
    mirroredChanged: pushSnapshot,
    notice: (n) => broadcast('ct:notice', n),
    state: (s) => broadcast('ct:rem', s),
    openExternal: (url) => shell.openExternal(url),
    flush: () => committer?.flush() ?? Promise.resolve(),
  })
  if (E2E && helper.memory)
    (globalThis as unknown as { ctRem: unknown }).ctRem = {
      external: (p: Record<string, unknown>) => helper.request('test.external', p),
      set: (p: Record<string, unknown>) => helper.request('test.set', p),
      dump: () => helper.request('test.dump'),
    }
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
  mirror?.stop()
  await Promise.race([committer?.flush(), new Promise((r) => setTimeout(r, 5000))]).catch((e) => console.error('更新前提交失败', e))
  vault?.close()
  quitting = true
  return updater.install()
}

/** 打开主窗口的设置（新建的窗口等页面载好再翻过去） */
function openSettings() {
  const fresh = !win
  showMain()
  if (fresh) win!.webContents.once('did-finish-load', () => setTimeout(() => menuHandlers.settings(), 300))
  else menuHandlers.settings()
}

/** 软件菜单「检查更新…」：打开主窗口的设置（状态在「版本和更新」那一行），立刻查一次 */
function checkFromMenu() {
  openSettings()
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
  settings = new SettingsFile(join(app.getPath('userData'), 'settings.json'), sysLang(), userSkins)
  if (E2E) app.dock?.hide()
  else if (!app.isPackaged) app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  if (app.isPackaged && !E2E) app.setAsDefaultProtocolClient(BRAND.scheme)
  planDay = new PlanDayFile(join(app.getPath('userData'), 'plan-day.json'))
  registerIpc()
  registerPlanIpc()
  family = registerFamily({
    vault: () => vault,
    // 联动.json 不是 md，库的监视不报它：底栏的「未提交」重数一次
    send: (ch, ...a) => (ch === 'files:changed' ? refreshGit() : (broadcast(ch, ...a), ch === 'family:links' && pushSnapshot())),
    fetchOn: () => settings.read().familyFetch,
    // 测试模式：装了哪些读 CT_FAMILY_INSTALLED_FILE（和画布笔记一样的 CN_FAMILY_INSTALLED_FILE 也认），名单只从 CT_FAMILY_URL 读
    test: E2E ? { installedFile: process.env.CT_FAMILY_INSTALLED_FILE ?? process.env.CN_FAMILY_INSTALLED_FILE, url: process.env.CT_FAMILY_URL } : null,
  })
  TaskVault.mcTodosOn = () => family?.linkOn('mc-todo') ?? true
  setupMirror()
  setupFocus()
  mc = new McLink({
    root: () => vault?.root ?? null,
    now,
    lang,
    lead: () => settings.read().mcLead,
    installed: async () => !!(await family!.installed()).meetcaption,
    events: (from, to) => calendar?.events(from, to) ?? Promise.resolve([]),
    push: (s) => broadcast('ct:mc', s),
    showMain: () => showMain(),
    openPlain: async (p) => {
      const err = await shell.openPath(needVault().abs(p))
      if (err) throw new Error(err)
    },
    cnOpenOn: () => family?.linkOn('cn-open') !== false,
    say: (text) => broadcast('ct:say', text),
  })
  appMenu(lang(), menuHandlers)
  updaterReady = setupUpdater()
  const dir = vaultDir()
  if (dir) await openVault(dir)
  createWindow()
  void calendar?.refresh()
  mc.start()
  void warmUp()
  menuBar.set(settings.read().tray)
  if (vault) menuBar.setCount(cntToday(vault.snapshot().tasks, today()))
  quick.applyKey()
  // 小框先建好、页面载好：第一次按键时马上出来（测试里第一次按时才建，不多一个窗口）
  if (!E2E) setTimeout(() => quick.warm(), 3000)
  // 跨了午夜、测试拨了钟：图标旁边的数重算
  setInterval(() => vault && menuBar.setCount(cntToday(vault.snapshot().tasks, today())), 60_000)
  trayTitle()
  // 菜单栏那一行「还剩几分钟」每半分钟跟一次
  setInterval(trayTitle, 30_000)
  onClock((off) => {
    broadcast('ct:clock', off)
    if (vault) menuBar.setCount(cntToday(vault.snapshot().tasks, today()))
    reminders?.soon()
    void mc?.check()
    focus?.check()
    trayTitle()
  })
  watchNotesSettings(notesDir, () => {
    if (settings.read().followNotes) pushLook(settings.read())
  })
  // 画布笔记那边导入、删掉了主题：外观页的那一排、正在用的那套跟着换
  watchThemes(themesDir(notesDir, app.getPath('userData')), () => pushLook(settings.read()))
  nativeTheme.on('updated', () => win?.setBackgroundColor(winColor()))
  // 切回来时：画布笔记那边藏起 / 显示了哪个系统日历就跟上（平时看着那份文件，这是兜底）
  app.on('browser-window-focus', () => calendar?.recheck())
  app.on('activate', () => showMain())
})

// 关掉主窗口不退出：常驻菜单栏（关了菜单栏的照 macOS 习惯也留在程序坞里）
app.on('will-quit', () => quick.dispose())

app.on('window-all-closed', () => {
  if (quitting || E2E) app.quit()
})

app.on('before-quit', (e) => {
  if (quitting || !committer) return
  quitting = true
  e.preventDefault()
  reminders?.stop()
  mirror?.stop()
  mc?.stop()
  vault?.close()
  // 退出前把排着的提交掉，最多等 5 秒
  void Promise.race([committer.flush(), new Promise((r) => setTimeout(r, 5000))]).finally(() => app.quit())
})

