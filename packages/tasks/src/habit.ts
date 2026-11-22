/**
 * 习惯打卡（v2 原型「习惯」，存法照设计页的存法表）：一个习惯一篇 md，放在库里的 习惯/ 下面（只认直接放在这一层的），名字是文件名。
 *   ---
 *   重复: 每周一、三、五      （和 🔁 一样的写法：每天、工作日、每周几、每N天、每月N日……；不写是每天）
 *   开始: 2026-11-16          （每N天、每N周从这天数；不写用最早打卡那天）
 *   ---
 *   # 跑步
 *
 *   - 2026-11-16 ✓
 *   - 2026-11-18 ✓
 * 打卡就是末尾加一行「- 2026-11-22 ✓」，取消是拿掉那一天的行，别的字节一个不动。两台设备同一天都打卡时，库根目录的 .gitattributes
 * 给 习惯/ 设了 union 合并（HABIT_ATTR），两行都留，读的时候按日子去重。画布今日、画布笔记、iPad 版都照这里读写。
 */
import { addDays, daysInMonth, diffDays, type ISODate, isISODate, weekday } from './dates'
import { parseRepeat, type Repeat } from './recur'

export const HABIT_DIR = '习惯'

/** .gitattributes 里那一行：两台设备同一天都打了卡，合并时两行都留（读的时候去重） */
export const HABIT_ATTR = `${HABIT_DIR}/*.md merge=union`

/** 新建习惯时能选的重复 */
export const HABIT_RULES = ['每天', '工作日', '每周一、三、五', '每周二、四', '每周六、日', '每2天', '每3天']

export interface Habit {
  path: string
  /** 文件名 */
  name: string
  /** 「重复:」写的（不写是「每天」） */
  rule: string
  /** 「开始:」，不写用最早打卡那天；都没有是 null */
  start: ISODate | null
  /** 打过卡的日子，去重、从早到晚 */
  checks: ISODate[]
}

export const isHabitPath = (path: string): boolean => path.startsWith(HABIT_DIR + '/') && !path.slice(HABIT_DIR.length + 1).includes('/') && path.toLowerCase().endsWith('.md')

const nameOf = (path: string) => path.replace(/^.*\//, '').replace(/\.md$/i, '')

const FM = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** 开头属性里的一项（只认一行的「键: 值」） */
function propOf(text: string, key: string): string | null {
  const m = FM.exec(text)
  if (!m) return null
  for (const l of m[1]!.split(/\r?\n/)) {
    const p = /^([^:#\s][^:]*?):[ \t]*(.*?)[ \t]*$/.exec(l)
    if (p && p[1] === key) return p[2]!.replace(/^["'](.*)["']$/, '$1')
  }
  return null
}

/** 打卡那一行：「- 2026-11-22 ✓」，后面跟什么字都算（* 开头也认）；缩进的也认 */
const CHECK = /^\s*[-*+]\s+(\d{4}-\d{2}-\d{2})(?=\s|$)/

export function parseHabit(path: string, text: string): Habit {
  const days = new Set<string>()
  for (const l of text.split('\n')) {
    const m = CHECK.exec(l)
    if (m && isISODate(m[1]!)) days.add(m[1]!)
  }
  const checks = [...days].sort()
  const s = propOf(text, '开始')
  const rule = propOf(text, '重复')?.trim() || '每天'
  return { path, name: nameOf(path), rule, start: s && isISODate(s) ? s : (checks[0] ?? null), checks }
}

/** 新建一篇习惯 */
export function newHabit(name: string, rule: string, today: ISODate): string {
  return `---\n重复: ${rule}\n开始: ${today}\n---\n# ${name}\n\n`
}

const eolOf = (text: string) => (/\r\n/.test(text) ? '\r\n' : '\n')

/** 打卡：末尾加一行「- 日子 ✓」（这一天已经有了就原样） */
export function checkIn(text: string, date: ISODate): string {
  if (parseHabit('', text).checks.includes(date)) return text
  const eol = eolOf(text)
  const base = text === '' || text.endsWith('\n') ? text : text + eol
  return `${base}- ${date} ✓${eol}`
}

/** 取消打卡：那一天的行都拿掉 */
export function uncheck(text: string, date: ISODate): string {
  const lines = text.split(/(?<=\n)/)
  return lines.filter((l) => CHECK.exec(l)?.[1] !== date).join('')
}

/** 改重复：只换「重复:」那一行；没有就加在属性里，没有属性就在最前面加一段 */
export function setHabitRule(text: string, rule: string): string {
  const eol = eolOf(text)
  const m = FM.exec(text)
  if (!m) return `---${eol}重复: ${rule}${eol}---${eol}${text}`
  const lines = m[1]!.split(/\r?\n/)
  const i = lines.findIndex((l) => /^重复:/.test(l))
  if (i >= 0) lines[i] = `重复: ${rule}`
  else lines.push(`重复: ${rule}`)
  const end = m[0].endsWith('\n') ? (m[0].endsWith('\r\n') ? '\r\n' : '\n') : ''
  return `---${eol}${lines.join(eol)}${eol}---${end}${text.slice(m[0].length)}`
}

/** 这一天该不该打卡（start 之前的不算；start 是 null 就从来都算） */
export function habitDue(r: Repeat | null, start: ISODate | null, d: ISODate): boolean {
  if (start && d < start) return false
  if (!r) return true
  const from = start ?? d
  const wd = weekday(d)
  switch (r.kind) {
    case 'day':
      return diffDays(d, from) % r.every === 0
    case 'workday':
      return wd >= 1 && wd <= 5
    case 'weekdays':
      return (r.days ?? []).includes(wd)
    case 'week': {
      const n = diffDays(d, from)
      return n % 7 === 0 && (n / 7) % r.every === 0
    }
    case 'monthday': {
      const y = Number(d.slice(0, 4))
      const m = Number(d.slice(5, 7))
      return Number(d.slice(8, 10)) === Math.min(r.monthday!, daysInMonth(y, m))
    }
    case 'month': {
      const y = Number(d.slice(0, 4))
      const m = Number(d.slice(5, 7))
      const months = (y - Number(from.slice(0, 4))) * 12 + m - Number(from.slice(5, 7))
      return months % r.every === 0 && Number(d.slice(8, 10)) === Math.min(Number(from.slice(8, 10)), daysInMonth(y, m))
    }
    case 'year':
      return d.slice(5) === from.slice(5)
  }
}

export type HabitDayState = 'done' | 'miss' | 'rest'

/** 某一天：打了卡（不管该不该）、该打没打、不用打 */
export function habitDay(h: Habit, d: ISODate): HabitDayState {
  if (h.checks.includes(d)) return 'done'
  return habitDue(parseRepeat(h.rule), h.start, d) ? 'miss' : 'rest'
}

/** 最近七天（照原型）：前六天每天什么样，今天是打了、还没打（该打）、还是休 */
export function habitWeek(h: Habit, today: ISODate): { days: { date: ISODate; state: HabitDayState }[]; today: 'done' | 'open' | 'rest' } {
  const days = Array.from({ length: 6 }, (_, i) => addDays(today, i - 6)).map((date) => ({ date, state: habitDay(h, date) }))
  const t = habitDay(h, today)
  return { days, today: t === 'done' ? 'done' : t === 'miss' ? 'open' : 'rest' }
}

/** 连续几次：从今天（打了）或昨天往回数该打的日子，打了就加一，遇到该打没打的停；不用打的日子跳过，开始之前停 */
export function streakOf(h: Habit, today: ISODate): number {
  const r = parseRepeat(h.rule)
  const done = new Set(h.checks)
  let n = 0
  let d = done.has(today) ? today : addDays(today, -1)
  for (let i = 0; i < 3700; i++, d = addDays(d, -1)) {
    if (h.start && d < h.start) break
    if (done.has(d)) n++
    else if (habitDue(r, h.start, d)) break
  }
  return n
}
