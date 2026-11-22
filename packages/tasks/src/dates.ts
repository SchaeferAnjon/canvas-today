/**
 * 日子和钟点：一律是写进文件里的那种字符串（2026-11-23、15:00），不带时区。
 * 算加减用 UTC 的日子数，和这台设备在哪个时区无关；「今天」由调用的人传进来（这个包不拿系统时间）。
 */

export type ISODate = string

const DAY = 86_400_000

export const isISODate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toDays(s))

/** 1970-01-01 起的第几天 */
export function toDays(d: ISODate): number {
  const y = Number(d.slice(0, 4))
  const m = Number(d.slice(5, 7))
  const day = Number(d.slice(8, 10))
  if (m < 1 || m > 12 || day < 1 || day > daysInMonth(y, m)) return NaN
  return Math.round(Date.UTC(y, m - 1, day) / DAY)
}

export function fromDays(n: number): ISODate {
  const d = new Date(n * DAY)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export const pad = (n: number) => String(n).padStart(2, '0')

export const addDays = (d: ISODate, n: number): ISODate => fromDays(toDays(d) + n)

/** a 比 b 晚几天（a 早就是负数） */
export const diffDays = (a: ISODate, b: ISODate): number => toDays(a) - toDays(b)

/** 星期几：0 是周日 */
export const weekday = (d: ISODate): number => ((toDays(d) % 7) + 7 + 4) % 7

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 加几个月：那个月没这一天就是月底（1 月 31 日加一个月是 2 月 28 日） */
export function addMonths(d: ISODate, n: number): ISODate {
  const y = Number(d.slice(0, 4))
  const m = Number(d.slice(5, 7)) - 1 + n
  const ny = y + Math.floor(m / 12)
  const nm = (((m % 12) + 12) % 12) + 1
  const day = Math.min(Number(d.slice(8, 10)), daysInMonth(ny, nm))
  return `${ny}-${pad(nm)}-${pad(day)}`
}

/** 某年某月的第几天（这个月没那么多天就是月底） */
export function dayOfMonth(y: number, m: number, day: number): ISODate {
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`
}

/** 「9:05」「09:05」→「09:05」；不是钟点返回 null */
export function normTime(s: string): string | null {
  const m = /^(\d{1,2})[:：](\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${pad(h)}:${pad(min)}`
}

export const minutesOf = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
export const hhmm = (min: number): string => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

/** 「2026-11-23T15:00」这种本地钟点加减分钟 */
export function addMinutes(dt: string, min: number): string {
  const total = toDays(dt.slice(0, 10)) * 1440 + minutesOf(dt.slice(11, 16)) + min
  const days = Math.floor(total / 1440)
  return `${fromDays(days)}T${hhmm(total - days * 1440)}`
}
