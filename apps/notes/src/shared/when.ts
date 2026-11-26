/**
 * 全软件界面上的日期只有这一种写法（DESIGN.md「日期」），别处不再自己拼：
 * - 只写哪天（列表右边、卡片和文件夹的元信息）：今天写钟点「10:34」、昨天「昨天」、这周「周四」、今年「11月6日」、往年「2024年11月6日」
 * - 带钟点（time: true，历史、提交、剪的时间、检查更新、AI 对话）：「今天 10:34」「昨天 21:05」「周四 21:05」「11月6日 09:30」「2024年11月6日 09:30」
 * 中文和数字之间不手打空格，间距交给 text-autospace。写进文件里的日期（2026-11-15）不归这里管。
 * 英文界面（task-zojmg，设计稿第 5 节「日期」）用 Intl.DateTimeFormat：「10:34」「Yesterday」「Thu」「Nov 6」「Nov 6, 2024」，
 * 带钟点「Today 10:34」；12 / 24 小时制跟系统（shared/i18n 的 hour12）。不给 lang 时跟界面语言。
 */
import { hour12, type Lang, tIn, uiLang } from './i18n'

const DAY_MS = 86400_000
const p2 = (x: number) => String(x).padStart(2, '0')

const EN = {
  weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short' }),
  md: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
  ymd: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  h12: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
}

export function when(ms: number, opts: { now?: number; time?: boolean; lang?: Lang } = {}): string {
  const lang = opts.lang ?? uiLang()
  const d = new Date(ms)
  const now = new Date(opts.now ?? Date.now())
  const hm = clock(ms, lang)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  let day: string
  if (ms >= start && ms < start + DAY_MS) {
    if (!opts.time) return hm
    day = tIn(lang, '今天')
  } else if (ms >= start - DAY_MS && ms < start) day = tIn(lang, '昨天')
  else if (ms >= start - 6 * DAY_MS && ms < start) day = lang === 'en' ? EN.weekday.format(d) : '周' + '日一二三四五六'[d.getDay()] // 不翻：中文的星期写法
  else day = dateText(ms, now.getTime(), lang)
  return opts.time ? `${day} ${hm}` : day
}

/** 哪一天（不说今天昨天）：今年「11月6日」，往年「2024年11月6日」；英文「Nov 6」「Nov 6, 2024」。首页问候、日历、提示里的日子 */
export function dateText(ms: number, nowMs = Date.now(), lang: Lang = uiLang()): string {
  const d = new Date(ms)
  const thisYear = d.getFullYear() === new Date(nowMs).getFullYear()
  if (lang === 'en') return (thisYear ? EN.md : EN.ymd).format(d)
  const md = `${d.getMonth() + 1}月${d.getDate()}日` // 不翻：中文的日子写法
  return thisYear ? md : `${d.getFullYear()}年${md}` // 不翻
}

/** 钟点「09:05」；英文界面、系统用 12 小时制时「9:05 AM」 */
export const clock = (ms: number, lang: Lang = uiLang()) => {
  const d = new Date(ms)
  if (lang === 'en' && hour12()) return EN.h12.format(d)
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/**
 * 往后的一天（待办的日子、到点提醒，task-i921u 自动化「加一条待办」）：「今天 09:00」「明天 21:00」、这周还没到的「周五 09:00」、
 * 下周「下周一 09:00」，再往后「11月30日 09:00」、往年带年。day 是写进文件的 2026-11-30，time 是 09:00 或没有。英文「Today」「Tomorrow」「Mon」「Nov 30」
 */
export function dueText(day: string, time: string | null, nowMs = Date.now(), lang: Lang = uiLang()): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  const now = new Date(nowMs)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((date.getTime() - today.getTime()) / DAY_MS)
  /** 周一开头：今天是这周第几天（0 是周一） */
  const wd = (today.getDay() + 6) % 7
  const week = (x: Date) => (lang === 'en' ? EN.weekday.format(x) : '周' + '日一二三四五六'[x.getDay()]) // 不翻：中文的星期写法
  let text: string
  if (days === 0) text = tIn(lang, '今天')
  else if (days === 1) text = tIn(lang, '明天')
  else if (days > 1 && days < 7 - wd) text = week(date)
  else if (days >= 7 - wd && days < 14 - wd) text = lang === 'en' ? `${tIn(lang, '下周')} ${week(date)}` : '下' + week(date) // 不翻：中文「下周一」
  else text = dateText(date.getTime(), nowMs, lang)
  return time ? `${text} ${time}` : text
}
