/**
 * 快速加一条：从一句话里认出日子、钟点、重复、#清单、!优先级，剩下的是标题。
 * 「明天下午三点交论文」→ 交论文 · 2026-11-23 15:00。中文为主，也认几种英文（tomorrow 3pm、every day、!high）。
 * hits 是认出来的原话（输入框下面那一行「认出来：…」照它写）。
 */
import { addDays, dayOfMonth, type ISODate, isISODate, pad, toDays, weekday } from './dates'
import { monFirst, nextDate, parseRepeat } from './recur'
import type { Prio } from './line'

export interface Quick {
  title: string
  date: ISODate | null
  time: string | null
  /** 写进 🔁 的中文 */
  repeat: string | null
  prio: Prio
  /** #后面的字：清单（笔记）名 */
  list: string | null
  hits: string[]
}

const CN: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
/** 「三」「十二」「二十三」「12」→ 数 */
function num(s: string): number {
  if (/^\d+$/.test(s)) return Number(s)
  if (s === '十') return 10
  if (s.length === 2 && s[0] === '十') return 10 + CN[s[1]!]!
  if (s.length === 2 && s[1] === '十') return CN[s[0]!]! * 10
  if (s.length === 3 && s[1] === '十') return CN[s[0]!]! * 10 + CN[s[2]!]!
  return CN[s] ?? NaN
}

const WDC: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
const WDE: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const EN_DAY = '(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)'
const enDay = (s: string) => WDE[s.slice(0, 3).toLowerCase()]!
const WD = '日一二三四五六'
const NUMS = '[一二两三四五六七八九十〇零]{1,3}|\\d{1,2}'

/** 这周之后的那个周一（今天是周日时就是明天） */
function nextMonday(today: ISODate): ISODate {
  const w = weekday(today)
  return addDays(today, w === 0 ? 1 : 8 - w)
}

export function parseQuick(text: string, today: ISODate): Quick {
  let s = ` ${text} `
  const hits: string[] = []
  let date: ISODate | null = null
  let time: string | null = null
  let repeat: string | null = null
  let prio: Prio = 0
  let list: string | null = null
  /** 日子那个词带出来的上下午（今晚、明早） */
  let period: string | null = null

  const take = (re: RegExp, f: (m: RegExpExecArray) => boolean | void) => {
    const m = re.exec(s)
    if (!m) return false
    if (f(m) === false) return false
    hits.push(m[0].trim())
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)
    return true
  }

  // ---------- 重复 ----------
  take(/每天|每日|every\s*day|daily/i, () => void (repeat = '每天')) ||
    take(/每个?工作日|工作日|every\s*weekday|weekdays/i, () => void (repeat = '工作日')) ||
    take(/每(?:周|星期|礼拜)([一二三四五六日天](?:[、,，和]?[一二三四五六日天])*)/, (m) => {
      const days = [...new Set([...m[1]!.replace(/[、,，和]/g, '')].map((c) => WDC[c]!))].sort(monFirst)
      repeat = '每周' + days.map((d) => WD[d]).join('、')
    }) ||
    take(/每月(\d{1,2})[号日]/, (m) => (Number(m[1]) >= 1 && Number(m[1]) <= 31 ? void (repeat = `每月${Number(m[1])}日`) : false)) ||
    take(/每(\d{1,3})天/, (m) => void (repeat = `每${Number(m[1])}天`)) ||
    take(/每(\d{1,3})周/, (m) => void (repeat = `每${Number(m[1])}周`)) ||
    take(/每(?:周|星期)/, () => void (repeat = '每周')) ||
    take(/每个?月/, () => void (repeat = '每月')) ||
    take(/每年/, () => void (repeat = '每年')) ||
    take(new RegExp(`every\\s+${EN_DAY}\\b`, 'i'), (m) => void (repeat = '每周' + WD[enDay(m[1]!)])) ||
    take(/every\s+(\d{1,3})\s+days?/i, (m) => void (repeat = `每${Number(m[1])}天`)) ||
    take(/every\s+(\d{1,3})\s+weeks?/i, (m) => void (repeat = `每${Number(m[1])}周`)) ||
    take(/every\s+week/i, () => void (repeat = '每周')) ||
    take(/every\s+month/i, () => void (repeat = '每月')) ||
    take(/every\s+year/i, () => void (repeat = '每年'))

  // ---------- 日子 ----------
  take(new RegExp(`(\\d{4}-\\d{2}-\\d{2})|(?<!\\d)(\\d{1,2})月(\\d{1,2})[日号]?|(?<![\\d/])(\\d{1,2})/(\\d{1,2})(?![\\d/])|大后天|后天|今晚|今早|今天|今日|明早|明晚|明天|明日|下下(?:周|星期|礼拜)([一二三四五六日天])|下(?:周|星期|礼拜)([一二三四五六日天])|(?:这|本)?(?:周|星期|礼拜)([一二三四五六日天])|(?<![\\d月])(\\d{1,2})号|\\b(?:the\\s+)?day\\s+after\\s+tomorrow\\b|\\btomorrow\\b|\\btonight\\b|\\btoday\\b|\\bnext\\s+${EN_DAY}\\b|\\b(?:on\\s+${EN_DAY}|(sunday|monday|tuesday|wednesday|thursday|friday|saturday))\\b|\\bin\\s+(\\d{1,3})\\s+days?\\b`, 'i'), (m) => {
    const w = m[0].toLowerCase().trim()
    const yearOf = (mm: number, dd: number) => {
      const y = Number(today.slice(0, 4))
      const d = `${y}-${pad(mm)}-${pad(dd)}`
      return toDays(d) < toDays(today) ? `${y + 1}-${pad(mm)}-${pad(dd)}` : d
    }
    if (m[1]) {
      if (!isISODate(m[1])) return false
      date = m[1]
    } else if (m[2]) date = yearOf(Number(m[2]), Number(m[3]))
    else if (m[4]) date = yearOf(Number(m[4]), Number(m[5]))
    else if (w === '今天' || w === '今日' || w === 'today') date = today
    else if (w === '今晚' || w === 'tonight') (date = today), (period = '晚上')
    else if (w === '今早') (date = today), (period = '上午')
    else if (w === '明天' || w === '明日' || w === 'tomorrow') date = addDays(today, 1)
    else if (w === '明早') (date = addDays(today, 1)), (period = '上午')
    else if (w === '明晚') (date = addDays(today, 1)), (period = '晚上')
    else if (w === '后天') date = addDays(today, 2)
    else if (w === '大后天' || /day\s+after\s+tomorrow/.test(w)) date = /day\s+after/.test(w) ? addDays(today, 2) : addDays(today, 3)
    else if (m[6]) date = addDays(nextMonday(today), 7 + ((WDC[m[6]]! + 6) % 7))
    else if (m[7]) date = addDays(nextMonday(today), (WDC[m[7]]! + 6) % 7)
    else if (m[8]) date = addDays(today, (WDC[m[8]]! - weekday(today) + 7) % 7)
    else if (m[9]) {
      const d = Number(m[9])
      if (d < 1 || d > 31) return false
      const y = Number(today.slice(0, 4))
      const mo = Number(today.slice(5, 7))
      let c = dayOfMonth(y, mo, d)
      if (toDays(c) < toDays(today)) c = mo === 12 ? dayOfMonth(y + 1, 1, d) : dayOfMonth(y, mo + 1, d)
      date = c
    } else if (m[10]) date = addDays(nextMonday(today), (enDay(m[10]) + 6) % 7)
    else if (m[11] || m[12]) date = addDays(today, (enDay((m[11] ?? m[12])!) - weekday(today) + 7) % 7)
    else if (m[13]) date = addDays(today, Number(m[13]))
    else return false
  })

  // ---------- 钟点 ----------
  const PERIOD = '(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上)'
  take(
    new RegExp(`${PERIOD}?\\s*(?:(\\d{1,2})[:：](\\d{2})(?!\\d)|(${NUMS})点(?:(半)|(一刻)|(三刻)|(${NUMS})分?)?|(?:\\bat\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)\\b|\\bat\\s+(\\d{1,2})(?::(\\d{2}))?\\b)`, 'i'),
    (m) => {
      let h: number
      let mm = 0
      if (m[2]) (h = Number(m[2])), (mm = Number(m[3]))
      else if (m[4]) {
        h = num(m[4])
        if (m[5]) mm = 30
        else if (m[6]) mm = 15
        else if (m[7]) mm = 45
        else if (m[8]) mm = num(m[8])
      } else if (m[9]) {
        h = Number(m[9])
        mm = m[10] ? Number(m[10]) : 0
        const ap = m[11]!.toLowerCase()
        if (ap === 'pm' && h < 12) h += 12
        if (ap === 'am' && h === 12) h = 0
      } else {
        h = Number(m[12])
        mm = m[13] ? Number(m[13]) : 0
      }
      const p = m[1] ?? period
      if (p && /下午|晚上|傍晚/.test(p) && h < 12) h += 12
      if (p === '中午' && h < 11) h += 12
      if (!(h >= 0 && h < 24 && mm >= 0 && mm < 60)) return false
      time = `${pad(h)}:${pad(mm)}`
    },
  )

  // ---------- 优先级、清单 ----------
  take(/[!！](高|中|低|high|medium|med|low)(?![\p{L}\d])/iu, (m) => void (prio = ({ 高: 3, 中: 2, 低: 1, high: 3, medium: 2, med: 2, low: 1 } as Record<string, Prio>)[m[1]!.toLowerCase()]!))
  take(/(?:^|\s)#([^\s#]+)/, (m) => void (list = m[1]!))

  // 有重复、没写日子：第一次是哪天（工作日、每周几、每月几日从今天起找第一个对得上的，别的就是今天）；只写了钟点：今天
  if (repeat && !date) {
    const r = parseRepeat(repeat)
    date = r && (r.kind === 'workday' || r.kind === 'weekdays' || r.kind === 'monthday') ? nextDate(r, null, addDays(today, -1)) : today
  }
  if (time && !date) date = today

  const title = s
    .replace(/\s+/g, ' ')
    .trim()
    // 英文里留下的介词
    .replace(/\s+(?:at|on|by)$/i, '')
  return { title, date, time, repeat, prio, list, hits }
}
