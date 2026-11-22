/**
 * 提醒（🔔 后面写的中文）：准时、提前 N 分钟 / 小时 / 天、前一天 HH:MM。没写钟点的那天按 09:00 算到点。
 * 响过、推迟、勾掉不改笔记，记在库里 .canvas-tasks/提醒/<设备名>/YYYY-MM.jsonl：每台设备只写自己那份（Git 合并不打架），
 * 读的时候把所有设备的合起来看（哪台响过都算响过）。一行一条 JSON：
 *   {"t":"2026-11-23T14:00:03+01:00","id":"a1b2c3","due":"2026-11-23T14:00","ev":"fired","title":"交论文初稿","path":"写作/小论文计划.md"}
 *   ev：fired 响了（at 是这次响的钟点，没写就是 due）、snooze 推迟到 until、done 从提醒里勾掉、dismiss 关掉了
 */
import { addDays, addMinutes, minutesOf, normTime } from './dates'

export type Remind = { kind: 'before'; minutes: number } | { kind: 'dayBefore'; at: string }

/** 没写钟点的待办几点算到点 */
export const ALL_DAY_AT = '09:00'

export function parseRemind(raw: string): Remind | null {
  const s = raw.replace(/\s+/g, '')
  if (s === '准时' || s === '到点') return { kind: 'before', minutes: 0 }
  let m = /^提前(\d{1,4})(分钟|分|小时|个小时|天)$/.exec(s)
  if (m) {
    const n = Number(m[1])
    return { kind: 'before', minutes: m[2] === '天' ? n * 1440 : m[2]!.includes('时') ? n * 60 : n }
  }
  m = /^前一天(\d{1,2}[:：]\d{2})$/.exec(s)
  if (m) {
    const at = normTime(m[1]!)
    return at ? { kind: 'dayBefore', at } : null
  }
  return null
}

export function formatRemind(r: Remind): string {
  if (r.kind === 'dayBefore') return `前一天${r.at}`
  if (r.minutes === 0) return '准时'
  if (r.minutes % 1440 === 0) return `提前${r.minutes / 1440}天`
  if (r.minutes % 60 === 0) return `提前${r.minutes / 60}小时`
  return `提前${r.minutes}分钟`
}

/** 什么时候响：「2026-11-23T14:00」；没日子、说法认不出返回 null */
export function fireAt(date: string | null, time: string | null, remind: string | null): string | null {
  if (!date || !remind) return null
  const r = parseRemind(remind)
  if (!r) return null
  if (r.kind === 'dayBefore') return `${addDays(date, -1)}T${r.at}`
  const due = `${date}T${time ?? ALL_DAY_AT}`
  return addMinutes(due, -r.minutes)
}

export type RemindEv = 'fired' | 'snooze' | 'done' | 'dismiss'

export interface RemindEvent {
  /** 记下的时刻（带时区的 ISO） */
  t: string
  /** 哪一条：🆔，没有编号的用 keyOf 算出来的 */
  id: string
  /** 原来该响的钟点（换了日子就是另一次提醒） */
  due: string
  ev: RemindEv
  /** snooze：推迟到几点 */
  until?: string
  /** fired：这次响的是几点那一次（推迟后再响），没写就是 due */
  at?: string
  title?: string
  path?: string
}

export function eventLine(e: RemindEvent): string {
  return JSON.stringify(e) + '\n'
}

/** 读一份或几份 jsonl 合起来的字；坏行（合并冲突留下的、手改坏的）跳过 */
export function parseEvents(text: string): RemindEvent[] {
  const out: RemindEvent[] = []
  for (const l of text.split('\n')) {
    if (!l.trim()) continue
    try {
      const o = JSON.parse(l) as Partial<RemindEvent>
      if (typeof o.t === 'string' && typeof o.id === 'string' && typeof o.due === 'string' && (o.ev === 'fired' || o.ev === 'snooze' || o.ev === 'done' || o.ev === 'dismiss')) out.push(o as RemindEvent)
    } catch {
      // 坏行跳过
    }
  }
  return out
}

/**
 * 这一次提醒（id + due）接下来该几点响；不用响了返回 null。
 * 照时间先后过一遍：推迟就改到推迟的钟点；响过（或关掉）的正好是现在排着的那一次就不再响；勾掉了就不响。
 */
export function reminderNext(events: readonly RemindEvent[], id: string, due: string): string | null {
  const mine = events.filter((e) => e.id === id && e.due === due).sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0))
  let next: string | null = due
  for (const e of mine) {
    if (e.ev === 'done') return null
    if (e.ev === 'snooze' && e.until) next = e.until
    else if ((e.ev === 'fired' || e.ev === 'dismiss') && next !== null && (e.at ?? due) === next) next = null
  }
  return next
}

export type Snooze = '10m' | '1h' | 'tomorrow'

/** 推迟到几点：now 是「2026-11-23T14:00:20」这样的本地钟点（秒不算） */
export function snoozeUntil(s: Snooze, now: string): string {
  const base = now.slice(0, 16)
  if (s === '10m') return addMinutes(base, 10)
  if (s === '1h') return addMinutes(base, 60)
  return `${addDays(base.slice(0, 10), 1)}T${ALL_DAY_AT}`
}

/**
 * 谁来响：app 是我们自己排本机通知；reminders 是这条已经镜像进系统「提醒事项」的「画布今日」列表，由提醒事项在每台设备上响，
 * 我们所有的 App 都不再给它排通知（2026-11-22 用户选的 A；画布今日的 main/mirror.ts 镜像过去、索引里标上，planReminders 就跳过）
 */
export type RingBy = 'app' | 'reminders'

export interface RemindTask {
  key: string
  date: string | null
  time: string | null
  remind: string | null
  done: boolean
  title: string
  path: string
  ringBy?: RingBy
}

export interface Planned<T extends RemindTask = RemindTask> {
  task: T
  /** 原来该响的钟点 */
  due: string
  /** 这次响的钟点（推迟过就是推迟到的） */
  at: string
}

/**
 * 排提醒：now 是本地钟点「2026-11-23T14:00:05」。
 * fire：已经到点、还在 catchUp 分钟以内没响过的（软件刚打开时补响，再早的不补）；next：下一个要响的（定时器排它）。
 */
export function planReminders<T extends RemindTask>(tasks: readonly T[], events: readonly RemindEvent[], now: string, catchUp = 60): { fire: Planned<T>[]; next: Planned<T> | null } {
  const cur = now.slice(0, 16)
  const from = addMinutes(cur, -catchUp)
  const fire: Planned<T>[] = []
  let next: Planned<T> | null = null
  for (const task of tasks) {
    if (task.done || task.ringBy === 'reminders') continue
    const due = fireAt(task.date, task.time, task.remind)
    if (!due) continue
    const at = reminderNext(events, task.key, due)
    if (!at) continue
    if (at <= cur) {
      if (at >= from) fire.push({ task, due, at })
    } else if (!next || at < next.at) next = { task, due, at }
  }
  fire.sort((a, b) => (a.at < b.at ? -1 : 1))
  return { fire, next }
}

/** 没有 🆔 的待办：用笔记路径 + 标题 + 日子算一个稳定的名字（推送服务照同一个算法算） */
export function keyOf(path: string, title: string, date: string | null): string {
  let h = 2166136261
  for (const c of `${path}\n${title}\n${date ?? ''}`) {
    h ^= c.codePointAt(0)!
    h = Math.imul(h, 16777619) >>> 0
  }
  return 'k' + h.toString(36)
}

/** 提醒记录那份文件放哪：.canvas-tasks/提醒/<设备名>/YYYY-MM.jsonl */
export function logPath(device: string, month: string): string {
  return `.canvas-tasks/提醒/${device}/${month}.jsonl`
}

/** 设备名做文件夹名：去掉斜杠、冒号这类不能进路径的 */
export const deviceDir = (name: string): string => name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim() || 'mac'

export { minutesOf }
