/**
 * 自动化在主进程和界面之间的约定（IPC 契约，task-i921u「当……就……」）。写法、算法在 packages/format 的 automation.ts、
 * automation-run.ts；主进程在 main/automation.ts（引擎、记录、撤回、周记、深链）。说明见 docs/DEVELOPMENT.md「自动化」。
 *
 * 规则在哪（AutoWhere）：'lib' 是库里的（.canvas-notes/自动化.md），别的是「文档路径#第几个 base 块」（baseWhere）。
 * 一条规则：AutoRef { where, index }，index 是那一串里的第几条。
 */
import type { AutoLogEntry, AutoRule, AutoStep, AutoWhere } from '@cn/format'

export type { AutoLogEntry, AutoRule, AutoStep, AutoWhere }

export interface AutoRef {
  where: AutoWhere
  index: number
}

/** 设置 › 自动化最上面那几个（这台 Mac 上的，记在设置目录 automation.json） */
export interface AutoPrefs {
  /** 总开关：关了什么自动化都不跑（按钮照样能点） */
  on: boolean
  /** Mac 关着、画布笔记没开时错过的：once 下次打开补跑一次（规则里没写 missed 的照这个），skip 跳过、记一行 */
  missed: 'once' | 'skip'
  /** 跑完发系统通知（规则里的「发通知」一步不管这个，总会发） */
  notify: boolean
}

/** 列表里的一条规则 */
export interface AutoRuleInfo {
  ref: AutoRef
  /** base：数据库里的；library：库里的 */
  kind: 'base' | 'library'
  /** 在哪：数据库那篇的名字（「2026 记账」），库里的是「库里」 */
  place: string
  /** 数据库那篇的路径（「在数据库里改」打开它）；库里的是 .canvas-notes/自动化.md */
  doc: string
  rule: AutoRule
  /** 一句话：当 新加一条 · 如果 分类 为空 · 就 AI 写「分类」这一格 */
  sentence: string
  /** 这一条在 md 里的样子（「看写法」） */
  yaml: string
  /** checkRule 查出来的问题（空的是没问题；有问题的照样列出来，跑到时报错停下） */
  problems: string[]
  /** 从记录里算的：跑过几次、上次几点（2026-11-21T08:40:00）、最后一次出错的原因 */
  runs: number
  last: string | null
  error: string | null
  /** 定时的下一次（2026-11-29T20:00:00）；不是定时的是 null */
  next: string | null
  /** 软件自带的那两条（周记、整理收件箱） */
  builtIn?: 'week' | 'inbox'
}

/** 数据库里的按钮列（列表里只给「按钮列点了才跑，不在这里」那一句用） */
export interface AutoButtonInfo {
  where: AutoWhere
  doc: string
  place: string
  col: string
  steps: AutoStep[]
}

/** 不是写在规则里的自带那一样：梦游（开关、现在跑一次和设置 › 梦游同一个） */
export interface AutoSystemInfo {
  id: 'dream'
  name: string
  on: boolean
  /** 第二行：上次做了什么 */
  desc: string
}

export interface AutoListing {
  prefs: AutoPrefs
  rules: AutoRuleInfo[]
  buttons: AutoButtonInfo[]
  system: AutoSystemInfo[]
}

/** 存一条：index 是 null 时加在最后 */
export interface AutoSaveReq {
  where: AutoWhere
  index: number | null
  rule: AutoRule
}

/** 改了规则文件（存、开关、删）：写好、提交；problems 是存进去了但有问题的（界面提示一句） */
export type AutoWriteResult = { ok: true; ref: AutoRef; hash: string | null; problems: string[] } | { ok: false; error: string }

/** 现在跑一次：数据库里看一条记录的规则（新加一条、某列改了、到了日子）要给 path，不给就挑第一条合「如果」的 */
export interface AutoRunReq {
  ref: AutoRef
  path?: string
}

/** 点一行的按钮。按钮第一步是「先问一句」时：没 confirmed 的话主进程不跑，交回 { ask: 那句话 }，界面问过再带 confirmed: true 调一次 */
export interface AutoButtonReq {
  where: AutoWhere
  col: string
  path: string
  confirmed?: boolean
}

export type AutoStartResult = { run: number } | { ask: string } | { error: string }

/** 试跑：拿一条走一遍，说清会做什么，不写文件（编辑中的规则还没存也能试） */
export interface AutoTrialReq {
  where: AutoWhere
  rule: AutoRule
  path?: string
}

export interface AutoTrial {
  /** 拿哪一条试的（数据库里的；库里的规则是 null） */
  path: string | null
  /** 为什么会跑：「新加了「机场打车」」「每周日 20:00」；「如果」不合时写为什么不跑 */
  why: string
  /** 合不合「如果」 */
  fits: boolean
  /** 一步一句会做什么：把「分类」改成「报销」、在「生活/待办」加一条「交报销单：外卖 41」（下周一 9:00 提醒）、AI 写「分类」这一格（不试 AI，只说会问） */
  steps: string[]
  problems: string[]
}

/** 一次开始跑（底栏「后台在跑」、卡片上「在读几条、能停」） */
export interface AutoStarted {
  run: number
  where: AutoWhere
  rule: string
  why: string
  /** 一共几步、AI 读几条 */
  steps: number
  reading?: number
}

/** 跑完（成了、出错、停下）：记录那一行；open 是按钮「在右栏打开它」要开的那篇 */
export interface AutoDone {
  run: number
  entry: AutoLogEntry
  open?: string
  /** 这一条出错停下了（规则里写了 on: false） */
  paused?: boolean
}

/** 「运行一条存过的命令」：命令在界面那边跑（照它自己的「先给你看」），主进程交过去 */
export interface AutoCommandReq {
  run: number
  command: string
  /** 对哪一篇跑（数据库里那一条、周记新建的那篇）；没有是 null */
  path: string | null
}

/** 记录里一行，带上撤回过没有 */
export interface AutoLogRow extends AutoLogEntry {
  undone: boolean
}

export interface AutoLogReq {
  where?: AutoWhere
  rule?: string
  /** 最多几行，新的在前（默认 100） */
  limit?: number
}

export type AutoUndoResult = { ok: true; hash: string | null } | { ok: false; error: string }

/** 一句话 → 规则（方向 B）：where 定是数据库里的还是库里的（数据库给列和选项） */
export interface AutoSentenceReq {
  sentence: string
  where: AutoWhere
}

export type AutoSentenceResult = { ok: true; rule: AutoRule; yaml: string; sentence: string; problems: string[]; by: string } | { ok: false; error: string }

/** window.cn.auto */
export interface AutoApi {
  /** 规则、按钮、自带的；给 where 只列那一处（数据库块头「自动化 3」、右栏那一页） */
  list(where?: AutoWhere): Promise<AutoListing>
  save(req: AutoSaveReq): Promise<AutoWriteResult>
  /** 开关：只换那一条的 on: false 一行 */
  toggle(ref: AutoRef, on: boolean): Promise<AutoWriteResult>
  remove(ref: AutoRef): Promise<AutoWriteResult>
  /** 现在跑一次 */
  run(req: AutoRunReq): Promise<AutoStartResult>
  button(req: AutoButtonReq): Promise<AutoStartResult>
  stop(run: number): Promise<boolean>
  trial(req: AutoTrialReq): Promise<AutoTrial>
  log(req?: AutoLogReq): Promise<AutoLogRow[]>
  /** 撤回一次（只发了通知的收不回）：那一次改的文件换回去，一次提交，记录多一行「撤回了」 */
  undo(id: string): Promise<AutoUndoResult>
  fromSentence(req: AutoSentenceReq): Promise<AutoSentenceResult>
  /** 读设置；给 patch 就改了再读 */
  prefs(patch?: Partial<AutoPrefs>): Promise<AutoPrefs>
  /** 自带的梦游：开关、现在跑一次 */
  system(id: 'dream', on?: boolean): Promise<AutoSystemInfo>
  systemRun(id: 'dream'): Promise<void>
  onStarted(cb: (s: AutoStarted) => void): () => void
  onDone(cb: (d: AutoDone) => void): () => void
  /** 交给界面跑一条存过的命令 */
  onCommand(cb: (c: AutoCommandReq) => void): () => void
  /** 规则文件、记录变了（别处改了自动化.md、跑完一次）：重读 list / log */
  onChanged(cb: () => void): () => void
}
