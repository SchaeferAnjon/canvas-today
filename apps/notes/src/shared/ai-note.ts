/**
 * AI 对话写进笔记的开关（2026-11-24 用户批，design/ai-note-switch 方向 A「开关两颗」，偏好「AI对话记笔记开关」）。
 *
 * - 两颗：「记笔记」管主对话、「旁支」管旁支，分开开关；旁支框头的小标签只管那一条旁支（ReadingSide.note）。
 * - 默认：读 PDF、网页、视频开，看文档、没开东西关；旁支跟对话同一个默认。改过的按「在看什么」（NoteKind）记住，
 *   存在库里 `.canvas-notes/ai-note.json`（跟着 Git）。开关按发问那一刻算（问的那条带 noNote），关掉后已经记进去的留着。
 * - 写进去的样子、加、拿掉在 @cn/format 的 ai-note.ts（appendAsk / removeAsk）；主进程 main/reading/ai-note.ts 读写文件、提交。
 * - 记进哪篇（2026-11-24 改，偏好「剪藏和AI笔记同一篇」）：PDF 配对的「X 笔记.md」（按页一节）；网页、视频、文档写进那篇本身
 *   （网页配成一对的剪藏那篇、视频「记到哪」那篇、看着的文档；NoteTarget.inline：中间看得见那篇时插在光标处，不然接在末尾），
 *   和剪藏、自己打的字混排在同一篇；没开东西时先问记进哪篇（收件箱新建的那篇按一节写）。
 */
import type { AskPlace, NoteAsk } from '@cn/format'
import type { CommitInfo } from './api'
import type { ReadingMsg, ReadingThread } from './reading'

/** 在看什么：PDF（和库里的 HTML）、网页、视频、文档、什么都没开（首页、收件箱、文件夹……） */
export type NoteKind = 'pdf' | 'web' | 'video' | 'doc' | 'none'

export interface NoteSwitch {
  /** 主对话记不记 */
  main: boolean
  /** 旁支记不记 */
  side: boolean
}

export const NOTE_KINDS: NoteKind[] = ['pdf', 'web', 'video', 'doc', 'none']

/** 默认：读 PDF、网页、视频开，看文档、没开东西关 */
export const DEFAULT_SWITCH: Record<NoteKind, NoteSwitch> = {
  pdf: { main: true, side: true },
  web: { main: true, side: true },
  video: { main: true, side: true },
  doc: { main: false, side: false },
  none: { main: false, side: false },
}

/** 库里记开关的文件（跟着 Git） */
export const SWITCH_FILE = '.canvas-notes/ai-note.json'

/** 文件里的（只记改过的）读成五样都有的；认不出的键、不是 true/false 的值不要 */
export function readSwitches(raw: unknown): Record<NoteKind, NoteSwitch> {
  const out = { ...DEFAULT_SWITCH }
  if (!raw || typeof raw !== 'object') return out
  for (const k of NOTE_KINDS) {
    const v = (raw as Record<string, unknown>)[k]
    if (!v || typeof v !== 'object') continue
    const m = (v as Record<string, unknown>).main
    const s = (v as Record<string, unknown>).side
    out[k] = { main: typeof m === 'boolean' ? m : out[k].main, side: typeof s === 'boolean' ? s : out[k].side }
  }
  return out
}

/** 加一问：记进 note（库里的路径），在 place 那一节；note 还没有时照 create 新建 */
export interface NoteAppendRequest {
  note: string
  ask: NoteAsk
  place: AskPlace
  /** note 还没有时怎么建：pdf 是配对笔记（newReadingNote），不然是一篇普通笔记（标题 title） */
  create?: { pdf?: string; title?: string }
  /** 写进那篇本身（网页、视频、文档）：主进程不写，只拼好那几行交回（NoteAppendResult.md），界面插在光标处或接在末尾再提交 */
  inline?: boolean
  /** 这一问带的文件（框的图、材料里的图，已经在库里）：和笔记一起提交 */
  files?: string[]
  /** 提交说明里那篇的名字后面那一截（默认问的那句） */
  subject?: string
  /** PDF 一共几页：配对笔记的属性「进度」跟上（问到第几页 / 一共几页，ParaRead、课程首页读它） */
  pages?: number
}

/**
 * 读 PDF、库里的 HTML、网页、视频「接着问」那一套（ReadingAi）记一问：主进程照这一问拼 NoteAsk
 * （问的原话、回答原文、材料里的图拷进库、这一处在这篇里第一次记时带上框的图或选的那段、来源行），
 * 这一处在这篇里有旧写法那一段时接在它后面，再和 ainote:append 一样写、提交
 */
export interface NoteAskRequest {
  /** 来源：库里的 PDF、HTML，或 web:<网址> */
  src: string
  /** 记进哪篇（库里的路径） */
  note: string
  /** 那条对话的 key（readKey） */
  key: string
  thread: ReadingThread
  /** 问的那条、答的那条（旁支的是旁支里那两条） */
  user: ReadingMsg
  ai: ReadingMsg
  /** 旁支：选中的那一句、它那一问的原话、那一问的回答编号 */
  side?: { quote: string; parent?: string; of: number }
  /** 二级标题、第几页（after 主进程自己认） */
  place: AskPlace
  /** 来源行（网页那一段、视频那一秒）：label 写的字、url 原样的网址；PDF、库里的 HTML 不用给，主进程照那一页那一块写 */
  from?: { label: string; url: string }
  create?: NoteAppendRequest['create']
  inline?: boolean
  /** PDF 一共几页（属性「进度」） */
  pages?: number
}

export interface NoteAppendResult {
  note: string
  /** 已经记过（同一条回答）：没写 */
  had: boolean
  commit: CommitInfo | null
  /** inline 的：要写进去的那几行、和它一起提交的文件（框的图、材料里的图） */
  md?: string
  files?: string[]
}

export interface NoteRemoveRequest {
  note: string
  key: string
  msg: number
}

export interface NoteRemoveResult {
  /** 找到了、拿掉了 */
  removed: boolean
  commit: CommitInfo | null
}

/** window.cnReading 上和记笔记开关有关的几样（preload/reading.ts） */
export interface CnAiNoteApi {
  /** 五样在看什么的开关（文件里没有的是默认） */
  noteSwitches(): Promise<Record<NoteKind, NoteSwitch>>
  /** 改一样：写进库里的 .canvas-notes/ai-note.json、提交 */
  setNoteSwitch(kind: NoteKind, s: NoteSwitch): Promise<Record<NoteKind, NoteSwitch>>
  noteAppend(req: NoteAppendRequest): Promise<NoteAppendResult>
  /** 读 PDF 那一套记一问（NoteAskRequest） */
  noteAsk(req: NoteAskRequest): Promise<NoteAppendResult>
  noteRemove(req: NoteRemoveRequest): Promise<NoteRemoveResult>
  /** 这篇里记着哪几条回答（key 那段对话的）；笔记没有是空的 */
  noteHas(note: string, key: string): Promise<number[]>
}

/**
 * 别处的 AI 对话（AiPanel：看文档、首页、收件箱、文件夹……）记进哪篇：path 库里的路径（.md）；create 是这篇还没有时怎么建
 * （title：收件箱新建的一篇）；inline 是写进那篇本身（看着的文档、网页上引了一段问的记进剪藏那篇），插在光标处或接在末尾。选过的记在这段对话上（和选的模型同一处存，新对话清掉）；
 * 发问那一刻开着就记在那条问的消息上（StoredMsg.noteAt），答完照它写
 */
export interface NoteTarget {
  path: string
  create?: { title?: string }
  inline?: true
}

const mdPath = (p: unknown): p is string => typeof p === 'string' && /\.md$/i.test(p) && !p.startsWith('/') && !p.split('/').includes('..') && p.length < 1000

/** 存着的、界面给的记进哪篇：认不出的当没有 */
export function checkTarget(raw: unknown): NoteTarget | null {
  const o = raw as Partial<NoteTarget> | null
  if (!o || typeof o !== 'object' || !mdPath(o.path)) return null
  const c = o.create
  const inline = o.inline === true ? { inline: true as const } : {}
  if (!c || typeof c !== 'object') return { path: o.path, ...inline }
  const create = typeof c.title === 'string' && c.title.trim() && c.title.length < 400 ? { title: c.title } : null
  return create ? { path: o.path, create, ...inline } : { path: o.path, ...inline }
}

/** 界面上写那篇的名字：太长截一截（最多 n 个字） */
export function noteName(name: string, n: number): string {
  const s = [...name]
  return s.length <= n ? name : s.slice(0, n - 1).join('') + '…'
}
