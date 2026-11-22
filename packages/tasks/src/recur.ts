/**
 * 重复（🔁 后面写的中文）：每天、每N天、工作日、每周（几）、每N周、每月、每月N日、每年；后面加「（做完后）」从勾掉那天算。
 * 勾掉一条重复的：这一行打 ✅，下面（它的子任务后面）照规则加新的一行，子任务抄一份都没勾，编号换新的。
 */
import { addDays, addMonths, dayOfMonth, type ISODate, toDays, weekday } from './dates'
import { removeField, setDate, setDone, setId } from './edit'
import { blockOf, editLine, insertLines, lineAt, splitLines } from './file'
import { parseTaskLine } from './line'

export type RepeatKind = 'day' | 'workday' | 'week' | 'weekdays' | 'month' | 'monthday' | 'year'

export interface Repeat {
  kind: RepeatKind
  every: number
  /** 每周几：0 是周日 */
  days?: number[]
  /** 每月几日 */
  monthday?: number
  afterDone: boolean
}

const WD = '日一二三四五六'
const WD_OF: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
/** 一周从周一排到周日（「每周六、日」） */
export const monFirst = (a: number, b: number) => ((a + 6) % 7) - ((b + 6) % 7)

export function parseRepeat(raw: string): Repeat | null {
  let s = raw.replace(/\s+/g, '')
  let afterDone = false
  const d = /[（(]做完后[）)]$/.exec(s)
  if (d) {
    afterDone = true
    s = s.slice(0, d.index)
  }
  let m: RegExpExecArray | null
  if (s === '每天' || s === '每日') return { kind: 'day', every: 1, afterDone }
  if ((m = /^每(\d{1,3})天$/.exec(s))) return { kind: 'day', every: Number(m[1]), afterDone }
  if (s === '工作日' || s === '每个工作日') return { kind: 'workday', every: 1, afterDone }
  if (s === '每周' || s === '每星期') return { kind: 'week', every: 1, afterDone }
  if ((m = /^每(\d{1,3})周$/.exec(s))) return { kind: 'week', every: Number(m[1]), afterDone }
  if ((m = /^每(?:周|星期)([一二三四五六日天](?:[、,，]?[一二三四五六日天])*)$/.exec(s))) {
    const days = [...new Set([...m[1]!.replace(/[、,，]/g, '')].map((c) => WD_OF[c]!))].sort(monFirst)
    return { kind: 'weekdays', every: 1, days, afterDone }
  }
  if (s === '每月' || s === '每个月') return { kind: 'month', every: 1, afterDone }
  if ((m = /^每(\d{1,2})个?月$/.exec(s))) return { kind: 'month', every: Number(m[1]), afterDone }
  if ((m = /^每月(\d{1,2})[日号]$/.exec(s)) && Number(m[1]) >= 1 && Number(m[1]) <= 31) return { kind: 'monthday', every: 1, monthday: Number(m[1]), afterDone }
  if (s === '每年') return { kind: 'year', every: 1, afterDone }
  return null
}

export function formatRepeat(r: Repeat): string {
  const tail = r.afterDone ? '（做完后）' : ''
  switch (r.kind) {
    case 'day':
      return (r.every === 1 ? '每天' : `每${r.every}天`) + tail
    case 'workday':
      return '工作日' + tail
    case 'week':
      return (r.every === 1 ? '每周' : `每${r.every}周`) + tail
    case 'weekdays':
      return '每周' + r.days!.map((d) => WD[d]).join('、') + tail
    case 'month':
      return (r.every === 1 ? '每月' : `每${r.every}个月`) + tail
    case 'monthday':
      return `每月${r.monthday}日` + tail
    case 'year':
      return '每年' + tail
  }
}

/** 从 base 往后，规则里的下一天（不含 base） */
function after(r: Repeat, base: ISODate): ISODate {
  switch (r.kind) {
    case 'day':
      return addDays(base, r.every)
    case 'workday': {
      let d = addDays(base, 1)
      while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1)
      return d
    }
    case 'week':
      return addDays(base, 7 * r.every)
    case 'weekdays': {
      let d = addDays(base, 1)
      for (let i = 0; i < 7 && !r.days!.includes(weekday(d)); i++) d = addDays(d, 1)
      return d
    }
    case 'month':
      return addMonths(base, r.every)
    case 'monthday': {
      const y = Number(base.slice(0, 4))
      const m = Number(base.slice(5, 7))
      const here = dayOfMonth(y, m, r.monthday!)
      if (toDays(here) > toDays(base)) return here
      const n = addMonths(`${y}-${String(m).padStart(2, '0')}-01`, 1)
      return dayOfMonth(Number(n.slice(0, 4)), Number(n.slice(5, 7)), r.monthday!)
    }
    case 'year': {
      const y = Number(base.slice(0, 4)) + r.every
      return dayOfMonth(y, Number(base.slice(5, 7)), Number(base.slice(8, 10)))
    }
  }
}

/**
 * 下一次是哪天。due：这一条原来的日子（没写是 null）；done：勾掉那天。
 * 照原来的日子往后排；过期好几次的跳到今天以后（不留一串过期的）；没写日子、（做完后）的从勾掉那天算
 */
export function nextDate(r: Repeat, due: ISODate | null, done: ISODate): ISODate {
  if (r.afterDone || !due) return after(r, done)
  let d = after(r, due)
  for (let i = 0; i < 10_000 && toDays(d) <= toDays(done); i++) d = after(r, d)
  return d
}

/**
 * 勾掉第 line 行那一条。重复的：下面加新的一行（next 是新的那行和它的日子）。
 * newId 给新的一行发编号（原来有编号才用）
 */
export function completeTask(text: string, line: number, today: ISODate, newId: () => string): { text: string; next?: { line: number; date: ISODate } } {
  const raw = lineAt(text, line)
  const t = raw === undefined ? null : parseTaskLine(raw)
  if (!t) throw new Error(`第 ${line + 1} 行不是待办`)
  const done = editLine(text, line, (l) => setDone(l, true, today))
  const rule = !t.done && t.repeat ? parseRepeat(t.repeat) : null
  if (!rule) return { text: done }
  const date = nextDate(rule, t.date, today)
  const b = blockOf(text, line)
  const rows = splitLines(text)
    .slice(b.from, b.to + 1)
    .map((l, i) => {
      let r = l.endsWith('\r') ? l.slice(0, -1) : l
      if (i === 0) r = r.replace(/^﻿/, '')
      if (!parseTaskLine(r)) return r
      r = removeField(setDone(r, false, today), 'done')
      if (i === 0) {
        r = setDate(r, date)
        if (t.id) r = setId(r, newId())
      }
      return r
    })
  return { text: insertLines(done, b.to, rows), next: { line: b.to + 1, date } }
}
