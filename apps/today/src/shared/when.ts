/** 日子怎么说（界面上的，照原型）：今天、明天、昨天、一周以内说周几，再远说「11月25日」。写进文件的照旧是 2026-11-25 */
import { diffDays, type ISODate, pad, weekday } from '@cn/tasks'
import { type Lang, tr, wdName } from './i18n'

const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 本地的「今天」 */
export function isoOf(ms: number): ISODate {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 本地的现在「2026-11-22T16:05」（写时间：只写了钟点、今天已经过了的算明天，task-pd289） */
export function localNowOf(ms: number): string {
  const d = new Date(ms)
  return `${isoOf(ms)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 本地钟点「2026-11-23T14:00:05」 */
export function localStamp(ms: number): string {
  const d = new Date(ms)
  return `${isoOf(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 本地钟点「09:05」（对话菜单里一段的时间：和画布笔记一样写「今天 13:18」「周一 10:42」） */
export function clockOf(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function mdLabel(lang: Lang, d: ISODate): string {
  const m = Number(d.slice(5, 7))
  const day = Number(d.slice(8, 10))
  return lang === 'zh' ? `${m}月${day}日` : `${EN_MON[m - 1]} ${day}`
}

export function dayLabel(lang: Lang, d: ISODate, today: ISODate): string {
  const n = diffDays(d, today)
  if (n === 0) return tr(lang, 'today')
  if (n === 1) return tr(lang, 'tomorrow')
  if (n === -1) return tr(lang, 'yesterday')
  if (Math.abs(n) < 7) return wdName(lang, weekday(d))
  return mdLabel(lang, d)
}

/** 「明天 15:00」「周二 20:00」「今天」 */
export function whenLabel(lang: Lang, t: { date: string | null; time: string | null }, today: ISODate): string {
  if (!t.date) return t.time ?? ''
  return dayLabel(lang, t.date, today) + (t.time ? ' ' + t.time : '')
}

/** 今天之后的那个周一（今天是周日就是明天），详情里「下周一」那一格 */
export function nextMonday(today: ISODate): ISODate {
  const w = weekday(today)
  const n = w === 0 ? 1 : 8 - w
  return isoPlus(today, n)
}

export function isoPlus(d: ISODate, n: number): ISODate {
  const t = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)) + n)
  const x = new Date(t)
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`
}

/** 详情里日期第三格（原型 pick3）：下周一不是明天时是「下周一」，是明天时换成后天 */
export function thirdPick(today: ISODate): { date: ISODate; label: 'nextMon' | null } {
  const nm = nextMonday(today)
  return nm === isoPlus(today, 1) ? { date: isoPlus(today, 2), label: null } : { date: nm, label: 'nextMon' }
}
