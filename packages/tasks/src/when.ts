/**
 * 一句话里写的时间（task-pd289，「在文件里写 todo 时怎么写时间」第一种：自然语言）：
 * 「明天下午三点交论文」「每周五晚上八点 组会」「下周一前交报告 提前一天提醒」「tomorrow 3pm」→ 日子、钟点、重复、提醒，剩下的是标题。
 * 画布笔记（文档、白板卡、待办首页）、画布今日、iPad / iPhone（CanvasCore 的 When.swift 一比一移植）都用这一份；快速加一条（quick.ts）也走它。
 * 本地认不出、看着又有时间词的（timeyText）交给 AI（Haiku）问一次，回答用 whenFromAi 验过才用。
 *
 * 不拿系统时间：now 由调用的人给，「2026-11-22」或带钟点的「2026-11-22T16:05」。带钟点时，只写了钟点、没写日子、
 * 那个钟点今天已经过了的算明天。认出来的每一截记下在原话里从哪到哪（hits，JS 字符串下标），界面上把要拿掉的字划掉。
 *
 * 几条约定（表驱动单测 test/when-cases.json 一条条写着）：
 * - 没写上下午的「三点」「at 3」：1 到 6 点算下午（三点开会是 15:00），7 点到 12 点照写的；「15:00」这种带冒号的照写的。
 * - 「晚上12点」「半夜12点」是当天 23:59（截止的说法）。
 * - 「X前」「X之前」「X以前」「by X」「截止X」是截止：日子写 X 那天，「前」一起拿掉。
 * - 日子后面紧跟「的」（「明天的会」「周五的课」）是在说别的事，不认。
 * - 只写了提醒（「提前一天提醒」）也交回来：这一行已经有日子时就够了；用的人自己看合不合用（meaningful）。
 */
import { addDays, addMonths, dayOfMonth, daysInMonth, hhmm, type ISODate, isISODate, normTime, pad, toDays, weekday } from './dates'
import { setDate, setId, setRemind, setRepeat, setTime, setTitle } from './edit'
import { parseTaskLine } from './line'
import { formatRepeat, monFirst, nextDate, parseRepeat } from './recur'
import { formatRemind, parseRemind } from './remind'

export interface WhenFields {
  date: ISODate | null
  /** 「15:00」 */
  time: string | null
  /** 写进 🔔 的中文：准时、提前N分钟 / 小时 / 天、前一天HH:MM */
  remind: string | null
  /** 写进 🔁 的中文：每天、工作日、每周五、每月1日… */
  repeat: string | null
}

/** 认出来的一截：在原话里从哪到哪（JS 字符串下标，UTF-16；Swift 那边照这个算） */
export interface WhenHit {
  from: number
  to: number
  text: string
}

export interface When extends WhenFields {
  /** 拿掉时间词以后的标题 */
  title: string
  /** 认出来的几截，按在原话里的先后 */
  hits: WhenHit[]
}

const CN: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

/** 「三」「十二」「二十三」「12」→ 数；认不出是 NaN */
export function cnNum(s: string): number {
  if (/^\d+$/.test(s)) return Number(s)
  if (s === '十') return 10
  const v = (c: string | undefined) => (c !== undefined && c in CN ? CN[c]! : NaN)
  if (s.length === 2 && s[0] === '十') return 10 + v(s[1])
  if (s.length === 2 && s[1] === '十') return v(s[0]) * 10
  if (s.length === 3 && s[1] === '十') return v(s[0]) * 10 + v(s[2])
  if (s.length === 1) return v(s)
  return NaN
}

const WD_OF: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
const WD = '日一二三四五六'
const EN_WD: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const EN_MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const EN_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/** 一个数：阿拉伯数字或中文（一到九十九） */
const N = '\\d{1,4}|[零〇一二两三四五六七八九十]{1,3}'
/** 钟点、日子里的数 */
const N2 = '\\d{1,2}|[零〇一二两三四五六七八九十]{1,3}'
const WDC = '[一二三四五六日天]'
const WEEK = '(?:周|星期|礼拜)'
const EN_DAY = '(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)'
const EN_MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const enDay = (s: string) => EN_WD[s.slice(0, 3).toLowerCase()]!
const enMonth = (s: string) => EN_MON[s.slice(0, 3).toLowerCase()]!
const enCount = (s: string) => (/^\d+$/.test(s) ? Number(s) : (EN_NUM[s.toLowerCase()] ?? NaN))

/** 上午下午这些：钟点前面的、日子带出来的（今晚、明早） */
const PERIOD = '(凌晨|早上|早晨|清早|上午|中午|下午|傍晚|晚上|夜里|半夜)'

/**
 * 钟点本身（不含前面的上午下午）。组：1 H、2 MM、3 am/pm（9:30am）；4 H、5 MM（带冒号）；6 几点、7 半、8 一刻、9 三刻、10 几分；11 H、12 MM（at 3）。
 * 带 am pm 的排在最前面（「9:30am」不先被当成「9:30」）。「三点建议」「重点」这种「点」后面跟着名词的不算
 */
const CLOCK =
  `(?:(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)(?![a-z])` +
  `|(\\d{1,2})[:：](\\d{2})(?!\\d)` +
  `|(${N2})\\s*(?:点钟?|时)(?!建议|意见|内容|要求|注意|想法|理由|原因|问题|看法|收获|体会|心得|知识|小事)(?:\\s*(半)|\\s*(一刻)|\\s*(三刻)|\\s*(${N2})\\s*分)?` +
  `|\\bat\\s+(\\d{1,2})(?::(\\d{2}))?\\b(?!\\s*(?:点|号|日|月|%|个|天|周|am|pm)))`

/** 钟点：「下午三点半」「15:00」「3pm」「at 9」。组 1 是上午下午，钟点从组 2 起（CLOCK 的组往后挪一位） */
const TIME_RE = new RegExp(`${PERIOD}?\\s*${CLOCK}`, 'i')

/**
 * 认出来的钟点 → 「HH:MM」。m 是 TIME_RE（或同样排的组）的结果，at 是 CLOCK 的第一组在 m 里排第几；
 * period：钟点前面没写上下午时，日子那个词带出来的（今晚、明早）
 */
function clockOf(m: RegExpExecArray, at: number, period: string | null): string | null {
  const g = (i: number) => m[at + i - 1]
  let h: number
  let mm = 0
  /** 没写上下午、也不是 am pm、不是带冒号的：1 到 6 点算下午 */
  let bare = false
  if (g(1) !== undefined) {
    h = Number(g(1))
    mm = g(2) ? Number(g(2)) : 0
    const ap = g(3)!.toLowerCase().replace(/\./g, '')
    if (h < 1 || h > 12) return null
    if (ap === 'pm' && h < 12) h += 12
    if (ap === 'am' && h === 12) h = 0
  } else if (g(4) !== undefined) (h = Number(g(4))), (mm = Number(g(5)))
  else if (g(6) !== undefined) {
    h = cnNum(g(6)!)
    if (g(7)) mm = 30
    else if (g(8)) mm = 15
    else if (g(9)) mm = 45
    else if (g(10) !== undefined) mm = cnNum(g(10)!)
    bare = true
  } else if (g(11) !== undefined) {
    h = Number(g(11))
    mm = g(12) ? Number(g(12)) : 0
    bare = !g(12)
  } else return null
  if (!(h >= 0 && h <= 24 && mm >= 0 && mm < 60)) return null
  if (period) {
    if (/下午|傍晚/.test(period) && h < 12) h += 12
    else if (/晚上|夜里|半夜/.test(period)) {
      // 晚上 12 点：当天截止
      if (h === 12 || h === 24) return '23:59'
      if (h < 12 && !(period === '半夜' && h <= 4)) h += 12
    } else if (period === '中午' && h < 11) h += 12
    else if (period === '凌晨' && h === 12) h = 0
  } else if (bare && h >= 1 && h <= 6) h += 12
  if (h === 24 && mm === 0) return '23:59'
  if (h > 23) return null
  return `${pad(h)}:${pad(mm)}`
}

/** 单独一个钟点（「晚上8点」「20:00」「8pm」），认不出是 null；提醒里的「前一天晚上8点」、选择器里打的钟点用 */
export function parseClock(text: string): string | null {
  const m = new RegExp(`^\\s*${PERIOD}?\\s*${CLOCK}\\s*$`, 'i').exec(text)
  if (!m) return null
  return clockOf(m, 2, m[1] ?? null)
}

const nextMondayOf = (today: ISODate) => addDays(today, weekday(today) === 0 ? 1 : 8 - weekday(today))

/** 今年这一天，已经过了就是明年 */
function yearOf(today: ISODate, mo: number, d: number): ISODate | null {
  if (!(mo >= 1 && mo <= 12 && d >= 1)) return null
  const y = Number(today.slice(0, 4))
  if (d > daysInMonth(y, mo) && !(mo === 2 && d === 29)) return null
  const here = `${y}-${pad(mo)}-${pad(d)}`
  if (isISODate(here) && toDays(here) >= toDays(today)) return here
  const next = `${y + 1}-${pad(mo)}-${pad(d)}`
  return isISODate(next) ? next : null
}

/** 这个月的第 d 天，已经过了就是下个月的（下个月没这一天就是月底） */
function monthDay(today: ISODate, d: number): ISODate | null {
  if (!(d >= 1 && d <= 31)) return null
  const y = Number(today.slice(0, 4))
  const mo = Number(today.slice(5, 7))
  if (d <= daysInMonth(y, mo)) {
    const here = dayOfMonth(y, mo, d)
    if (toDays(here) >= toDays(today)) return here
  }
  const n = addMonths(`${y}-${pad(mo)}-01`, 1)
  return dayOfMonth(Number(n.slice(0, 4)), Number(n.slice(5, 7)), d)
}

const lastDay = (d: ISODate) => dayOfMonth(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 31)

export function parseWhen(text: string, now: string): When | null {
  const today = now.slice(0, 10)
  if (!isISODate(today)) throw new Error(`now 不是日子：${now}`)
  const nowTime = now.length >= 16 ? normTime(now.slice(11, 16)) : null
  /** 原话的一份：认出来的那几截换成同样长的空格（下标和原话对得上） */
  let s = text
  const hits: WhenHit[] = []
  // 都在下面几个 take 的回调里填（写成 as，TS 才不把它们一直当成 null）
  let date = null as ISODate | null
  let time = null as string | null
  let repeat = null as string | null
  let remind = null as string | null
  /** 日子那个词带出来的上下午（今晚、明早、tonight） */
  let period = null as string | null

  const mark = (from: number, to: number) => {
    while (from < to && /\s/.test(s[from]!)) from++
    while (to > from && /\s/.test(s[to - 1]!)) to--
    if (to <= from) return
    hits.push({ from, to, text: text.slice(from, to) })
    s = s.slice(0, from) + ' '.repeat(to - from) + s.slice(to)
  }
  /** 截止的说法：前面的「截止」「by」（和英文钟点、日子前面的 at、on），后面的「前」「之前」「以前」「截止」一起拿掉 */
  const deadline = (from: number, to: number): [number, number] => {
    const before = /(?:截[止至](?:到|日期)?[:：]?|\b(?:by|before|due(?:\s+on)?|until|till|at|on))\s*$/i.exec(s.slice(0, from))
    if (before) from = before.index
    const after = /^\s*(?:之前|以前|前|截止|为止)/.exec(s.slice(to))
    if (after) to += after[0].length
    return [from, to]
  }
  /** 照 re 找：一处处试，f 交回 false 就试下一处；认了的那一截拿掉。f 可以交回 [从, 到] 改拿掉的范围 */
  const take = (re: RegExp, f: (m: RegExpExecArray) => boolean | void | [number, number]): boolean => {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    for (let m = g.exec(s); m; m = g.exec(s)) {
      if (!m[0].length) {
        g.lastIndex++
        continue
      }
      const r = f(m)
      if (r === false) continue
      const [from, to] = Array.isArray(r) ? r : [m.index, m.index + m[0].length]
      mark(from, to)
      return true
    }
    return false
  }
  /** 紧跟着「的」：在说别的事（「明天的会」） */
  const de = (m: RegExpExecArray) => s[m.index + m[0].length] === '的'

  // ---------- 提醒（先认：「提前一天」「前一天晚上8点」里的字不能算成这一条的日子、钟点） ----------
  const REM_WORD = '(?:提醒我?|通知我?|叫我)'
  take(new RegExp(`(?:提前|前)\\s*一\\s*天\\s*([^，,。；;\\s]{1,14}?)\\s*${REM_WORD}`), (m) => {
    const at = parseClock(m[1]!)
    if (!at) return false
    remind = `前一天${at}`
  }) ||
    take(new RegExp(`提前\\s*(${N}|半)\\s*(个)?\\s*(分钟|分|小时|钟头|天|日|周|星期|礼拜)\\s*${REM_WORD}?`), (m) => {
      const half = m[1] === '半'
      const n = half ? 0.5 : cnNum(m[1]!)
      if (!(n > 0)) return false
      const unit = m[3]!
      const minutes = Math.round(n * (/分/.test(unit) ? 1 : /时|头/.test(unit) ? 60 : /天|日/.test(unit) ? 1440 : 10080))
      if (minutes < 1 || minutes > 60 * 24 * 60) return false
      remind = formatRemind({ kind: 'before', minutes })
    }) ||
    take(new RegExp(`(?:到点|准时|按时)\\s*${REM_WORD}`), () => void (remind = '准时')) ||
    take(/remind\s+me\s+(\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?)\s+(?:before|early|earlier|ahead|in\s+advance)\b/i, (m) => {
      const n = enCount(m[1]!)
      if (!(n > 0)) return false
      const u = m[2]!.toLowerCase()
      const minutes = n * (u.startsWith('m') ? 1 : u.startsWith('h') ? 60 : u.startsWith('d') ? 1440 : 10080)
      remind = formatRemind({ kind: 'before', minutes })
    }) ||
    take(/提醒我|\bremind\s+me\b/i, () => void (remind = '准时'))

  // ---------- 重复 ----------
  take(/每个?工作日|工作日|周一到周五|(?:每个?)?(?:周|星期)一(?:到|至)(?:周|星期)?五|every\s*weekday|weekdays/i, () => void (repeat = '工作日')) ||
    take(new RegExp(`每个?${WEEK}末|每逢?周末|every\\s+weekend`, 'i'), () => void (repeat = '每周六、日')) ||
    take(new RegExp(`每个?${WEEK}(${WDC}(?:[、,，和及]?${WEEK}?${WDC})*)`), (m) => {
      const days = [...new Set([...m[1]!.replace(/[、,，和及]|周|星期|礼拜/g, '')].map((c) => WD_OF[c]!))].sort(monFirst)
      repeat = '每周' + days.map((d) => WD[d]).join('、')
    }) ||
    take(new RegExp(`每个?月\\s*(${N2})\\s*[号日]`), (m) => {
      const d = cnNum(m[1]!)
      if (!(d >= 1 && d <= 31)) return false
      repeat = `每月${d}日`
    }) ||
    take(/每天|每日|天天|every\s*day|daily/i, () => void (repeat = '每天')) ||
    take(/隔天|每隔一天|every\s+other\s+day/i, () => void (repeat = '每2天')) ||
    take(/隔周|每隔一周|every\s+other\s+week|biweekly/i, () => void (repeat = '每2周')) ||
    take(new RegExp(`每\\s*(${N})\\s*天`), (m) => {
      const n = cnNum(m[1]!)
      if (!(n >= 1 && n <= 999)) return false
      repeat = n === 1 ? '每天' : `每${n}天`
    }) ||
    take(new RegExp(`每\\s*(${N})\\s*个?${WEEK}`), (m) => {
      const n = cnNum(m[1]!)
      if (!(n >= 1 && n <= 999)) return false
      repeat = n === 1 ? '每周' : `每${n}周`
    }) ||
    take(new RegExp(`每\\s*(${N})\\s*个月`), (m) => {
      const n = cnNum(m[1]!)
      if (!(n >= 1 && n <= 99)) return false
      repeat = n === 1 ? '每月' : `每${n}个月`
    }) ||
    take(new RegExp(`每个?${WEEK}|weekly|every\\s+week\\b`, 'i'), () => void (repeat = '每周')) ||
    take(/每个?月|monthly|every\s+month\b/i, () => void (repeat = '每月')) ||
    take(/每年|yearly|annually|every\s+year\b/i, () => void (repeat = '每年')) ||
    take(new RegExp(`every\\s+${EN_DAY}\\b`, 'i'), (m) => void (repeat = '每周' + WD[enDay(m[1]!)])) ||
    take(/every\s+(\d{1,3}|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?|months?)\b/i, (m) => {
      const n = enCount(m[1]!)
      if (!(n >= 1)) return false
      const u = m[2]!.toLowerCase()
      repeat = u.startsWith('d') ? (n === 1 ? '每天' : `每${n}天`) : u.startsWith('w') ? (n === 1 ? '每周' : `每${n}周`) : n === 1 ? '每月' : `每${n}个月`
    })

  // ---------- 日子 ----------
  const dayHit = (d: ISODate | null, m: RegExpExecArray, p?: string): boolean | [number, number] => {
    if (!d || de(m)) return false
    date = d
    if (p) period = p
    return deadline(m.index, m.index + m[0].length)
  }
  const DATE_RE = new RegExp(
    [
      /* 1 2 3 */ `(\\d{4})[-/.年](\\d{1,2})[-/.月](\\d{1,2})[日号]?`,
      /* 4 5 */ `(?<![\\d.])(${N2})\\s*月\\s*(${N2})\\s*[日号]?`,
      /* 6 7 */ `(?<![\\d/])(\\d{1,2})/(\\d{1,2})(?![\\d/])`,
      /* 8 */ `(大+后天|后天|明天|明日|明儿|明早|明晚|今天|今日|今儿|今早|今晚|今夜)`,
      /* 9 10 */ `(下下|下|这|本)?个?${WEEK}(${WDC})`,
      /* 11 */ `(下下|下|这|本)?个?周末`,
      /* 12 */ `(下下|下)个?${WEEK}(?![一二三四五六日天末])`,
      /* 13 14 */ `(下|这|本)个?月\\s*(${N2})\\s*[号日]`,
      /* 15 */ `(下个?|这个?|本)?月[底末]`,
      /* 16 */ `(?<![\\d月])(${N2})\\s*号`,
      /* 17 18 */ `(${N})\\s*(天|个?${WEEK}|个月)(?:以后|之后|后)`,
      /* 19 */ `\\b(?:the\\s+)?(day\\s+after\\s+tomorrow|tomorrow|tmrw|tonight|today)\\b`,
      /* 20 21 */ `\\b(next|this|on)?\\s*${EN_DAY}\\b`,
      /* 22 */ `\\b(next\\s+week|this\\s+weekend|next\\s+weekend|weekend)\\b`,
      /* 23 24 */ `\\bin\\s+(\\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(days?|weeks?|months?)\\b`,
      /* 25 26 */ `\\b${EN_MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
      /* 27 28 */ `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${EN_MONTH}\\b`,
      /* 29 */ `\\bend\\s+of\\s+(?:the\\s+)?(month|week)\\b`,
    ].join('|'),
    'i',
  )
  take(DATE_RE, (m) => {
    const w = m[0].toLowerCase()
    if (m[1]) {
      const d = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
      return dayHit(isISODate(d) ? d : null, m)
    }
    if (m[4]) return dayHit(yearOf(today, cnNum(m[4]), cnNum(m[5]!)), m)
    if (m[6]) return dayHit(yearOf(today, Number(m[6]), Number(m[7])), m)
    if (m[8]) {
      const k = m[8]
      if (/^大+后天$/.test(k)) return dayHit(addDays(today, k.length), m)
      if (k === '后天') return dayHit(addDays(today, 2), m)
      if (k === '明早') return dayHit(addDays(today, 1), m, '上午')
      if (k === '明晚') return dayHit(addDays(today, 1), m, '晚上')
      if (k.startsWith('明')) return dayHit(addDays(today, 1), m)
      if (k === '今早') return dayHit(today, m, '上午')
      if (k === '今晚' || k === '今夜') return dayHit(today, m, '晚上')
      return dayHit(today, m)
    }
    if (m[10]) {
      const wd = WD_OF[m[10]]!
      const off = (wd + 6) % 7
      if (m[9] === '下下') return dayHit(addDays(nextMondayOf(today), 7 + off), m)
      if (m[9] === '下') return dayHit(addDays(nextMondayOf(today), off), m)
      // 这周、本周、只写周几：今天起往后第一个（今天就是那天是今天）
      return dayHit(addDays(today, (wd - weekday(today) + 7) % 7), m)
    }
    if (/周末$/.test(m[0]) && m[11] !== undefined) {
      if (m[11] === '下下') return dayHit(addDays(nextMondayOf(today), 12), m)
      if (m[11] === '下') return dayHit(addDays(nextMondayOf(today), 5), m)
      // 这周末：今天起往后第一个周六（周日就是今天）
      return dayHit(weekday(today) === 0 ? today : addDays(today, (6 - weekday(today) + 7) % 7), m)
    }
    if (/周末$/.test(m[0])) return dayHit(weekday(today) === 0 ? today : addDays(today, (6 - weekday(today) + 7) % 7), m)
    if (m[12]) return dayHit(addDays(nextMondayOf(today), m[12] === '下下' ? 7 : 0), m)
    if (m[13]) {
      const d = cnNum(m[14]!)
      if (!(d >= 1 && d <= 31)) return false
      const y = Number(today.slice(0, 4))
      const mo = Number(today.slice(5, 7))
      if (m[13] === '下') {
        const n = addMonths(`${y}-${pad(mo)}-01`, 1)
        return dayHit(dayOfMonth(Number(n.slice(0, 4)), Number(n.slice(5, 7)), d), m)
      }
      return dayHit(d <= daysInMonth(y, mo) && d >= Number(today.slice(8, 10)) ? dayOfMonth(y, mo, d) : null, m)
    }
    if (/月[底末]$/.test(m[0])) return dayHit(lastDay(m[15]?.startsWith('下') ? addMonths(today.slice(0, 8) + '01', 1) : today), m)
    if (m[16]) return dayHit(monthDay(today, cnNum(m[16])), m)
    if (m[17]) {
      const n = cnNum(m[17])
      if (!(n >= 1 && n <= 999)) return false
      const u = m[18]!
      return dayHit(u === '天' ? addDays(today, n) : u === '个月' ? addMonths(today, n) : addDays(today, 7 * n), m)
    }
    if (m[19]) {
      const k = m[19].toLowerCase().replace(/\s+/g, ' ')
      if (k === 'today') return dayHit(today, m)
      if (k === 'tonight') return dayHit(today, m, '晚上')
      if (k === 'day after tomorrow') return dayHit(addDays(today, 2), m)
      return dayHit(addDays(today, 1), m)
    }
    if (m[21]) {
      const wd = enDay(m[21])
      // 单独一个缩写（sun、sat、wed、mon…）在英文里常是别的词：前面要有 on / this / next 才认
      if (!m[20] && m[21].length <= 3) return false
      if (m[20]?.toLowerCase() === 'next') return dayHit(addDays(nextMondayOf(today), (wd + 6) % 7), m)
      return dayHit(addDays(today, (wd - weekday(today) + 7) % 7), m)
    }
    if (m[22]) {
      const k = m[22].toLowerCase().replace(/\s+/g, ' ')
      if (k === 'next week') return dayHit(nextMondayOf(today), m)
      if (k === 'next weekend') return dayHit(addDays(nextMondayOf(today), 5), m)
      return dayHit(weekday(today) === 0 ? today : addDays(today, (6 - weekday(today) + 7) % 7), m)
    }
    if (m[23]) {
      const n = enCount(m[23])
      if (!(n >= 1 && n <= 999)) return false
      const u = m[24]!.toLowerCase()
      return dayHit(u.startsWith('d') ? addDays(today, n) : u.startsWith('w') ? addDays(today, 7 * n) : addMonths(today, n), m)
    }
    if (m[25]) return dayHit(yearOf(today, enMonth(m[25]), Number(m[26])), m)
    if (m[28]) return dayHit(yearOf(today, enMonth(m[28]), Number(m[27])), m)
    if (m[29]) return dayHit(m[29].toLowerCase() === 'month' ? lastDay(today) : addDays(today, (7 - weekday(today)) % 7), m)
    return false
  })

  // ---------- 钟点 ----------
  take(TIME_RE, (m) => {
    if (de(m)) return false
    const at = clockOf(m, 2, m[1] ?? period)
    if (!at) return false
    time = at
    return deadline(m.index, m.index + m[0].length)
  }) ||
    take(/(?:中午|正午)(?![\d零〇一二两三四五六七八九十])|\bnoon\b/i, (m) => {
      if (de(m)) return false
      time = '12:00'
      return deadline(m.index, m.index + m[0].length)
    })

  if (!date && !time && !repeat && !remind) return null

  // 有重复、没写日子：第一次是哪天（工作日、每周几、每月几日从今天起找第一个对得上的，别的就是今天）；钟点今天已经过了，就是下一次
  if (repeat && !date) {
    const r = parseRepeat(repeat)!
    let first = r.kind === 'workday' || r.kind === 'weekdays' || r.kind === 'monthday' ? nextDate(r, null, addDays(today, -1)) : today
    if (first === today && time && nowTime && time <= nowTime) first = nextDate(r, null, today)
    date = first
  }
  // 只写了钟点：今天；今天这个钟点已经过了，是明天
  if (time && !date) date = nowTime && time <= nowTime ? addDays(today, 1) : today

  hits.sort((a, b) => a.from - b.from)
  return { title: cleanTitle(s), date, time, remind, repeat, hits }
}

/** 拿掉时间词以后剩下的：空白收成一个，两头的逗号、顿号、冒号和英文里留下的介词去掉 */
function cleanTitle(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[，,、:：;；]+\s*|\s*[，,、:：;；]+$/g, '')
    .replace(/\s+(?:at|on|by|before|due|in)$/i, '')
    .replace(/^(?:at|on|by|before|due)\s+/i, '')
    .trim()
}

/** 认出来的有没有用：有日子、钟点、重复；只有提醒时这一行本来要有日子（hasDate） */
export const meaningful = (w: WhenFields, hasDate: boolean): boolean => !!(w.date || w.time || w.repeat || (w.remind && hasDate))

/**
 * 看着有没有时间词（本地没认出来时才看）：有就值得问一次 AI（Haiku）。只认比较确定的说法，
 * 英文里 may、sat、sun、mar 这种常是别的意思的词不算
 */
export function timeyText(text: string): boolean {
  return /(?:今|明|后|昨)(?:天|日|儿|早|晚)|大+后天|[上下这本]个?(?:周|星期|礼拜|月)|(?:周|星期|礼拜)[一二三四五六日天末]|\d{1,2}\s*[号日点时]|[一二两三四五六七八九十]{1,3}[号点]|月(?:初|中|底|末)|年(?:初|中|底)|元旦|春节|除夕|元宵|清明|端午|七夕|中秋|国庆|圣诞|平安夜|感恩节|情人节|劳动节|儿童节|跨年|寒假|暑假|开学|期中|期末|考试周|凌晨|早上|上午|中午|下午|傍晚|晚上|夜里|半夜|午饭|晚饭|早饭|饭[前后]|睡前|下班[前后]|放学|周末|截止|提醒|每(?:天|日|周|月|年|隔)|\b(?:today|tonight|tomorrow|tmrw|weekend|morning|afternoon|evening|tonight|noon|midnight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tue|thu|fri|jan(?:uary)?|feb(?:ruary)?|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|christmas|xmas|easter|thanksgiving|eod|eow|eom|deadline|ddl|due|every|daily|weekly|monthly|remind)\b|\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(text)
}

/** 待办行尾那一截的标准写法（灰字预览照它写）：📅 2026-11-23 15:00 🔔 提前1小时 🔁 每周五 */
export function whenTail(w: WhenFields): string {
  const parts: string[] = []
  if (w.date) parts.push(`📅 ${w.date}${w.time ? ' ' + w.time : ''}`)
  if (w.remind) parts.push(`🔔 ${w.remind}`)
  if (w.repeat) parts.push(`🔁 ${w.repeat}`)
  return parts.join(' ')
}

/**
 * 选好的时间写成一句认得回来的话（快速加一条的输入框里，打 @ 选了日子以后插进去的字）：
 * 今天、明天写字，别的写 2026-11-25；钟点 15:00；提醒、重复照 🔔 🔁 的写法（「准时提醒」「提前1天提醒」「每周三」）。parseWhen 认回来一样
 */
export function whenPhrase(w: WhenFields, today: ISODate, lang: 'zh' | 'en' = 'zh'): string {
  const parts: string[] = []
  if (w.date) parts.push(w.date === today ? (lang === 'en' ? 'today' : '今天') : w.date === addDays(today, 1) ? (lang === 'en' ? 'tomorrow' : '明天') : w.date)
  if (w.date && w.time) parts.push(w.time)
  if (w.remind) parts.push(w.remind + '提醒')
  if (w.repeat) parts.push(w.repeat)
  return parts.join(' ')
}

/**
 * 输入框里用选择器选了以后（快速加一条，task-pd289）：原来认出来的时间词拿掉，换成选的那几样的说法（whenPhrase），
 * 放在 at（打 @ 的地方：那个 @ 一起拿掉；按快捷键开的：光标处）。prev：这一回上次插进去的那一截（再选一次就换掉它，原来的时间词那次已经拿掉了）。
 * 前后补一个空格（挨着字的话）。交回新的字和插进去的那一截（光标放到它后面）
 */
export function putWhenPhrase(text: string, at: number, w: WhenFields, now: string, prev: { from: number; to: number } | null, lang: 'zh' | 'en' = 'zh'): { text: string; from: number; to: number } {
  let s = text
  let pos = Math.max(0, Math.min(at, s.length))
  const cut = (a: number, b: number) => {
    s = s.slice(0, a) + s.slice(b)
    if (pos >= b) pos -= b - a
    else if (pos > a) pos = a
  }
  if (prev) {
    pos = prev.from
    s = s.slice(0, prev.from) + s.slice(prev.to)
  } else {
    if (/[@＠]/.test(s.charAt(pos))) cut(pos, pos + 1)
    const old = parseWhen(s, now)
    for (const h of [...(old?.hits ?? [])].reverse()) cut(h.from, h.to)
  }
  const phrase = whenPhrase(w, now.slice(0, 10), lang)
  if (!phrase) {
    const t = s.replace(/\s{2,}/g, ' ')
    return { text: t, from: Math.min(pos, t.length), to: Math.min(pos, t.length) }
  }
  const before = pos > 0 && !/\s/.test(s.charAt(pos - 1)) ? ' ' : ''
  const after = pos < s.length && !/\s/.test(s.charAt(pos)) ? ' ' : ''
  const from = pos + before.length
  return { text: s.slice(0, pos) + before + phrase + after + s.slice(pos), from, to: from + phrase.length }
}

/**
 * AI（Haiku）的回答验过才用：只认一个 JSON 对象，日子、钟点、重复、提醒照 @cn/tasks 的规矩认得出才留，标题只能是原话删掉几个字
 * （不许改写、翻译）。日子离今天一年以前、十年以后的不要。认不出、什么都没有是 null
 */
export function whenFromAi(answer: string, text: string, now: string): When | null {
  const today = now.slice(0, 10)
  const m = /\{[\s\S]*\}/.exec(answer)
  if (!m) return null
  let o: Record<string, unknown>
  try {
    const v = JSON.parse(m[0]) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null
    o = v as Record<string, unknown>
  } catch {
    return null
  }
  const str = (k: string) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string).trim() : null)
  let date = str('date')
  if (date && (!isISODate(date) || toDays(date) < toDays(today) - 366 || toDays(date) > toDays(today) + 3660)) date = null
  const time = str('time') ? normTime(str('time')!) : null
  const rp = str('repeat') ? parseRepeat(str('repeat')!) : null
  const rm = str('remind') ? parseRemind(str('remind')!) : null
  const fields: WhenFields = { date, time, repeat: rp ? formatRepeat(rp) : null, remind: rm ? formatRemind(rm) : null }
  if (fields.time && !fields.date) fields.date = today
  if (!fields.date && !fields.time && !fields.repeat && !fields.remind) return null
  const title = (str('title') ?? '').replace(/\s+/g, ' ')
  const hits = removedSpans(text, title)
  if (!title || !hits) return null
  return { title, ...fields, hits }
}

/**
 * 交给 AI（Haiku）的话（画布笔记、画布今日的主进程，iPad 走云端时同一套）：系统提示说规矩，只送这一行和今天几号、星期几、几点。
 * 回答用 whenFromAi 验
 */
export const WHEN_AI_SYSTEM = [
  '你把一行待办里写的时间整理成固定的格式。只回答一个 JSON 对象，不要别的字：',
  '{"title":"…","date":"YYYY-MM-DD 或 null","time":"HH:MM 或 null","repeat":"… 或 null","remind":"… 或 null"}',
  '- title：原话删掉说时间的那几个字以后剩下的。只能删字，不能改写、不能翻译、不能加字。',
  '- date：要做的那一天。「X前」「X之前」「by X」是截止，写 X 那天。农历节日（春节、中秋…）换成公历那一天。',
  '- time：24 小时制；没说钟点写 null。',
  '- repeat 只能是这几种写法：每天、每N天、工作日、每周、每N周、每周一（几天用顿号：每周一、三、五；周日写「日」）、每月、每N个月、每月N日、每年；不重复写 null。',
  '- remind 只能是：准时、提前N分钟、提前N小时、提前N天、前一天HH:MM；没说提醒写 null。',
  '- 这一行没有说时间：date、time、repeat、remind 都写 null。',
].join('\n')

/** 送给 AI 的那一问：今天几号、星期几、现在几点，和这一行（只送这一行） */
export function whenAiPrompt(text: string, now: string): string {
  const today = now.slice(0, 10)
  const at = now.length >= 16 ? `，现在 ${now.slice(11, 16)}` : ''
  return `今天是 ${today}（周${WD[weekday(today)]}）${at}。\n待办：「${text.replace(/[\r\n]+/g, ' ')}」`
}

/** 标题是不是原话按顺序删掉几个字得来的；是的话交回删掉的那几截（空白不算），不是 null */
function removedSpans(text: string, title: string): WhenHit[] | null {
  const out: WhenHit[] = []
  let i = 0
  let gap = -1
  const close = (to: number) => {
    if (gap < 0) return
    let a = gap
    let b = to
    while (a < b && /\s/.test(text[a]!)) a++
    while (b > a && /\s/.test(text[b - 1]!)) b--
    if (b > a) out.push({ from: a, to: b, text: text.slice(a, b) })
    gap = -1
  }
  for (const c of title) {
    // 标题里的空白：原话里对应处可以是一个或几个空白，也可以是删掉一截的地方
    if (/\s/.test(c)) continue
    let j = text.indexOf(c, i)
    if (j < 0) return null
    if (j > i && gap < 0) gap = i
    if (j > i) close(j)
    i = j + c.length
  }
  if (i < text.length) {
    gap = i
    close(text.length)
  }
  return out
}

// ---------- 写进那一行 ----------

/**
 * 收下认出来的（灰字预览按 Tab、回车）：标题换成拿掉时间词的那句，认出来的几项写进行尾（照定稿的顺序，只换那几个字）；
 * 没认出来的那几项原来有就留着（原来有钟点、这次只说了「明天」：改日子、钟点照旧）。有提醒、没 🆔 的给一个（提醒记录、提醒事项镜像认它）
 */
export function acceptWhen(line: string, w: When, newId?: () => string): string {
  const t = parseTaskLine(line)
  if (!t) return line
  let x = setTitle(line, w.title)
  if (w.date) x = setDate(x, w.date)
  if (w.date && w.time) x = setTime(x, w.time)
  if (w.remind) x = setRemind(x, w.remind)
  if (w.repeat) x = setRepeat(x, w.repeat)
  if (w.remind && newId && !parseTaskLine(x)?.id) x = setId(x, newId())
  return x
}

/**
 * 这一行行尾照 f 写，null 是拿掉那一项（选择器里改一项、「清掉」）；没有日子就没有钟点、提醒。
 * 提醒是这一次新设、改了的，没 🆔 的给一个（只改日子不加）
 */
export function setWhen(line: string, f: WhenFields, newId?: () => string): string {
  const t = parseTaskLine(line)
  if (!t) return line
  let x = setDate(line, f.date)
  if (f.date) x = setTime(x, f.time)
  x = setRemind(x, f.date ? f.remind : null)
  x = setRepeat(x, f.repeat)
  if (f.date && f.remind && f.remind !== t.remind && newId && !parseTaskLine(x)?.id) x = setId(x, newId())
  return x
}

/** 这一行现在写着的（选择器打开时照它亮） */
export function whenOf(line: string): WhenFields {
  const t = parseTaskLine(line)
  return { date: t?.date ?? null, time: t?.time ?? null, remind: t?.remind ?? null, repeat: t?.repeat ?? null }
}

// ---------- 选择器里的几样（画布笔记、画布今日、iPad 一样） ----------

/** 选择器顶上三项（原来「定日子」那个小菜单）：今天、明天、下周一；明天就是周一时第三项换成后天 */
export function quickDays(today: ISODate): { date: ISODate; kind: 'today' | 'tomorrow' | 'nextMonday' | 'dayAfter' }[] {
  const tom = addDays(today, 1)
  const mon = addDays(today, (8 - weekday(today)) % 7 || 7)
  return [
    { date: today, kind: 'today' },
    { date: tom, kind: 'tomorrow' },
    mon === tom ? { date: addDays(today, 2), kind: 'dayAfter' } : { date: mon, kind: 'nextMonday' },
  ]
}

/** 钟点能选的：早上 7 点到晚上 11 点半，每半小时一个，最后一个 23:59（当天截止） */
export const TIME_CHOICES: readonly string[] = [...Array.from({ length: 34 }, (_, i) => hhmm(7 * 60 + i * 30)), '23:59']

/** 提醒能选的（🔔 的写法） */
export const REMIND_CHOICES: readonly string[] = ['准时', '提前5分钟', '提前10分钟', '提前30分钟', '提前1小时', '提前2小时', '提前1天', '前一天20:00']

/** 重复能选的（🔁 的写法）：每周、每月几日照选着的那天 */
export function repeatChoices(date: ISODate | null): string[] {
  return ['每天', '工作日', date ? `每周${WD[weekday(date)]}` : '每周', '每2周', `每月${date ? Number(date.slice(8, 10)) : 1}日`, '每年']
}

/** 选项里加上现在写着、但不在常用几项里的那一个（手写的「每周一、三」「15:45」） */
export const withCurrent = (choices: readonly string[], cur: string | null): string[] => (cur && !choices.includes(cur) ? [...choices, cur] : [...choices])
