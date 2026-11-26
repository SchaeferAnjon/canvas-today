/**
 * 列表怎么分组、左栏的数（照 v2 原型的 listView / cntToday / cntInbox）。纯函数，界面和菜单栏小窗都用，单元测试在 test/views.test.ts。
 * 一条「没做完」= 没勾、没取消；子任务（挂在别的待办下面的）不单独列，除非它自己写了日子。
 */
import type { CalItem } from '@cn/calendar'
import { byDoneDate, type Prio, diffDays, doneDays, foldersInOrder, isTodoNotePath, type ISODate, notesInOrder, stillListed } from '@cn/tasks'
import type { NoteView, Snapshot, TaskView } from './api'
import { INBOX_NOTE } from './brand'
import { isoPlus } from './when'

export const open = (t: TaskView) => !t.done && !t.cancelled

/**
 * 在日子类的看法（今天、明天、日历、四象限）里列出来的：最上层的，加上自己写了日子的子任务；
 * 抄了好几遍的同一条只列显示的那一份（dupOf 是 null 的）。一篇笔记的看法不用它，那一篇的每一行都列
 */
export const listed = (t: Pick<TaskView, 'parent' | 'date' | 'dupOf'>) => (t.parent === null || t.date !== null) && !t.dupOf

/** all：全部没做完的（含没写日子的），按文件夹、笔记分；done：已完成，按完成那天倒着（和画布笔记左栏「待办」格的「全部」「已完成」同一份规则，@cn/tasks lists.ts） */
export type Nav = 'inbox' | 'today' | 'tomorrow' | 'week' | 'all' | 'done' | `list:${string}`

export interface Group {
  name: string
  /** 名字从哪来：要翻译的键，或者原样（## 标题、日期） */
  kind: 'overdue' | 'today' | 'tomorrow' | 'noDate' | 'day' | 'heading' | 'none' | 'folder' | 'note' | 'doneDay' | 'doneFold'
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
  /** 组名右边的数（不是 items 的条数时：文件夹那一行是它下面没做完的几条） */
  count?: number
  /** 笔记那一组：点组名打开这一篇（name 是路径） */
  note?: string
}

/** 画布笔记自带分类的先后（categories.ts 的 CATEGORIES）：「全部」里文件夹照它排，和画布笔记左栏一样 */
const CATS = ['收件箱', '课程', '阅读', '剪藏', '周记', '写作', '项目', '生活']
const catRank = (folder: string) => {
  const i = CATS.indexOf(folder.split('/')[0]!)
  return i === -1 ? 99 : i
}
export const INBOX_FOLDER = INBOX_NOTE.slice(0, INBOX_NOTE.lastIndexOf('/'))

const byTime = (a: TaskView, b: TaskView) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.path.localeCompare(b.path) || a.line - b.line
const byPlace = (a: TaskView, b: TaskView) => a.path.localeCompare(b.path) || a.line - b.line

export const cntToday = (ts: readonly TaskView[], today: ISODate) => ts.filter((t) => open(t) && listed(t) && t.date !== null && t.date <= today).length
export const cntInbox = (ts: readonly TaskView[]) => ts.filter((t) => open(t) && t.path === INBOX_NOTE && t.parent === null && !t.date).length
export const cntTomorrow = (ts: readonly TaskView[], today: ISODate) => ts.filter((t) => open(t) && listed(t) && t.date === isoPlus(today, 1)).length
export const cntAll = (ts: readonly TaskView[]) => ts.filter((t) => open(t) && listed(t)).length
export const cntWeek = (ts: readonly TaskView[], today: ISODate) => ts.filter((t) => open(t) && listed(t) && t.date !== null && diffDays(t.date, today) < 7).length

/** 一篇里没做完的最上层待办有几条 */
export const cntNote = (ts: readonly TaskView[], path: string) => ts.filter((t) => open(t) && t.path === path && t.parent === null).length

/** 左栏「有待办的笔记」：有没做完的（收件箱那篇除外、只有抄过来的那几份的除外），新改的在前；正开着的那篇没有了也留着 */
export function notesWithTodo(s: Snapshot, keep?: string): NoteView[] {
  // 只有抄过来的那几份没做完的（滴答同步抄进日记的）不算：不然左栏是几十篇日记
  const has = new Set(s.tasks.filter((t) => open(t) && !t.dupOf && t.path !== INBOX_NOTE).map((t) => t.path))
  return s.notes.filter((n) => has.has(n.path) || n.path === keep).sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))
}

/** 今天勾掉的（菜单栏小窗里划掉留在下面、点了能改回；主窗口的「今天」里不再列，勾掉就进「已完成」） */
export const doneTodayOf = (ts: readonly TaskView[], today: ISODate) => ts.filter((t) => t.done && t.doneDate === today && listed(t)).sort(byPlace)

/**
 * just：刚勾掉、还在原处留一行「已完成 · 撤回」的（@cn/tasks JUST_MS，和画布笔记待办同一份规则 stillListed）；
 * 过了就只在「已完成」里（以前「今天」里多一组「今天勾掉的」划线留着，对标清单 U12）
 */
export function groupsOf(nav: Nav, ts: readonly TaskView[], today: ISODate, just?: ReadonlySet<string>): Group[] {
  const tom = isoPlus(today, 1)
  const live = ts.filter((t) => stillListed(t, just) && listed(t))
  if (nav === 'today') {
    const g: Group[] = []
    const od = live.filter((t) => t.date && t.date < today).sort((a, b) => a.date!.localeCompare(b.date!) || byTime(a, b))
    if (od.length) g.push({ name: 'overdue', kind: 'overdue', items: od, red: true })
    g.push({ name: 'today', kind: 'today', date: today, items: live.filter((t) => t.date === today).sort(byTime), drop: 'date:' + today, timeOnly: true })
    g.push({ name: 'tomorrow', kind: 'tomorrow', date: tom, items: live.filter((t) => t.date === tom).sort(byTime), drop: 'date:' + tom, fold: true })
    return g
  }
  if (nav === 'tomorrow') return [{ name: 'tomorrow', kind: 'tomorrow', date: tom, items: live.filter((t) => t.date === tom).sort(byTime), drop: 'date:' + tom }]
  if (nav === 'inbox') return [{ name: 'noDate', kind: 'noDate', items: live.filter((t) => t.path === INBOX_NOTE && t.parent === null && !t.date).sort(byPlace), empty: true }]
  if (nav === 'all') {
    // 文件夹一组（只是组名，数是它下面没做完的），下面每篇笔记一组；收件箱在最前，有「待办」那篇的文件夹在前
    const todoNotes = new Set(ts.filter((t) => isTodoNotePath(t.path)).map((t) => t.path))
    const out: Group[] = []
    for (const f of foldersInOrder(live, { inbox: INBOX_FOLDER, todoNotes, rank: catRank })) {
      out.push({ name: f.folder, kind: 'folder', items: [], count: f.items.length })
      for (const n of notesInOrder(f.items)) out.push({ name: n.path, kind: 'note', items: n.items, note: n.path })
    }
    return out
  }
  if (nav === 'done') return doneDays(ts.filter((t) => t.done && listed(t))).map((g) => ({ name: g.day ?? '', kind: 'doneDay', ...(g.day ? { date: g.day } : {}), items: g.items, done: true }))
  if (nav === 'week') {
    const out: Group[] = []
    for (let i = 0; i < 7; i++) {
      const d = isoPlus(today, i)
      out.push({ name: d, kind: 'day', date: d, items: live.filter((t) => (i === 0 ? t.date !== null && t.date <= d : t.date === d)).sort((a, b) => a.date!.localeCompare(b.date!) || byTime(a, b)), drop: 'date:' + d })
    }
    return out
  }
  // 一篇笔记：没做完的照文件里的先后，按 ## 标题分组，子任务不单列；勾掉的收成最后一行「已完成 N 条 ›」（点开列出来，完成日子倒着），
  // 和画布笔记左栏「按文件夹」里一样（2026-11-24「记得把canvas today也改了」）
  const path = nav.slice(5)
  const all = ts.filter((t) => t.path === path && t.parent === null)
  const mine = all.filter((t) => !t.done || !!just?.has(t.key)).sort(byPlace)
  const out: Group[] = []
  let cur: (Group & { at: number | null }) | null = null
  for (const t of mine) {
    if (!cur || cur.at !== t.headingLine) {
      cur = { name: t.heading ?? '', kind: t.heading === null ? 'none' : 'heading', items: [], at: t.headingLine }
      out.push(cur)
    }
    cur.items.push(t)
  }
  const done = all.filter((t) => t.done && !just?.has(t.key)).sort(byDoneDate)
  if (done.length) out.push({ name: 'doneFold', kind: 'doneFold', items: done, done: true })
  return out
}

/** 四象限：没做完的按优先级分四格（⏫ 🔼 🔽 没设） */
/** 四象限的一格：1 高 ⏫、2 中 🔼、3 低 🔽、4 最低 ⏬；none 是没设优先级的「没分」那一条（2026-11-25 按推荐小改，以前没设的放第 4 格） */
export type QuadKey = 1 | 2 | 3 | 4 | 'none'
export const quadKeyOf = (t: Pick<TaskView, 'prio' | 'lowest'>): QuadKey => (t.prio === 3 ? 1 : t.prio === 2 ? 2 : t.prio === 1 ? (t.lowest ? 4 : 3) : 'none')
/** 拖进这一格要写的优先级（none 是去掉记号） */
export const QUAD_PRIO: Record<QuadKey, { prio: Prio; lowest: boolean }> = {
  1: { prio: 3, lowest: false },
  2: { prio: 2, lowest: false },
  3: { prio: 1, lowest: false },
  4: { prio: 1, lowest: true },
  none: { prio: 0, lowest: false },
}

export function quadOf(ts: readonly TaskView[], just?: ReadonlySet<string>): Record<QuadKey, TaskView[]> {
  const live = ts.filter((t) => stillListed(t, just) && listed(t))
  const by = (k: QuadKey) => live.filter((t) => quadKeyOf(t) === k).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || byTime(a, b))
  return { 1: by(1), 2: by(2), 3: by(3), 4: by(4), none: by('none') }
}

/** 日历上某一天的：有钟点的画成块，没钟点的放在「全天」那一行；勾掉的也画（淡一点） */
export function dayItems(ts: readonly TaskView[], d: ISODate): { timed: TaskView[]; allDay: TaskView[] } {
  const mine = ts.filter((t) => t.date === d && listed(t) && !t.cancelled)
  return { timed: mine.filter((t) => t.time).sort(byTime), allDay: mine.filter((t) => !t.time).sort((a, b) => Number(a.done) - Number(b.done) || byPlace(a, b)) }
}

/**
 * 日历上画的待办（@cn/calendar 的 CalItem）：有日子、没取消的，勾掉的也画（淡一点）；子任务写了日子的也算。
 * 按文件里的先后交进去（路径、行号），日历里钟点一样、都是全天的时候照这个先后排；repeat 是重复写法怎么说（块下面那行小字）；
 * 写了估时（[估时:: 30分钟]）的块画那么长，没写的日历默认一小时
 */
export function calItems(ts: readonly TaskView[], repeat: (r: string) => string): CalItem[] {
  return ts
    .filter((t) => t.date && !t.cancelled && !t.dupOf)
    .map((t) => ({ key: t.key, title: t.title, date: t.date!, time: t.time, done: t.done, ...(t.minutes ? { minutes: t.minutes } : {}), ...(t.repeat ? { note: repeat(t.repeat) } : {}) }))
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

/** 菜单栏小窗「下一件」：今天还没过去的日程（系统日历）或带钟点的待办里最早的一件；正在进行的日程排最前 */
export interface NextUp {
  kind: 'event' | 'task'
  title: string
  /** 「14:00」 */
  time: string
  /** 日程结束的钟点（今天之内；跨到明天的是 null） */
  end: string | null
  /** 日程是哪个日历、待办是哪一篇 */
  from: string
  color: string | null
  /** 还有几分钟开始；正在进行的是 0 */
  inMin: number
  key: string | null
}

const minOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** nowTime：现在的钟点「10:20」；events：这几天的日程（全天的、不在今天的、已经过去的不算） */
export function nextUp(
  ts: readonly TaskView[],
  events: readonly { title: string; calendar: string; color: string; allDay: boolean; start: string; end: string }[],
  today: ISODate,
  nowTime: string,
): NextUp | null {
  const now = minOf(nowTime)
  const out: NextUp[] = []
  for (const e of events) {
    if (e.allDay) continue
    const sd = e.start.slice(0, 10)
    const ed = e.end.slice(0, 10)
    if (sd > today || ed < today) continue
    const start = sd < today ? 0 : minOf(e.start.slice(11, 16))
    const stop = ed > today ? 1440 : minOf(e.end.slice(11, 16))
    if (stop <= now) continue
    out.push({ kind: 'event', title: e.title, time: sd < today ? '00:00' : e.start.slice(11, 16), end: ed > today ? null : e.end.slice(11, 16), from: e.calendar, color: e.color, inMin: Math.max(0, start - now), key: null })
  }
  for (const t of ts) {
    if (!open(t) || !listed(t) || t.date !== today || !t.time || minOf(t.time) < now) continue
    out.push({ kind: 'task', title: t.title, time: t.time, end: null, from: t.path.replace(/^.*\//, '').replace(/\.md$/i, ''), color: null, inMin: minOf(t.time) - now, key: t.key })
  }
  return out.sort((a, b) => a.inMin - b.inMin || (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1))[0] ?? null
}

/** 某篇笔记的名字和文件夹 */
export function noteName(s: Snapshot, path: string): string {
  return s.notes.find((n) => n.path === path)?.title ?? path.replace(/^.*\//, '').replace(/\.md$/i, '')
}
