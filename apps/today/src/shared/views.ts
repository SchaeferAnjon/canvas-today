/**
 * 列表怎么分组、左栏的数（照 v2 原型的 listView / cntToday / cntInbox）。纯函数，界面和菜单栏小窗都用，单元测试在 test/views.test.ts。
 * 一条「没做完」= 没勾、没取消；子任务（挂在别的待办下面的）不单独列，除非它自己写了日子。
 */
import type { CalItem } from '@cn/calendar'
import { diffDays, type ISODate } from '@cn/tasks'
import type { NoteView, Snapshot, TaskView } from './api'
import { INBOX_NOTE } from './brand'
import { isoPlus } from './when'

export const open = (t: TaskView) => !t.done && !t.cancelled

/** 在日子类的看法（今天、明天、日历、四象限）里列出来的：最上层的，加上自己写了日子的子任务 */
export const listed = (t: TaskView) => t.parent === null || t.date !== null

export type Nav = 'inbox' | 'today' | 'tomorrow' | 'week' | `list:${string}`

export interface Group {
  name: string
  /** 名字从哪来：要翻译的键，或者原样（## 标题、日期） */
  kind: 'overdue' | 'today' | 'tomorrow' | 'doneToday' | 'noDate' | 'day' | 'heading' | 'none'
  date?: ISODate
  items: TaskView[]
  /** 拖到组名上改成哪天（date:2026-11-23） */
  drop?: string
  red?: boolean
  /** 只列前两条，后面写「+N」（今天里的「明天」那组） */
  fold?: boolean
  /** 这一组只写时间（今天那组） */
  timeOnly?: boolean
  done?: boolean
  /** 空的时候画「收件箱是空的」 */
  empty?: boolean
}

const byTime = (a: TaskView, b: TaskView) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.path.localeCompare(b.path) || a.line - b.line
const byPlace = (a: TaskView, b: TaskView) => a.path.localeCompare(b.path) || a.line - b.line

export const cntToday = (ts: readonly TaskView[], today: ISODate) => ts.filter((t) => open(t) && listed(t) && t.date !== null && t.date <= today).length
export const cntInbox = (ts: readonly TaskView[]) => ts.filter((t) => open(t) && t.path === INBOX_NOTE && t.parent === null && !t.date).length
export const cntTomorrow = (ts: readonly TaskView[], today: ISODate) => ts.filter((t) => open(t) && listed(t) && t.date === isoPlus(today, 1)).length
export const cntWeek = (ts: readonly TaskView[], today: ISODate) => ts.filter((t) => open(t) && listed(t) && t.date !== null && diffDays(t.date, today) < 7).length

/** 一篇里没做完的最上层待办有几条 */
export const cntNote = (ts: readonly TaskView[], path: string) => ts.filter((t) => open(t) && t.path === path && t.parent === null).length

/** 左栏「有待办的笔记」：有没做完的（收件箱那篇除外），新改的在前；正开着的那篇没有了也留着 */
export function notesWithTodo(s: Snapshot, keep?: string): NoteView[] {
  const has = new Set(s.tasks.filter((t) => open(t) && t.path !== INBOX_NOTE).map((t) => t.path))
  return s.notes.filter((n) => has.has(n.path) || n.path === keep).sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))
}

export function groupsOf(nav: Nav, ts: readonly TaskView[], today: ISODate): Group[] {
  const tom = isoPlus(today, 1)
  const live = ts.filter((t) => open(t) && listed(t))
  if (nav === 'today') {
    const g: Group[] = []
    const od = live.filter((t) => t.date && t.date < today).sort((a, b) => a.date!.localeCompare(b.date!) || byTime(a, b))
    if (od.length) g.push({ name: 'overdue', kind: 'overdue', items: od, red: true })
    g.push({ name: 'today', kind: 'today', date: today, items: live.filter((t) => t.date === today).sort(byTime), drop: 'date:' + today, timeOnly: true })
    g.push({ name: 'tomorrow', kind: 'tomorrow', date: tom, items: live.filter((t) => t.date === tom).sort(byTime), drop: 'date:' + tom, fold: true })
    g.push({ name: 'doneToday', kind: 'doneToday', items: ts.filter((t) => t.done && t.doneDate === today && listed(t)).sort(byPlace), done: true })
    return g
  }
  if (nav === 'tomorrow') return [{ name: 'tomorrow', kind: 'tomorrow', date: tom, items: live.filter((t) => t.date === tom).sort(byTime), drop: 'date:' + tom }]
  if (nav === 'inbox') return [{ name: 'noDate', kind: 'noDate', items: live.filter((t) => t.path === INBOX_NOTE && t.parent === null && !t.date).sort(byPlace), empty: true }]
  if (nav === 'week') {
    const out: Group[] = []
    for (let i = 0; i < 7; i++) {
      const d = isoPlus(today, i)
      out.push({ name: d, kind: 'day', date: d, items: live.filter((t) => (i === 0 ? t.date !== null && t.date <= d : t.date === d)).sort((a, b) => a.date!.localeCompare(b.date!) || byTime(a, b)), drop: 'date:' + d })
    }
    return out
  }
  // 一篇笔记：照文件里的先后，按 ## 标题分组；勾掉的也列（划掉），子任务不单列
  const path = nav.slice(5)
  const mine = ts.filter((t) => t.path === path && t.parent === null).sort(byPlace)
  const out: Group[] = []
  let cur: (Group & { at: number | null }) | null = null
  for (const t of mine) {
    if (!cur || cur.at !== t.headingLine) {
      cur = { name: t.heading ?? '', kind: t.heading === null ? 'none' : 'heading', items: [], at: t.headingLine }
      out.push(cur)
    }
    cur.items.push(t)
  }
  return out
}

/** 四象限：没做完的按优先级分四格（⏫ 🔼 🔽 没设） */
export function quadOf(ts: readonly TaskView[]): Record<0 | 1 | 2 | 3, TaskView[]> {
  const live = ts.filter((t) => open(t) && listed(t))
  const by = (p: number) => live.filter((t) => t.prio === p).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || byTime(a, b))
  return { 3: by(3), 2: by(2), 1: by(1), 0: by(0) }
}

/** 日历上某一天的：有钟点的画成块，没钟点的放在「全天」那一行；勾掉的也画（淡一点） */
export function dayItems(ts: readonly TaskView[], d: ISODate): { timed: TaskView[]; allDay: TaskView[] } {
  const mine = ts.filter((t) => t.date === d && listed(t) && !t.cancelled)
  return { timed: mine.filter((t) => t.time).sort(byTime), allDay: mine.filter((t) => !t.time).sort((a, b) => Number(a.done) - Number(b.done) || byPlace(a, b)) }
}

/**
 * 日历上画的待办（@cn/calendar 的 CalItem）：有日子、没取消的，勾掉的也画（淡一点）；子任务写了日子的也算。
 * 按文件里的先后交进去（路径、行号），日历里钟点一样、都是全天的时候照这个先后排；repeat 是重复写法怎么说（块下面那行小字）
 */
export function calItems(ts: readonly TaskView[], repeat: (r: string) => string): CalItem[] {
  return ts
    .filter((t) => t.date && !t.cancelled)
    .map((t) => ({ key: t.key, title: t.title, date: t.date!, time: t.time, done: t.done, ...(t.repeat ? { note: repeat(t.repeat) } : {}) }))
}

/**
 * 索引换了一份（外面改了、自己改了）：原来选中的那一条在新的里面是哪条。
 * 先认 🆔；再认同一篇里原文一样的、离原来那行最近的；再认同一篇里标题一样的；都没有返回 null
 */
export function findAgain(old: Pick<TaskView, 'id' | 'path' | 'line' | 'raw' | 'title'>, ts: readonly TaskView[]): TaskView | null {
  if (old.id) {
    const hit = ts.find((t) => t.id === old.id)
    if (hit) return hit
  }
  const near = (list: TaskView[]) => list.sort((a, b) => Math.abs(a.line - old.line) - Math.abs(b.line - old.line))[0] ?? null
  const same = ts.filter((t) => t.path === old.path)
  return near(same.filter((t) => t.raw === old.raw)) ?? near(same.filter((t) => t.title === old.title)) ?? (same.find((t) => t.line === old.line) ?? null)
}

/** 某篇笔记的名字和文件夹 */
export function noteName(s: Snapshot, path: string): string {
  return s.notes.find((n) => n.path === path)?.title ?? path.replace(/^.*\//, '').replace(/\.md$/i, '')
}
