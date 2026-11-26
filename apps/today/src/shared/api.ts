/** 主进程和界面之间说的话（window.ct）。界面只拿到索引的样子，改文件一律交给主进程。 */
import type { CalEvent } from '@cn/calendar'
import type { EngineId } from '../../../notes/src/shared/agent'
import type { ApiId } from '@cn/ai-engines/shared'
import type { AiPick, ModelOption } from '@cn/ai-engines/shared'
import type { ChatInfo, TodayMsg } from './ai-chat'
import type { AgentMode, OmniState, TodayChatEvent } from './ai-agent'
import type { Material } from '@cn/ai-chat/materials'
import type { CloseItem } from './plan'
import type { FocusRecord, Habit, Prio, RingBy, When, WhenFields } from '@cn/tasks'
import type { Lang } from './i18n'
import type { TodayAppearance, TodaySettings } from './settings'
import type { ThemeFile } from '../../../notes/src/shared/vscode-theme'

/** 检查更新的状态：和画布笔记同一个 Updater（apps/notes/src/main/updater.ts），类型也用它的 */
export type { UpdateState } from '../../../notes/src/shared/api'
import type { FeedsSrc } from './feeds-link'
import type { McClass, McLead, McLive, McProject, McSrc } from './mc'
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
  /** [/] 做了一半：还算没做完，显示成「进行中」 */
  doing: boolean
  date: string | null
  time: string | null
  remind: string | null
  repeat: string | null
  prio: Prio
  /** 优先级记号是 ⏬（最低）：prio 是 1，四象限放第 4 格（不重要不紧急）；🔽 放第 3 格 */
  lowest?: boolean
  doneDate: string | null
  /** 估时（分钟）：那一行的「[估时:: 30分钟]」（排一天的时间块多长）；没写是 null */
  minutes: number | null
  /**
   * 抄了好几遍的同一条（滴答同步抄进每天的日记，@cn/tasks dupes.ts）：只显示一份，文件不动。
   * 不显示的那几份这里是显示的那份的 key；显示的那份是 null，它的 dups 是另外几份的 key
   */
  dupOf: string | null
  dups: string[]
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
  /** MeetCaption 写进上课记录的（这一行带 ▶ 时间）：来自哪节课、哪一刻（shared/mc.ts）；别的是 null */
  mc: McSrc | null
  /** 画布订阅写进来的稍后读（这一行带 canvas-feeds://item/ 链接，shared/feeds-link.ts）；别的没有 */
  feeds?: FeedsSrc | null
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
  /** 导入的 VS Code 主题（和画布笔记同一份，存在画布笔记设置目录 themes/） */
  themes: ThemeFile[]
  /** 界面的钟比真的钟快多少毫秒（测试用 CT_NOW 拨钟） */
  clockOffset: number
  device: string
  version: string
  e2e: boolean
}

export type EditOp =
  | { op: 'done'; done: boolean }
  /** 不做了：[-] 加 ❌ 今天（排一天「不做了」） */
  | { op: 'cancel' }
  /** 估时（分钟）；null 拿掉 */
  | { op: 'minutes'; minutes: number | null }
  | { op: 'date'; date: string | null; time?: string | null }
  | { op: 'time'; time: string | null }
  | { op: 'remind'; remind: string | null }
  | { op: 'repeat'; repeat: string | null }
  /** 日子、钟点、提醒、重复一起照这样写（定日子和时间的选择器，task-pd289；null 是拿掉那一项） */
  | { op: 'when'; when: WhenFields }
  | { op: 'prio'; prio: Prio; lowest?: boolean }
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
      /** 抄了好几遍的同一条：另外几份一起改了几份 */
      copies?: number
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
  /** 要的那把 Key 画布今日还没有、画布笔记有（task-587os）：先问「用画布笔记那把？」 */
  borrow?: ApiId
}

/** borrow：要用的那把 Key 画布今日还没有、画布笔记有，先问一句再重来 */
export type AiSplitResult = { ok: true; steps: string[] } | { ok: false; message: string; aborted?: boolean; borrow?: ApiId }

/** AI 排好的一条（虚线框）：哪一条、哪天几点、多长 */
export interface AiSlot {
  key: string
  title: string
  date: string
  time: string
  minutes: number
}

export type AiSchedResult = { ok: true; slots: AiSlot[]; candidates: number; events: number } | { ok: false; message: string; aborted?: boolean; borrow?: ApiId }

export type AiSchedAccept = { ok: true; undo: string; n: number } | { ok: false; reason: 'gone' | 'readonly' | 'failed'; message?: string }

// ---------- 右栏 AI 对话（main/ai-chat.ts、shared/ai-chat.ts） ----------

/** 输入框底行谁来答那一列的一家 */
export interface ChatEngineInfo {
  id: EngineId
  label: string
  ok: boolean
  /** 「~/.local/bin」；没装是空的 */
  where: string
  models: ModelOption[]
}

/** 设置 › AI 那一页（对标清单 U4）：能选哪几家；两样（右栏 AI 对话、小活）各是画布今日自己选的（null 是跟着）、跟着的那一行是什么 */
export interface AiSettingsView {
  engines: ChatEngineInfo[]
  /** 有画布笔记的设置：跟着的那一项叫「跟画布笔记」；没有叫「默认」 */
  notes: boolean
  chat: { own: AiPick | null; follow: AiPick; followLabel: string }
  quick: { own: AiPick | null; follow: AiPick; followLabel: string }
}

export interface ChatInfoState {
  engines: ChatEngineInfo[]
  /** 这一段这一问用的（自己选过的，或跟画布笔记「AI 对话」那一行） */
  pick: AiPick
  /** 这一段自己选过 */
  own: boolean
  /** 「Claude Code · Opus 5.5 · High」 */
  label: string
  /** 看得到：待办几条、收件箱几条、日程几个；cal 系统日历连着没有 */
  seen: { tasks: number; inbox: number; events: number; eventNames: string[]; cal: boolean }
  /** 全能模式开没开、听谁的（画布今日自己切的 > 画布笔记的 > 默认开） */
  omni: OmniState
  /** 这一段这一问怎么跑：全能、只在库里、不能动手（API Key、本机模型：只排日程） */
  mode: AgentMode
}

/** quick：全局快速输入框问的（全能模式开着照右栏那样动手，关着只回答、不动库） */
export interface ChatAskOpts {
  quick?: boolean
  /** @ 点名的笔记 / 清单（对标清单 U1）：内容交给 AI，里面没做完的待办也能排 */
  mentions?: import('@cn/ai-chat/mentions').Mention[]
}

export type ChatAskResult = { ok: true; msgs: TodayMsg[] } | { ok: false; aborted: boolean; msgs: TodayMsg[] }
export type ChatAcceptResult = { ok: true; undo: string; n: number; msgs: TodayMsg[] } | { ok: false; reason: 'gone' | 'readonly' | 'failed'; message?: string }

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
  /** hidden：左栏右键「不在这里显示」了（和画布笔记共用一份，task-ov5bb）；它的日程不画、不占时间 */
  calendars: { id: string; title: string; color: string; source: string; hidden: boolean }[]
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

// ---------- 排一天（shared/plan.ts、main/plan.ts、renderer/plan.tsx） ----------

/** 这台设备今天排过没有、收工没有（只用来决定打开时停在哪一步） */
export interface PlanState {
  date: string
  /** 早上那几步：走完了（点了「开工」）、跳过了、还没 */
  morning: 'done' | 'skipped' | null
  /** 收工写进了哪一篇日记；还没收工是 null */
  closed: string | null
}

/** 日记放在哪（shared/plan.ts JournalPlace）；auto 是不看设置时自己认的那个，options 是设置里能挑的几种 */
export interface JournalInfo {
  pattern: string
  how: 'chosen' | 'obsidian' | 'found' | 'default'
  count: number
  auto: { pattern: string; how: 'chosen' | 'obsidian' | 'found' | 'default'; count: number }
  options: string[]
  /** 今天那一篇的路径、已经有了没有 */
  today: string
  exists: boolean
}

export type CloseResult = { ok: true; path: string; undo: string; created: boolean } | { ok: false; message: string }

/** 主进程要界面弹的提示条（带撤销的） */
export interface Notice {
  msg: string
  sub?: string
  undo?: string
  /** 同步时说的（只说一次）：正有提示条时排队，不盖掉别的、也不被盖掉 */
  bg?: boolean
}

/** 设置和外观：改了设置、画布笔记那边换了外观、导入或删掉了主题，主进程推过来的这一份 */
export interface LookState {
  settings: TodaySettings
  look: TodayAppearance
  themes: ThemeFile[]
}

/** 全局快速加一条的键：设置里的那组、注册上了没有（被别的软件占了是 false） */
export interface QuickKeyState {
  key: string
  registered: boolean
}

/** 全局小框里的一条（贴进几行就是几条）：dest 是 ⌘↵ 自己换的那篇；when 是 AI 认出来的（本地认不出时） */
export interface QuickItem {
  text: string
  dest: string | null
  when: When | null
  /** 贴的图（存在 pasted/ 里的名字，最多 4 张）：存进写进那篇的附件文件夹，挂在这一条下面 */
  images?: string[]
}

export type QuickAddResult = { ok: true; n: number } | { ok: false; message: string }

/** MeetCaption 联动（main/mc.ts）：今天的课、正在上课没有；没装 MeetCaption 时 installed 是 false，界面什么都不画 */
export interface McState {
  installed: boolean
  /** 库里 .canvas-notes/meetcaption.json 的项目（没连库、没有是空的） */
  projects: McProject[]
  /** 今天的课（照课表和对上的日历日程） */
  classes: McClass[]
  /** 正在上课（开着字幕）；没有是 null */
  live: McLive | null
  /** 设置「上课前问开字幕吗」 */
  lead: McLead
}

export interface CtApi {
  state(): Promise<AppState>
  chooseVault(): Promise<AppState>
  snapshot(): Promise<Snapshot>
  onSnapshot(cb: (s: Snapshot) => void): () => void
  edit(req: EditReq): Promise<EditResult>
  /** when：AI 认出来的（task-pd289，标题和时间照它） */
  add(text: string, ctx: AddCtx, when?: When | null): Promise<AddResult>
  /** 写时间本地认不出、看着有时间词的那一句问 AI（task-pd289）；认不出、问不成是 null */
  whenAi(text: string, now: string): Promise<When | null>
  undo(id: string): Promise<UndoResult>
  /** 新清单：建一篇 收件箱/<名字>.md，返回它的路径 */
  newList(name: string): Promise<string | null>
  git(): Promise<GitInfo | null>
  onGit(cb: (g: GitInfo) => void): () => void
  /** 在画布笔记里打开这一篇，到第 line 行（从 0 数） */
  openNote(path: string, line?: number): Promise<{ ok: boolean; by?: 'notes' | 'default' }>
  /** 库里一篇的字（⌘ 悬停预览用，只读）；没有这一篇、不是 .md 是 null */
  noteText(path: string): Promise<string | null>
  /** 「到点的样子」：马上弹一次这条的提醒 */
  previewNotif(key: string): Promise<void>
  setSettings(p: Partial<TodaySettings>): Promise<LookState>
  onSettings(cb: (s: LookState) => void): () => void
  /** 导入 VS Code 主题（.json 或 .vsix，存进和画布笔记同一个文件夹）：导进来就用上；取消了是 null */
  importTheme(): Promise<{ added: { id: string; name: string }[]; state: LookState } | null>
  /** 删掉一套导入的主题（画布笔记那边也没了） */
  removeTheme(id: string): Promise<LookState>
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
  /** 用画布笔记那把 Key：同意后存一份到画布今日自己这里 */
  aiBorrow(id: ApiId): Promise<{ ok: boolean; message?: string }>
  /** 每一家画布今日自己有没有一份（后 4 位）、画布笔记有没有 */
  aiKeys(): Promise<{ id: ApiId; tail: string | null; notes: boolean }[]>
  /** 不用了：删掉画布今日自己存的那一份（画布笔记那份不动） */
  aiKeyDrop(id: ApiId): Promise<void>
  /** 右栏 AI 对话：用哪家、看得到什么；对话列表；读一段；问一句（job 给 aiCancel 停下）；改动卡收下 / 不要 / 撤销了；这一段换家、模型、想多久（null 回到跟设置） */
  chatInfo(id: string): Promise<ChatInfoState>
  /** 画布笔记设置里「AI 对话」那一家（右图标栏 AI 一格画它的标志） */
  chatDefault(): Promise<AiInfo>
  /** 设置 › AI（对标清单 U4）：读；改一样（null 回到跟画布笔记） */
  aiSettings(): Promise<AiSettingsView>
  aiSetOwn(f: 'chat' | 'quick', pick: AiPick | null): Promise<AiSettingsView>
  chatList(): Promise<ChatInfo[]>
  chatLoad(id: string): Promise<{ msgs: TodayMsg[]; title: string }>
  /** mats：这一问带的图（输入框顶上那一排；text 里的 ①② 是它们的位置） */
  chatAsk(id: string, text: string, job: string, mats?: Material[], opts?: ChatAskOpts): Promise<ChatAskResult>
  /** 全局快速输入框 ⌘J：小框收起，主窗口右栏 AI 打开这一段（job：还在答的那一问，右栏接着收字） */
  chatHandoff(id: string, job: string | null): Promise<void>
  /** 主窗口：快速输入框交过来一段对话，右栏打开它 */
  onOpenChat(cb: (o: { id: string; job: string | null }) => void): () => void
  /** 快速输入框问的那一问答完存好了（主窗口右栏开着这一段时重读） */
  onChatSaved(cb: (id: string) => void): () => void
  /** 输入框里贴的、拖进来的图存进 pasted/，返回名字 */
  chatPaste(bytes: Uint8Array, mime: string): Promise<string>
  /** 底行「+」：系统选图框，最多 room 张 */
  chatPickImages(room: number): Promise<{ name: string; label: string }[]>
  /** 存好的图在界面上的 data: 网址（打开以前的对话时取） */
  chatPasted(name: string): Promise<string>
  chatAccept(id: string, msgId: number, on: number[]): Promise<ChatAcceptResult>
  chatPlanState(id: string, msgId: number, state: 'dropped' | 'undone'): Promise<TodayMsg[]>
  chatPick(id: string, pick: AiPick | null): Promise<{ pick: AiPick; own: boolean; label: string }>
  /** 全能模式：切开关（记在画布今日自己的设置里）、撤回这一轮的改动、跑着时的字和步骤（job 是 chatAsk 给的那个） */
  chatOmni(on: boolean): Promise<OmniState>
  chatRevert(id: string, msgId: number): Promise<{ ok: true; msgs: TodayMsg[] } | { ok: false; message: string }>
  onChatEvent(cb: (job: string, e: TodayChatEvent) => void): () => void
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
  /** 全局快速加一条：弹出小框（菜单栏小窗底下那一格点了） */
  quickShow(): Promise<void>
  /** 小框收起（Esc）：焦点还给原来的软件 */
  quickClose(): Promise<void>
  /** 小框里回车：一条条写进库，收起、还焦点、弹通知；open：⇧↵ 加上并在画布今日里打开 */
  quickAdd(items: QuickItem[], open: boolean): Promise<QuickAddResult>
  quickState(): Promise<QuickKeyState>
  /** 菜单栏小窗「去设置换」：打开主窗口的设置 › 一般 */
  openSettings(): Promise<void>
  onQuickState(cb: (s: QuickKeyState) => void): () => void
  /** 小框弹出来了（fresh：刚弹出来，清空重写；false：已经开着又按了一次） */
  onQuickOpen(cb: (fresh: boolean) => void): () => void
  /** 小窗、小框量好自己多高，窗口跟着变 */
  fit(height: number): Promise<void>
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
  /** MeetCaption 联动（main/mc.ts） */
  mcState(): Promise<McState>
  onMc(cb: (s: McState) => void): () => void
  /** 今日页那节课旁边「开字幕」：走 meetcaption://start */
  mcStart(key: string): Promise<void>
  /** 上课中「打开字幕」：meetcaption://open?session= */
  mcOpenLive(): Promise<void>
  /** 待办上「来自 ECP 09:43」：在画布笔记里打开那一篇那一秒（canvas-notes://open?file=&t=） */
  mcJump(key: string): Promise<{ ok: boolean; by?: 'notes' | 'default' }>
  /** 稍后读那一行上「画布订阅」：打开画布订阅的那一篇（canvas-feeds://item/…） */
  openFeeds(url: string): Promise<{ ok: boolean }>
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
  /** 打开系统「日历」App（设置引导里那一步；测试模式只记下来） */
  openCalendarApp(): Promise<void>
  /** 左栏一个日历：藏起 / 再显示（点色块） */
  calHide(id: string, hide: boolean): Promise<CalState>
  /** 左栏一个日历的右键：不在这里显示 / 在这里显示 · 全部显示（主进程弹系统菜单、点了就改） */
  calMenu(id: string): Promise<CalState>

  // ---------- 排一天 ----------
  planState(): Promise<PlanState>
  planMark(p: Partial<Omit<PlanState, 'date'>>): Promise<PlanState>
  /** 日记放在哪（照设置、Obsidian 日记插件、库里已有的认） */
  journal(): Promise<JournalInfo>
  /** 收工：那一节写进今天的日记 */
  planClose(o: { time: string; items: CloseItem[]; focus: { n: number; minutes: number } }): Promise<CloseResult>
}

declare global {
  interface Window {
    ct: CtApi
  }
}
