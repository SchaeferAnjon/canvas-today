/** 主进程和界面之间说的话（window.ct）。界面只拿到索引的样子，改文件一律交给主进程。 */
import type { CalEvent } from '@cn/calendar'
import type { EngineId } from '../../../notes/src/shared/agent'
import type { FocusRecord, Habit, Prio, RingBy } from '@cn/tasks'
import type { Lang } from './i18n'
import type { TodayAppearance, TodaySettings } from './settings'

/** 检查更新的状态：和画布笔记同一个 Updater（apps/notes/src/main/updater.ts），类型也用它的 */
export type { UpdateState } from '../../../notes/src/shared/api'
import type { UpdateState } from '../../../notes/src/shared/api'

/** 索引里的一条待办（库里某篇笔记的某一行） */
export interface TaskView {
  /** 这一份索引里认它的名字：笔记路径#行号（行号变了名字就变，界面按 findAgain 找回来） */
  key: string
  /** 🆔：有编号的才有 */
  id: string | null
  /** 提醒记录里认它的名字：有 🆔 用 🆔，没有用路径 + 标题 + 日子算的 */
  rkey: string
  path: string
  /** 第几行，从 0 数 */
  line: number
  /** 这一行原文（不带换行） */
  raw: string
  title: string
  done: boolean
  cancelled: boolean
  date: string | null
  time: string | null
  remind: string | null
  repeat: string | null
  prio: Prio
  doneDate: string | null
  /** 上一层待办的 key（子任务才有） */
  parent: string | null
  subs: string[]
  depth: number
  /** 上面最近的标题（「这周」）和它的级别 */
  heading: string | null
  headingLevel: number
  /** 那个标题在第几行（同名的两节分得开） */
  headingLine: number | null
  /** 谁来响：镜像进系统提醒事项了的由提醒事项响（main/mirror.ts），本机不排通知；别的是 app */
  ringBy: RingBy
}

export interface NoteView {
  path: string
  /** 文件名（画布笔记里标题就是文件名） */
  title: string
  /** 所在文件夹，用「 › 」连起来（课程 › ecp） */
  folder: string
  mtimeMs: number
}

/** 一个习惯（习惯/<名字>.md，@cn/tasks habit.ts） */
export interface HabitView extends Habit {
  /** 不是 UTF-8、换行不规整：只读，不打卡 */
  readOnly: boolean
}

export interface Snapshot {
  /** 每改一次加一 */
  version: number
  tasks: TaskView[]
  notes: NoteView[]
  habits: HabitView[]
}

export interface VaultInfo {
  path: string
  name: string
  branch: string
}

export interface GitInfo {
  /** 没提交的文件有几个（整个库，画布笔记那边改的也算） */
  changed: number
  branch: string
}

export interface AppState {
  vault: VaultInfo | null
  settings: TodaySettings
  /** 现在用的外观（跟画布笔记时是画布笔记的） */
  look: TodayAppearance
  /** 界面的钟比真的钟快多少毫秒（测试用 CT_NOW 拨钟） */
  clockOffset: number
  device: string
  version: string
  e2e: boolean
}

export type EditOp =
  | { op: 'done'; done: boolean }
  | { op: 'date'; date: string | null; time?: string | null }
  | { op: 'time'; time: string | null }
  | { op: 'remind'; remind: string | null }
  | { op: 'repeat'; repeat: string | null }
  | { op: 'prio'; prio: Prio }
  | { op: 'title'; title: string }
  | { op: 'addSub'; title: string }
  | { op: 'delete' }
  | { op: 'move'; to: string }

export interface EditReq {
  path: string
  line: number
  /** 界面看到的那一行原文：文件里这一行不是它了，就按原文去找（外面改过），找不到就不改 */
  raw: string
  edit: EditOp
}

export type EditResult =
  | {
      ok: true
      /** 撤销用 */
      undo: string
      path: string
      /** 改完这一条在第几行（从 0 数） */
      line: number
      /** 改完这一行的原文 */
      raw: string
      /** 重复的那条勾掉后，新加的下一条 */
      next?: { line: number; date: string }
      /** 挪进了哪篇 */
      movedTo?: string
    }
  | { ok: false; reason: 'gone' | 'readonly' | 'failed'; message?: string }

export type AddCtx = 'today' | 'tomorrow' | 'week' | 'inbox' | { note: string }

export type AddResult =
  | { ok: true; undo: string; path: string; line: number; raw: string; title: string; date: string | null; time: string | null; created: boolean }
  | { ok: false; reason: 'empty' | 'failed'; message?: string }

export type UndoResult = { ok: true } | { ok: false; reason: 'changed' | 'gone' | 'failed' }

/** 右键菜单里点了哪一项 */
export type MenuPick = { kind: 'date'; date: string } | { kind: 'focus' } | { kind: 'open' } | { kind: 'delete' } | { kind: 'copyLink' } | null

// ---------- 专注（番茄钟，main/focus.ts；记录 @cn/tasks focus.ts） ----------

/** 专注挂的那一条 */
export interface FocusTask {
  key: string
  id: string | null
  path: string
  line: number
  raw: string
  title: string
}

export interface FocusInfo {
  task: FocusTask | null
  running: boolean
  /** 还剩几毫秒（发出来那一刻） */
  left: number
  /** 走着的时候什么时候到点（软件的钟，毫秒）；停着是 null */
  endsAt: number | null
  /** 一个番茄多长（毫秒） */
  total: number
  /** 今天的记录（几台设备合起来，按开始的先后） */
  today: FocusRecord[]
  /** 每个 🆔 专注过几次（详情里的 🍅） */
  counts: Record<string, number>
  /** 这台设备这个月的记录文件 */
  file: string
}

/** 界面交来的：哪一条用索引里的 key 说（主进程照它找到那一条）；start 不给 key 是接着现在这一条 */
export type FocusOp = { op: 'start'; key?: string | null } | { op: 'pause' } | { op: 'stop' } | { op: 'task'; key: string | null }

// ---------- AI（main/ai.ts：拆成小步、排进空着的时间；用画布笔记设置里「小活」那一家） ----------

export interface AiInfo {
  engine: EngineId
  /** 「Claude Code」 */
  label: string
  /** 「Claude Code · Haiku」 */
  full: string
}

export type AiSplitResult = { ok: true; steps: string[] } | { ok: false; message: string; aborted?: boolean }

/** AI 排好的一条（虚线框）：哪一条、哪天几点、多长 */
export interface AiSlot {
  key: string
  title: string
  date: string
  time: string
  minutes: number
}

export type AiSchedResult = { ok: true; slots: AiSlot[]; candidates: number; events: number } | { ok: false; message: string; aborted?: boolean }

export type AiSchedAccept = { ok: true; undo: string; n: number } | { ok: false; reason: 'gone' | 'readonly' | 'failed'; message?: string }

// ---------- 习惯（习惯/<名字>.md，@cn/tasks habit.ts） ----------

export type HabitOp =
  | { op: 'check'; path: string; date: string; on: boolean }
  | { op: 'new'; name: string; rule: string }
  | { op: 'rule'; path: string; rule: string }
  | { op: 'delete'; path: string }

export type HabitResult = { ok: true; undo: string; path: string } | { ok: false; reason: 'exists' | 'empty' | 'gone' | 'readonly' | 'failed'; message?: string }

/** 习惯的右键菜单里点了哪一项 */
export type HabitMenuPick = { kind: 'open' } | { kind: 'rule'; rule: string } | { kind: 'delete' } | null

/** 到点的提醒（测试模式里通知换成记录器，测试读它） */
export interface NotifShot {
  n: number
  title: string
  body: string
  actions: string[]
  key: string
  due: string
  at: string
}

// ---------- 提醒事项（task-b9y8i：带提醒的镜像进系统提醒事项，加导入提醒事项） ----------

export type RemAuth = 'notDetermined' | 'denied' | 'restricted' | 'full' | 'writeOnly'

/** 设置里「提醒事项」一节、底栏、顶上提示要知道的 */
export interface RemState {
  /** 小助手在不在（开发时没编出来、测试模式没给假提醒事项时不在） */
  available: boolean
  /** 授权；还没问小助手时是 unknown */
  auth: RemAuth | 'unknown'
  /** 系统正在问能不能访问提醒事项 */
  asking: boolean
  connected: boolean
  mirror: boolean
  /** 开没开 iCloud 提醒事项（没授权时不知道） */
  icloud: boolean | null
  list: { id: string; title: string } | null
  /** 这时候真在镜像：连上了、开着、有 iCloud、有列表 */
  active: boolean
  /** 镜像着的（没做完的）有几条 */
  mirrored: number
  /** 上次同步没成的原因（成了是 null） */
  error: string | null
  /** 顶上那条「没开 iCloud 提醒事项」要出 */
  banner: 'noICloud' | null
}

/** 系统日历（只读，main/calendar.ts）：设置里一节、日历左栏、底栏要知道的 */
export interface CalState {
  /** 小助手在不在 */
  available: boolean
  auth: RemAuth | 'unknown'
  /** 系统正在问能不能访问日历 */
  asking: boolean
  /** 设置里「显示系统日历的日程」 */
  show: boolean
  /** 真在画：开着、给了权限 */
  active: boolean
  calendars: { id: string; title: string; color: string; source: string }[]
  error: string | null
}

/** 提醒事项里的一个列表 */
export interface RemList {
  id: string
  title: string
  source: string
  icloud: boolean
  color: string | null
  open: number
  done: number
  writable: boolean
  /** 是不是镜像进去的那个 */
  mirror: boolean
}

/** 导入之前先给你看的 */
export interface ImportPreview {
  files: { list: string; path: string; isNew: boolean; count: number; lines: string[] }[]
  total: number
  recurNotes: number
  places: number
  multiAlarms: number
  /** 没带上的已完成的条数 */
  skippedDone: number
  /** 带 🔔、没做完的几条：导入时加上 🆔，之后镜像进提醒事项 */
  reminded: number
}

export type ImportResult = { ok: true; undo: string; total: number; lists: number; rids: string[] } | { ok: false; message: string }

/** 主进程要界面弹的提示条（带撤销的） */
export interface Notice {
  msg: string
  sub?: string
  undo?: string
  /** 同步时说的（只说一次）：正有提示条时排队，不盖掉别的、也不被盖掉 */
  bg?: boolean
}

export interface CtApi {
  state(): Promise<AppState>
  chooseVault(): Promise<AppState>
  snapshot(): Promise<Snapshot>
  onSnapshot(cb: (s: Snapshot) => void): () => void
  edit(req: EditReq): Promise<EditResult>
  add(text: string, ctx: AddCtx): Promise<AddResult>
  undo(id: string): Promise<UndoResult>
  /** 新清单：建一篇 收件箱/<名字>.md，返回它的路径 */
  newList(name: string): Promise<string | null>
  git(): Promise<GitInfo | null>
  onGit(cb: (g: GitInfo) => void): () => void
  /** 在画布笔记里打开这一篇，到第 line 行（从 0 数） */
  openNote(path: string, line?: number): Promise<{ ok: boolean }>
  /** 「到点的样子」：马上弹一次这条的提醒 */
  previewNotif(key: string): Promise<void>
  setSettings(p: Partial<TodaySettings>): Promise<{ settings: TodaySettings; look: TodayAppearance }>
  onSettings(cb: (s: { settings: TodaySettings; look: TodayAppearance }) => void): () => void
  /** 系统右键菜单（照家族规矩用原生菜单） */
  taskMenu(key: string, lang: Lang): Promise<MenuPick>
  /** 打卡、取消、新建、改重复、删掉一个习惯 */
  habit(op: HabitOp): Promise<HabitResult>
  habitMenu(path: string, lang: Lang): Promise<HabitMenuPick>
  /** AI：用哪一家；拆成小步（先给看）、收下；排进空着的时间（先给看）、收下；job 是这一问的编号，aiCancel 停下 */
  aiInfo(): Promise<AiInfo>
  aiSplit(key: string, job: string): Promise<AiSplitResult>
  aiSplitAccept(key: string, steps: string[]): Promise<EditResult>
  aiSchedule(job: string): Promise<AiSchedResult>
  aiScheduleAccept(slots: AiSlot[]): Promise<AiSchedAccept>
  aiCancel(job: string): Promise<void>
  /** 专注：开始、暂停、放弃、换一条 */
  focus(op: FocusOp): Promise<FocusInfo>
  focusInfo(): Promise<FocusInfo>
  onFocus(cb: (f: FocusInfo) => void): () => void
  /** canvas-today://task/<🆔>、通知、菜单栏小窗点了一条：界面选中它 */
  onOpenTask(cb: (sel: { id?: string; key?: string }) => void): () => void
  onClock(cb: (offset: number) => void): () => void
  /** 主进程要界面说一句（提醒推迟了、链接里的那条找不到了） */
  onSay(cb: (text: string) => void): () => void
  /** 菜单栏小窗：打开主窗口 */
  showMain(sel?: { key: string }): Promise<void>
  /** 软件菜单栏里点了「设置…」「搜索、加一条…」 */
  onMenu(cb: (what: 'settings' | 'search') => void): () => void
  /** 界面准备好了（之前来的 canvas-today:// 链接这时才交给界面） */
  ready(): Promise<void>

  // ---------- 检查更新（只有发布包查；开发版、本机打的包、测试是 off） ----------
  updateStatus(): Promise<UpdateState>
  /** 现在查一次；出错时 ok 为 false（原文在 state.error，界面用 shared/update.ts 换成看得懂的话） */
  checkUpdate(): Promise<{ ok: boolean; state: UpdateState }>
  /** 下好的新版：先提交排着的改动，再退出、装上、重新打开 */
  installUpdate(): Promise<boolean>
  onUpdate(cb: (s: UpdateState) => void): () => void
  /** 新版本（没有就是这一版）在 GitHub 上的发布页，用浏览器打开 */
  openRelease(): Promise<void>

  // ---------- 提醒事项 ----------
  remState(): Promise<RemState>
  onRem(cb: (s: RemState) => void): () => void
  /** 连接：第一次系统问一次能不能访问提醒事项 */
  remConnect(): Promise<RemState>
  /** 断开：镜像过去的删掉，以后这台 Mac 自己响 */
  remDisconnect(): Promise<RemState>
  remSetMirror(on: boolean): Promise<RemState>
  /** 换一个列表镜像进去（没有就在 iCloud 下建） */
  remSetList(title: string): Promise<RemState>
  remLists(): Promise<RemList[]>
  remPreview(o: { lists: string[]; completed: boolean }): Promise<ImportPreview>
  remImport(o: { lists: string[]; completed: boolean }): Promise<ImportResult>
  /** 导入以后删掉提醒事项里的原条目（界面先问过一次） */
  remDeleteOriginals(rids: string[]): Promise<{ ok: boolean; removed: number }>
  remDismissBanner(): Promise<void>
  /** 打开系统设置 › 隐私与安全性 › 提醒事项 */
  remOpenPrivacy(): Promise<void>
  /** 打开系统设置里的 Apple 账户（iCloud 在那里） */
  remOpenICloud(): Promise<void>
  onNotice(cb: (n: Notice) => void): () => void

  // ---------- 系统日历（只读） ----------
  calState(): Promise<CalState>
  onCal(cb: (s: CalState) => void): () => void
  /** 连接：第一次系统问一次；andReminders：提醒事项没连的顺手连上 */
  calConnect(andReminders: boolean): Promise<CalState>
  /** 设置里「显示系统日历的日程」 */
  calShow(on: boolean): Promise<CalState>
  /** 这几天（本地日子，都含）的日程 */
  calEvents(from: string, to: string): Promise<CalEvent[]>
  /** 日历 App 里改了：重读 */
  onCalChanged(cb: () => void): () => void
  calOpenPrivacy(): Promise<void>
}

declare global {
  interface Window {
    ct: CtApi
  }
}
