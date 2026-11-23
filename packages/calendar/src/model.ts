/**
 * 日历要算的（纯函数，不碰 DOM）：连着的几天、一个月按周分几行、某一天有哪些待办和日程、叠在一起的块排成几列、
 * 指到时间格子里是几点、拖放目标的名字。日子一律是写进文件里的那种字符串（2026-11-23），加减用 @cn/tasks。
 * 哪些待办算没做完、子任务列不列、什么算过期，是宿主照 @cn/tasks 的规则定好再交进来的（CalItem）。
 */
import { addDays, daysInMonth, hhmm, type ISODate, minutesOf, weekday } from '@cn/tasks'

/** 一周从哪天排起：0 周日（画布今日，照原型），1 周一（画布笔记待办首页，照 18-待办首页 原型） */
export type WeekStart = 0 | 1

/** 一条待办在日历上的样子 */
export interface CalItem {
  /** 宿主认它的名字：拖的时候 data-drag 就是它，onPick / 选中也用它 */
  key: string
  title: string
  date: ISODate
  /** 「15:00」；没有钟点的画在「全天」那一行 */
  time?: string | null
  /** 块多长（分钟），默认 60 */
  minutes?: number
  done?: boolean
  /** 块下面那行小字，跟在钟点后面（「每周日」） */
  note?: string
  /** 月看法里名字前一个小圆点的颜色（画布笔记数据库的日历：状态在哪一组，「var(--green)」）；不给就没有点 */
  dot?: string
}

/** 系统日历里的一个日程（只读）。全天的 start、end 是那几天（都含）；定时的是本地钟点「2026-11-23T09:30」 */
export interface CalEvent {
  id: string
  title: string
  /** 哪个日历（「工作」） */
  calendar: string
  /** 那个日历的颜色「#4F7CAC」 */
  color: string
  allDay: boolean
  start: string
  end: string
}

/** 还没定下来的块：虚线框（AI 排的，收下才写进库） */
export interface CalGhost {
  key: string
  title: string
  date: ISODate
  /** 空的：只改了日子、没有钟点，画在「全天」那一行 */
  time: string
  minutes?: number
  /** 块下面那行小字（「12:00 · Claude Code 排的」） */
  note: string
}

export const DEFAULT_MINUTES = 60

/** anchor 起连着 n 天 */
export const daysFrom = (anchor: ISODate, n = 7): ISODate[] => Array.from({ length: n }, (_, i) => addDays(anchor, i))

/** 那个月的第一天：「2026-11-01」 */
export const monthStart = (d: string): ISODate => `${d.slice(0, 7)}-01`

/** 加几个月，返回那个月的第一天 */
export function shiftMonth(d: string, n: number): ISODate {
  const m = Number(d.slice(5, 7)) - 1 + n
  const y = Number(d.slice(0, 4)) + Math.floor(m / 12)
  return `${y}-${String((((m % 12) + 12) % 12) + 1).padStart(2, '0')}-01`
}

/** 一个月的格子按周分行，前后补邻月的几天；minWeeks：至少几行（待办首页的小月历固定 6 行，切月份时高度不跳） */
export function monthWeeks(month: string, weekStart: WeekStart = 0, minWeeks = 0): ISODate[][] {
  const first = monthStart(month)
  const lead = (weekday(first) - weekStart + 7) % 7
  const n = daysInMonth(Number(first.slice(0, 4)), Number(first.slice(5, 7)))
  const weeks = Math.max(minWeeks, Math.ceil((lead + n) / 7))
  const start = addDays(first, -lead)
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)))
}

/** 一周七天的星期几，照 weekStart 排（表头用） */
export const weekOrder = (weekStart: WeekStart): number[] => Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7)

/** 稳定排序：先按 key 比，比不出来保持宿主给的先后 */
function stable<T>(xs: readonly T[], cmp: (a: T, b: T) => number): T[] {
  return xs
    .map((x, i) => [x, i] as const)
    .sort((a, b) => cmp(a[0], b[0]) || a[1] - b[1])
    .map(([x]) => x)
}

/** 某一天的待办：有钟点的（按钟点）和全天的（做完的在后）；宿主给的先后是平手时的顺序 */
export function itemsOn(items: readonly CalItem[], d: ISODate): { timed: CalItem[]; allDay: CalItem[] } {
  const mine = items.filter((x) => x.date === d)
  return {
    timed: stable(
      mine.filter((x) => x.time),
      (a, b) => a.time!.localeCompare(b.time!),
    ),
    allDay: stable(
      mine.filter((x) => !x.time),
      (a, b) => Number(!!a.done) - Number(!!b.done),
    ),
  }
}

/** 月格子里一天的待办：没做完的在前，有钟点的按钟点排在没钟点的前面 */
export function monthItemsOn(items: readonly CalItem[], d: ISODate): CalItem[] {
  return stable(
    items.filter((x) => x.date === d),
    (a, b) => Number(!!a.done) - Number(!!b.done) || (a.time ?? '99').localeCompare(b.time ?? '99'),
  )
}

/** 一个日程在某一天占的那一段（分钟，0–1440）；跨天的按这一天截 */
export interface EventSpan {
  ev: CalEvent
  from: number
  to: number
}

/** 某一天的日程：全天的，和定时的那几段（跨午夜的截成每天一段；正好在零点结束的不算到后一天） */
export function eventsOn(evs: readonly CalEvent[], d: ISODate): { allDay: CalEvent[]; timed: EventSpan[] } {
  const allDay = evs.filter((e) => e.allDay && e.start.slice(0, 10) <= d && d <= e.end.slice(0, 10))
  const timed: EventSpan[] = []
  for (const ev of evs) {
    if (ev.allDay) continue
    const sd = ev.start.slice(0, 10)
    const ed = ev.end.slice(0, 10)
    if (d < sd || d > ed) continue
    const from = d === sd ? minutesOf(ev.start.slice(11, 16)) : 0
    const to = d === ed ? minutesOf(ev.end.slice(11, 16)) : 1440
    if (d === ed && d !== sd && to === 0) continue
    timed.push({ ev, from, to: Math.max(to, from + 15) })
  }
  timed.sort((a, b) => a.from - b.from || b.to - a.to)
  return { allDay, timed }
}

/** 这一天有没有日程（月格子、小月历的点） */
export const hasEvents = (evs: readonly CalEvent[], d: ISODate): boolean => {
  const e = eventsOn(evs, d)
  return e.allDay.length > 0 || e.timed.length > 0
}

/** 日程块下面那行的钟点：跨天截出来的那一段从 0:00 起的也照写开始的钟点 */
export const eventTime = (s: EventSpan): string => hhmm(s.from)

export interface Span {
  id: string
  from: number
  to: number
}

/**
 * 一天里叠在一起的块排成几列（照日历软件）：互相叠着的一串里，每块放进最左边空出来的那一列，这一串一共几列就各占几分之一宽。
 * 不叠的块是 1 列（宿主照旧占满整格）
 */
export function columns(spans: readonly Span[]): Map<string, { col: number; cols: number }> {
  const out = new Map<string, { col: number; cols: number }>()
  const sorted = [...spans].sort((a, b) => a.from - b.from || b.to - a.to)
  let group: { id: string; col: number }[] = []
  let ends: number[] = []
  let groupEnd = -Infinity
  const flush = () => {
    for (const g of group) out.set(g.id, { col: g.col, cols: ends.length })
    group = []
    ends = []
    groupEnd = -Infinity
  }
  for (const s of sorted) {
    if (group.length && s.from >= groupEnd) flush()
    let col = ends.findIndex((e) => e <= s.from)
    if (col < 0) {
      col = ends.length
      ends.push(s.to)
    } else ends[col] = s.to
    group.push({ id: s.id, col })
    groupEnd = Math.max(groupEnd, s.to)
  }
  if (group.length) flush()
  return out
}

/** 待办块在格子里画多长：默认一小时，到午夜为止 */
export const itemSpan = (x: Pick<CalItem, 'time' | 'minutes'>): { from: number; to: number } => {
  const from = minutesOf(x.time!)
  return { from, to: Math.min(1440, from + (x.minutes ?? DEFAULT_MINUTES)) }
}

/** 指到时间格子里 y 处是几点：半小时一格，0:00–23:30（top 是那一列的上沿，hp 是一小时多高） */
export function slotAt(y: number, top: number, hp: number, h0 = 0): string {
  let m = h0 * 60 + (Math.round(((y - top) / hp) * 2) / 2) * 60
  m = Math.max(0, Math.min(24 * 60 - 30, m))
  return hhmm(m)
}

/**
 * 拖放目标的名字（data-drop 的值，「种类:值」）。日历这里用的几种：
 *   day:2026-11-25      周看法里按钟点的那一列：放下改到那天、指到的那个钟点（slotAt 算）
 *   allday:2026-11-25   周看法「全天」那一行：改到那天、拿掉钟点
 *   mday:2026-11-25     月看法的一格：只改日子，钟点不变
 *   date:2026-11-25     待办首页的周格子、月格子：只改日子，钟点不变
 * 宿主自己的目标（清单、四象限……）照这个写法随便起名，useDragDrop 一律交给宿主的 onDrop
 */
export function parseDrop(s: string): { kind: string; value: string } {
  const i = s.indexOf(':')
  return i < 0 ? { kind: s, value: '' } : { kind: s.slice(0, i), value: s.slice(i + 1) }
}
