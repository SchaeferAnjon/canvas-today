/**
 * AI 拆小步、排进空着的时间（v2 原型 splitItems / freeSlots）要问 AI 的话、读回来的答案怎么认、排的钟点怎么查。纯函数，单元测试在 test/ai-plan.test.ts。
 * 问一次、不给工具；先给人看（详情里的框、日历里的虚线框），收下才写进库里。
 */
import { type ISODate, minutesOf } from '@cn/tasks'

// ---------- 拆成小步 ----------

export const SPLIT_SYSTEM = `你帮一个人把一条待办拆成马上就能动手的几小步。
只回一个 JSON 数组，3 到 6 个字符串，一个字符串是一步：用这条待办的语言写，动词开头，每步不超过 20 个字，不编号，不加别的话。
已经有的子任务不要再写。拆不了（本来就是一步）也给 3 步：准备、做、检查。`

export interface SplitInput {
  title: string
  date: string | null
  /** 「写作/小论文计划.md」 */
  path: string
  /** 上面最近的标题（「下周」） */
  heading: string | null
  subs: string[]
  /** 这一条前后几行（给 AI 看上下文） */
  around: string
}

export function splitPrompt(x: SplitInput): string {
  return [
    `待办：${x.title}`,
    x.date ? `日子：${x.date}` : '日子：没定',
    `在哪篇笔记：${x.path}${x.heading ? `，标题「${x.heading}」下面` : ''}`,
    `已经有的子任务：${x.subs.length ? x.subs.join('；') : '（无）'}`,
    '笔记里这一条前后的几行：',
    x.around,
  ].join('\n')
}

/** 回答里第一个 JSON 数组（前后有字、包在 ``` 里都认） */
function firstArray(text: string): unknown[] | null {
  const s = text.indexOf('[')
  const e = text.lastIndexOf(']')
  if (s < 0 || e <= s) return null
  try {
    const v = JSON.parse(text.slice(s, e + 1)) as unknown
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

/** 拆出来的几步：去掉编号、空的、重复的、和已有子任务一样的，最多 8 步、每步最多 60 个字 */
export function parseSteps(text: string, existing: string[] = []): string[] {
  const arr = firstArray(text)
  if (!arr) return []
  const seen = new Set(existing.map((x) => x.trim()))
  const out: string[] = []
  for (const v of arr) {
    if (typeof v !== 'string') continue
    const s = v
      .replace(/^\s*(?:[-*•]|\d+[.、)）])\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length === 8) break
  }
  return out
}

// ---------- 排进空着的时间 ----------

/** 一天里能排的钟点（照原型 08:00 到 21:00） */
export const DAY_FROM = 8 * 60
export const DAY_TO = 21 * 60
export const DEFAULT_LEN = 60

export interface SchedCandidate {
  key: string
  title: string
  date: ISODate
  /** 3 高 2 中 1 低 0 没设 */
  prio: number
}

/** 占着的一段（日程、有钟点的待办）：哪天、从几点到几点（分钟） */
export interface Busy {
  date: ISODate
  from: number
  to: number
  title: string
}

export interface Slot {
  key: string
  date: ISODate
  time: string
  minutes: number
}

export const SCHED_SYSTEM = `你帮一个人把今天、明天还没定钟点的待办排进空着的时间。
只回一个 JSON 数组，每项 {"key": "照抄给你的 key", "time": "HH:MM", "minutes": 一件事要多少分钟（30 到 120）}，日子不改。
不能和占着的时间（日程、已经有钟点的待办）重叠，彼此也不重叠；都在 08:00 到 21:00 之间；今天的不早于「现在」；排不下的就不排。
先排重要的（优先级高的）；一件事一般 60 分钟，看名字估。不加别的话。`

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function schedulePrompt(now: { date: ISODate; time: string }, cands: SchedCandidate[], busy: Busy[]): string {
  const days = [...new Set(cands.map((c) => c.date))].sort()
  return [
    `现在：${now.date} ${now.time}`,
    '要排的待办：',
    ...cands.map((c) => `- key=${c.key} · ${c.title} · ${c.date} · 优先级${['没设', '低', '中', '高'][c.prio] ?? '没设'}`),
    '占着的时间：',
    ...days.map((d) => {
      const b = busy.filter((x) => x.date === d).sort((a, c) => a.from - c.from)
      return `${d}：${b.length ? b.map((x) => `${hm(x.from)}–${hm(x.to)} ${x.title}`).join('；') : '没有'}`
    }),
  ].join('\n')
}

const overlap = (a: { from: number; to: number }, b: { from: number; to: number }) => a.from < b.to && b.from < a.to

/**
 * AI 排的查一遍：key 要是给它的那几条、日子就是那一条自己的、钟点在 08:00–21:00 里、今天的不早于现在、
 * 不和占着的、也不和前面收下的重叠；不对的那一条丢掉（不替 AI 挪）
 */
export function fitSchedule(answer: string, cands: SchedCandidate[], busy: Busy[], now: { date: ISODate; time: string }): Slot[] {
  const arr = firstArray(answer) ?? []
  const byKey = new Map(cands.map((c) => [c.key, c]))
  const taken: Busy[] = [...busy]
  const out: Slot[] = []
  for (const v of arr) {
    if (!v || typeof v !== 'object') continue
    const o = v as { key?: unknown; time?: unknown; minutes?: unknown }
    const c = typeof o.key === 'string' ? byKey.get(o.key) : undefined
    if (!c || out.some((s) => s.key === c.key)) continue
    if (typeof o.time !== 'string' || !/^\d{2}:\d{2}$/.test(o.time)) continue
    const from = minutesOf(o.time)
    if (Number.isNaN(from) || Number(o.time.slice(0, 2)) > 23 || Number(o.time.slice(3)) > 59) continue
    const len = typeof o.minutes === 'number' && o.minutes >= 15 && o.minutes <= 180 ? Math.round(o.minutes / 5) * 5 : DEFAULT_LEN
    const span = { from, to: from + len }
    if (span.from < DAY_FROM || span.to > DAY_TO) continue
    if (c.date === now.date && from < minutesOf(now.time)) continue
    if (taken.some((b) => b.date === c.date && overlap(b, span))) continue
    taken.push({ date: c.date, ...span, title: c.title })
    out.push({ key: c.key, date: c.date, time: o.time, minutes: len })
  }
  return out
}

/** 照原型 freeSlots 的排法（测试用的假 AI 照它答）：今天从现在往后取整到半点再加半小时、明天从 9 点，一件 60 分钟，避开占着的 */
export function freeSlots(cands: SchedCandidate[], busy: Busy[], now: { date: ISODate; time: string }): Slot[] {
  const out: Slot[] = []
  const taken: Busy[] = [...busy]
  for (const c of [...cands].sort((a, b) => b.prio - a.prio).slice(0, 4)) {
    let s = c.date === now.date ? Math.ceil(minutesOf(now.time) / 30) * 30 + 30 : 9 * 60
    s = Math.max(s, DAY_FROM)
    while (taken.some((b) => b.date === c.date && overlap(b, { from: s, to: s + DEFAULT_LEN }))) s += 30
    if (s + DEFAULT_LEN > DAY_TO) continue
    taken.push({ date: c.date, from: s, to: s + DEFAULT_LEN, title: c.title })
    out.push({ key: c.key, date: c.date, time: hm(s), minutes: DEFAULT_LEN })
  }
  return out
}
