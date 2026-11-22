/**
 * 「导入提醒事项」：把系统提醒事项里的列表一次搬进库（规格 05-任务软件 7-import）。
 * 每个列表写成一篇 收件箱/从提醒事项/<列表名>.md，一条一行，行尾照定好的写法：
 *   - [ ] 交水电费 📅 2026-11-25 15:00 🔔 提前1小时 🔁 每月25日 ⏫
 * 对不上的（每月最后一个周五这种重复、到地点时提醒、好几个闹钟）写进下一行缩进的引用（备注也写在那里），不硬换。
 * EventKit 读不出谁是谁的子任务（搬成并列的几条），也读不到图片附件和标签：先给你看时写明白（界面那一侧）。
 */
import { addDays, addMinutes, minutesOf } from './dates'
import { newTaskLine, setDone } from './edit'
import { appendLines } from './file'
import { cleanTitle, parseDue, prioFromEK, type RemAlarm, UNTITLED } from './mirror'
import { monFirst } from './recur'
import { ALL_DAY_AT, formatRemind } from './remind'

/** EventKit 的重复规则（EKRecurrenceRule 照搬成数据） */
export interface RecurRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  /** 星期几：day 1 是周日 … 7 是周六（EKWeekday）；week 0 是每周，n 是第 n 个，-1 是最后一个 */
  days?: { day: number; week: number }[]
  /** 几号：-1 是最后一天 */
  monthDays?: number[]
  months?: number[]
  setPositions?: number[]
  end?: { date?: string; count?: number }
}

/** 提醒事项里要搬的一条 */
export interface ImportItem {
  rid: string
  title: string
  notes: string | null
  url: string | null
  /** 「2026-11-23 15:00」或「2026-11-23」 */
  due: string | null
  completed: boolean
  completedAt: string | null
  priority: number
  alarms: RemAlarm[]
  rules: RecurRule[]
  created: number
}

const WD = '日一二三四五六'
const UNNAMED = '没有名字的列表'

const safeName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .trim() || UNNAMED

/** 一个列表写成哪一篇 */
export const importPath = (listName: string): string => `收件箱/从提醒事项/${safeName(listName)}.md`

/** 能对上我们写法的重复：给 🔁 后面的中文；对不上返回 null */
export function repeatFromRule(r: RecurRule): string | null {
  if (r.setPositions?.length) return null
  const n = r.interval > 1 ? r.interval : 1
  const days = r.days ?? []
  const md = r.monthDays ?? []
  if (r.months?.length && r.freq !== 'yearly') return null
  switch (r.freq) {
    case 'daily':
      if (days.length || md.length) return null
      return n === 1 ? '每天' : `每${n}天`
    case 'weekly': {
      if (md.length) return null
      if (!days.length) return n === 1 ? '每周' : `每${n}周`
      if (n !== 1 || days.some((d) => d.week !== 0 || d.day < 1 || d.day > 7)) return null
      const ds = [...new Set(days.map((d) => d.day - 1))].sort(monFirst)
      if (ds.length === 5 && [1, 2, 3, 4, 5].every((x) => ds.includes(x))) return '工作日'
      return '每周' + ds.map((d) => WD[d]).join('、')
    }
    case 'monthly':
      if (days.length) return null
      if (!md.length) return n === 1 ? '每月' : `每${n}个月`
      if (n !== 1 || md.length !== 1 || md[0]! < 1 || md[0]! > 31) return null
      return `每月${md[0]}日`
    case 'yearly':
      if (days.length || md.length || r.months?.length || n !== 1) return null
      return '每年'
  }
}

/** 原来的重复用中文说出来（对不上时写进备注） */
export function describeRule(r: RecurRule): string {
  const n = r.interval > 1 ? r.interval : 1
  const head = { daily: n === 1 ? '每天' : `每${n}天`, weekly: n === 1 ? '每周' : `每${n}周`, monthly: n === 1 ? '每月' : `每${n}个月`, yearly: n === 1 ? '每年' : `每${n}年` }[r.freq]
  const parts: string[] = []
  if (r.months?.length) parts.push(r.months.map((m) => `${m}月`).join('、'))
  if (r.monthDays?.length) parts.push(r.monthDays.map((d) => (d === -1 ? '最后一天' : d < 0 ? `倒数第${-d}天` : `${d}日`)).join('、'))
  if (r.days?.length) parts.push(r.days.map((d) => (d.week === 0 ? '' : d.week === -1 ? '最后一个' : d.week < 0 ? `倒数第${-d.week}个` : `第${d.week}个`) + '周' + (WD[d.day - 1] ?? '?')).join('、'))
  let s = head + (parts.length ? (r.freq === 'weekly' && n > 1 ? '的' : '') + parts.join('') : '')
  if (r.setPositions?.length) s += `（取第${r.setPositions.join('、')}个）`
  return s
}

/**
 * 闹钟换成 🔔（只留最早的一个）：和到期同一刻是「准时」，早几分钟 / 小时 / 天是「提前…」，在前一天别的钟点是「前一天20:00」；
 * 只有日子的到期 + 当天几点的闹钟：日子后面写上那个钟点、「准时」（到点还是那个钟点响）；没有到期只有闹钟：闹钟那天那个钟点当到期。
 * 到地点时提醒（画布今日不做）写进备注
 */
export function remindFromAlarms(due: { date: string; time: string | null } | null, alarms: RemAlarm[]): { date: string | null; time: string | null; remind: string | null; notes: string[] } {
  const notes: string[] = []
  for (const a of alarms) if ('place' in a) notes.push(`原来是到「${a.place}」时提醒`)
  const date = due?.date ?? null
  const time = due?.time ?? null
  const dueAt = date ? `${date}T${time ?? ALL_DAY_AT}` : null
  // 每个闹钟算成本地钟点；相对的没有到期可比就算不出
  const timed = alarms
    .filter((a): a is { at: string } | { offset: number } => !('place' in a))
    .map((a) => ('at' in a ? { at: a.at, rel: null as number | null } : dueAt ? { at: addMinutes(dueAt, Math.round(a.offset / 60)), rel: a.offset } : null))
    .filter((a): a is { at: string; rel: number | null } => a !== null)
  if (!timed.length) return { date, time, remind: null, notes }
  if (timed.length > 1) notes.push(`原来有${timed.length}个闹钟，只留了最早的一个`)
  const first = [...timed].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))[0]!
  if (!date) return { date: first.at.slice(0, 10), time: first.at.slice(11, 16), remind: '准时', notes }
  if (first.rel !== null) {
    if (first.rel > 0) {
      notes.push(`原来的闹钟在到期之后${Math.round(first.rel / 60)}分钟`)
      return { date, time, remind: '准时', notes }
    }
    return { date, time, remind: formatRemind({ kind: 'before', minutes: Math.round(-first.rel / 60) }), notes }
  }
  const day = first.at.slice(0, 10)
  const clock = first.at.slice(11, 16)
  if (!time && day === date) return { date, time: clock === ALL_DAY_AT ? null : clock, remind: '准时', notes }
  const before = (toMin(dueAt!) - toMin(first.at)) | 0
  if (before < 0) {
    notes.push(`原来的闹钟在到期之后（${first.at.replace('T', ' ')}）`)
    return { date, time, remind: '准时', notes }
  }
  if (day === addDays(date, -1) && before % 1440 !== 0) return { date, time, remind: `前一天${clock}`, notes }
  return { date, time, remind: formatRemind({ kind: 'before', minutes: before }), notes }
}

/** 本地钟点「2026-11-23T15:00」→ 从 1970 年起的第几分钟（只拿来相减） */
function toMin(at: string): number {
  const [y, m, d] = at.slice(0, 10).split('-').map(Number) as [number, number, number]
  return Math.round(Date.UTC(y, m - 1, d) / 60_000) + minutesOf(at.slice(11, 16))
}

/** 网址进 Markdown 链接：空白和括号要转一下 */
const safeUrl = (u: string) => u.trim().replace(/\s/g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')

export interface ImportLines {
  lines: string[]
  /** 重复对不上、写进了备注 */
  recurNote: boolean
  /** 原来是到地点提醒 */
  place: boolean
  /** 原来有好几个闹钟 */
  multiAlarm: boolean
  /** 没做完、带 🔔（会镜像进提醒事项的） */
  reminded: boolean
}

/**
 * 一条写成一行（加上下面缩进的备注行）。newId：带 🔔、没做完的那条导入时就给 🆔（镜像进提醒事项要它；
 * 导入时写好，之后同步不用再改这一篇，导入那一次能干净地撤回）
 */
export function importLines(item: ImportItem, newId?: () => string): ImportLines {
  const due = item.due ? parseDue(item.due) : null
  const rem = remindFromAlarms(due, item.alarms)
  const extra = [...rem.notes]
  let repeat: string | null = null
  let recurNote = false
  const rule = item.rules[0]
  if (rule) {
    repeat = repeatFromRule(rule)
    if (!repeat) {
      extra.push(`原来的重复：${describeRule(rule)}`)
      recurNote = true
    }
    if (rule.end?.date) extra.push(`原来的重复到 ${rule.end.date} 为止`)
    else if (rule.end?.count) extra.push(`原来的重复只重复${rule.end.count}次`)
    if (item.rules.length > 1) extra.push(`原来有${item.rules.length}条重复规则，只搬了第一条`)
  }
  let title = cleanTitle(item.title) || UNTITLED
  if (item.url) title += ` [链接](${safeUrl(item.url)})`
  const reminded = !item.completed && !!rem.remind && !!rem.date
  let line = newTaskLine({ title, date: rem.date, time: rem.time, remind: rem.remind, repeat, prio: prioFromEK(item.priority), id: reminded && newId ? newId() : null })
  if (item.completed) line = item.completedAt ? setDone(line, true, item.completedAt.slice(0, 10)) : line.replace('- [ ]', '- [x]')
  const notes = (item.notes ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '')
  const quote = [...(notes ? notes.split('\n') : []), ...extra].map((l) => (l.trim() ? `    > ${l.trimEnd()}` : '    >'))
  return { lines: [line, ...quote], recurNote, place: item.alarms.some((a) => 'place' in a), multiAlarm: item.alarms.filter((a) => !('place' in a)).length > 1, reminded }
}

/** 搬的先后：没做完的在前（有日子的按日子、钟点，没日子的在后，再按建的先后），已完成的在最后（按勾掉的先后） */
function order(a: ImportItem, b: ImportItem): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1
  if (a.completed) return (a.completedAt ?? '').localeCompare(b.completedAt ?? '') || a.created - b.created
  const da = a.due ?? '￿'
  const db = b.due ?? '￿'
  return da < db ? -1 : da > db ? 1 : a.created - b.created
}

export interface ImportFile {
  path: string
  text: string
  count: number
  /** 这一篇原来没有 */
  isNew: boolean
  /** 写进去的那几行（先给你看用） */
  lines: string[]
  recurNotes: number
  places: number
  multiAlarms: number
  /** 没做完、带 🔔 的几条（会镜像进提醒事项） */
  reminded: number
}

/** 一个列表写成一篇：原来没有就新建（标题是列表名），有了就加在最后一条待办后面，原来的字一个不动；newId 见 importLines */
export function importFile(listName: string, items: ImportItem[], existing: string | null, newId?: () => string): ImportFile {
  const path = importPath(listName)
  const rows = [...items].sort(order).map((i) => importLines(i, newId))
  const lines = rows.flatMap((r) => r.lines)
  const head = existing ?? `# ${listName.replace(/[\r\n]+/g, ' ').trim() || UNNAMED}\n\n`
  const text = lines.length ? appendLines(head, lines).text : head
  return {
    path,
    text,
    count: items.length,
    isNew: existing === null,
    lines,
    recurNotes: rows.filter((r) => r.recurNote).length,
    places: rows.filter((r) => r.place).length,
    multiAlarms: rows.filter((r) => r.multiAlarm).length,
    reminded: rows.filter((r) => r.reminded).length,
  }
}
