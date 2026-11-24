/**
 * MeetCaption 联动（画布今日这一侧，设计 24-meetcaption联动「已定（2026-11-23）」第 11 件：画布今日到点提醒辅助）：
 * - 今天有哪几节课：库里 .canvas-notes/meetcaption.json 的课表（MeetCaption 连库时写），加上系统日历里对上的日程（对不上的日程不管）；
 * - 上课前 N 分钟问一句「开字幕吗」，点「开字幕」走 meetcaption://start（写法在 @cn/format 的 meetcaption.ts，两边共用）；
 * - 上课记录里 MeetCaption 写的 `- [ ] … [▶ 09:43](meetcaption://open?session=…&t=…)`：画布今日照普通任务行读写，另外认出「来自哪节课、哪一刻」。
 * 纯函数，主进程和界面都用；不碰 Electron、Node。
 */
import type { CalEvent } from '@cn/calendar'
import { clockLabel, isMcMode, type McMode, parseMcOpen, sessionClock, sessionDate } from '@cn/format'
import type { McLive, McProject } from '../../../notes/src/shared/meetcaption'

export type { McLive, McProject }

export const MC_MAP_FILE = '.canvas-notes/meetcaption.json'
export const MC_LIVE_NAME = 'canvas-notes-live.json'
/** 设置「上课前问开字幕吗」能选的（分钟）；null 是不问 */
export const MC_LEADS = [null, 0, 2, 5, 10] as const
export type McLead = (typeof MC_LEADS)[number]
export const DEFAULT_MC_LEAD: McLead = 5
/** 过了开始时刻多久还问（刚打开软件、睡眠醒来） */
export const LATE_MIN = 5
/** 日历里没写多长的课（照课表的）当多长 */
export const CLASS_MIN = 90
/** 正在上课的状态多久以前开始的就不算了（MeetCaption 崩了没写下课） */
const LIVE_MAX_MS = 6 * 3600_000

/** meetcaption.json 读出来的（不对的项丢掉，同画布笔记 main/meetcaption.ts） */
export function parseProjects(raw: unknown): McProject[] {
  const o = raw as { projects?: unknown } | null
  if (!o || typeof o !== 'object' || !Array.isArray(o.projects)) return []
  return o.projects.flatMap((p: Record<string, unknown>): McProject[] => {
    if (!p || typeof p.id !== 'string' || !p.id || typeof p.folder !== 'string') return []
    const schedule = Array.isArray(p.schedule)
      ? p.schedule
          .filter((s: Record<string, unknown>) => s && Number.isInteger(s.weekday) && (s.weekday as number) >= 0 && (s.weekday as number) <= 6 && typeof s.time === 'string' && /^\d{1,2}:\d{2}$/.test(s.time))
          .map((s: Record<string, unknown>) => ({ weekday: s.weekday as number, time: (s.time as string).padStart(5, '0') }))
      : []
    const mode: McMode = isMcMode(p.mode) ? p.mode : 'class'
    return [{ id: p.id, folder: p.folder.replace(/\/+$/, ''), mode, ...(typeof p.name === 'string' && p.name ? { name: p.name } : {}), ...(typeof p.calendar === 'string' && p.calendar ? { calendar: p.calendar } : {}), schedule }]
  })
}

/** live.json 读出来的；没在上课、读不懂是 null */
export function parseLive(raw: unknown): McLive | null {
  const r = raw as Record<string, unknown> | null
  if (!r || typeof r !== 'object' || typeof r.session !== 'string' || typeof r.startedAt !== 'number') return null
  return {
    session: r.session,
    startedAt: r.startedAt,
    ...(typeof r.project === 'string' ? { project: r.project } : {}),
    ...(isMcMode(r.mode) ? { mode: r.mode } : {}),
    ...(typeof r.file === 'string' ? { file: r.file } : {}),
    ...(typeof r.endedAt === 'number' ? { endedAt: r.endedAt } : {}),
    ...(typeof r.todos === 'number' ? { todos: r.todos } : {}),
    ...(typeof r.dated === 'number' ? { dated: r.dated } : {}),
  }
}

/** 正在上课（开着字幕）：没下课、不是很久以前开始的 */
export const isLive = (l: McLive | null, now: number): l is McLive => !!l && l.endedAt === undefined && now - l.startedAt < LIVE_MAX_MS

/** 课在界面、通知上叫什么：项目名 → 文件夹最后一段 → id */
export const projectName = (p: McProject) => p.name ?? p.folder.split('/').pop() ?? p.id

const CJK = /[぀-ヿ㐀-鿿가-힯]/
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** 标题里有这个名字：拉丁字母整词、不分大小写（「ECP」认「ecp 课」，不认「recp」）；中日韩的名字直接包含就算 */
function hasName(title: string, name: string): boolean {
  const n = name.trim()
  if (n.length < 2) return false
  if (CJK.test(n)) return title.toLowerCase().includes(n.toLowerCase())
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc(n)}($|[^\\p{L}\\p{N}])`, 'iu').test(title)
}

/** 一门课在日历里可能叫的名字：写了日程名只认它；没写认项目名、id、文件夹名，文件夹名「ECP-Emerging-Computing-Paradigms」也拆成「ECP」「Emerging Computing Paradigms」 */
export function namesOf(p: McProject): string[] {
  if (p.calendar) return [p.calendar]
  const last = p.folder.split('/').pop() ?? ''
  const out = [p.name ?? '', p.id, last]
  const m = /^([^-_\s]+)[-_\s]+(.+)$/.exec(last)
  if (m) out.push(m[1]!, m[2]!.replace(/[-_]+/g, ' '))
  return [...new Set(out.filter((x) => x.trim().length >= 2))]
}

/** 这个日程是不是这门课 */
export function eventIsProject(ev: Pick<CalEvent, 'title'>, p: McProject): boolean {
  return namesOf(p).some((n) => hasName(ev.title, n))
}

export interface McClass {
  /** 认这一节：日子|项目|开始钟点（问过就不再问） */
  key: string
  project: McProject
  name: string
  date: string
  /** 「09:00」 */
  start: string
  /** 「10:30」；照课表的是开始加 90 分钟 */
  end: string
  /** 照日历（日程的标题）还是照课表 */
  via: 'calendar' | 'schedule'
  event: string | null
}

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))
const toHm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
/** 「2026-11-24」是周几（0 周日） */
const weekdayOf = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).getDay()

/**
 * 这一天的课：日历里对上哪门课的日程（不是全天、在这一天开始的），加上课表里这一天的（同一门课一小时内已经有日历那一节的不重复）；按开始排
 */
export function classesOn(date: string, projects: McProject[], events: CalEvent[]): McClass[] {
  const out: McClass[] = []
  for (const ev of events) {
    if (ev.allDay || ev.start.slice(0, 10) !== date || ev.start.length < 16) continue
    const p = projects.find((x) => eventIsProject(ev, x))
    if (!p) continue
    const start = ev.start.slice(11, 16)
    const end = ev.end.slice(0, 10) === date && ev.end.length >= 16 ? ev.end.slice(11, 16) : toHm(toMin(start) + CLASS_MIN)
    out.push({ key: `${date}|${p.id}|${start}`, project: p, name: projectName(p), date, start, end, via: 'calendar', event: ev.title })
  }
  const wd = weekdayOf(date)
  for (const p of projects)
    for (const s of p.schedule) {
      if (s.weekday !== wd) continue
      if (out.some((c) => c.project.id === p.id && Math.abs(toMin(c.start) - toMin(s.time)) <= 60)) continue
      out.push({ key: `${date}|${p.id}|${s.time}`, project: p, name: projectName(p), date, start: s.time, end: toHm(toMin(s.time) + CLASS_MIN), via: 'schedule', event: null })
    }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))
}

/**
 * 现在该问「开字幕吗」的那几节：开始前 lead 分钟起、开始后 LATE_MIN 分钟内；nowMin 是当天第几分钟。
 * lead 是 null（设置里选了不问）一节都不问
 */
export function dueToAsk(classes: McClass[], nowMin: number, lead: McLead): McClass[] {
  if (lead === null) return []
  return classes.filter((c) => {
    const s = toMin(c.start)
    return nowMin >= s - lead && nowMin < s + LATE_MIN
  })
}

/** 这一节在今日页上还要不要「开字幕」那颗按钮：还没下课 */
export const notOver = (c: McClass, nowMin: number) => nowMin < toMin(c.end)

/** 「09:00」→「9:00」（通知标题照设计稿写法） */
export const shortClock = (hm: string) => hm.replace(/^0(\d)/, '$1')

// ---------- 上课记录里的待办 ----------

/** 一条待办来自哪节课、哪一刻（TaskView.mc） */
export interface McSrc {
  /** 属性「课程」（项目 id）；没写是 null，界面拿笔记名 */
  course: string | null
  session: string
  /** 那一场开始后第几秒 */
  t: number
  /** 那一刻的钟点「09:43」 */
  clock: string
  /** 记录的日子（属性「日期」，没写用那一场的） */
  date: string | null
  /** 去掉 ▶ 时间以后的标题（界面、通知上显示；文件里那一行不动） */
  title: string
}

const LINK = /\[▶[^\]]*\]\((meetcaption:\/\/open\?[^)\s]+)\)/
const LINK_ALL = /\s*\[▶[^\]]*\]\(meetcaption:\/\/open\?[^)\s]+\)/g

/** 标题里去掉 ▶ 时间链接 */
export const stripMcLinks = (title: string) => title.replace(LINK_ALL, '').replace(/\s{2,}/g, ' ').trim()

/** 详情里改了标题（改的是不带 ▶ 的那串）：原标题里的 ▶ 时间接回去，文件里那一行不丢「来自哪一刻」 */
export function withMcLinks(title: string, old: string): string {
  const links = old.match(LINK_ALL)?.map((x) => x.trim()) ?? []
  return [title, ...links].join(' ')
}

/** 上课记录里一行待办的来处；这一行没有 ▶ 时间是 null。course、date 是这一篇的属性 */
export function mcSrcOf(raw: string, title: string, meta: { course: string | null; date: string | null }): McSrc | null {
  const m = LINK.exec(raw)
  const o = m ? parseMcOpen(m[1]!) : null
  if (!o) return null
  const c = sessionClock(o.session)
  return {
    course: meta.course,
    session: o.session,
    t: o.t,
    clock: c === null ? (/\[▶\s*([^\]]*)\]/.exec(m![0])?.[1]?.trim() ?? '') : clockLabel(c + o.t),
    date: meta.date ?? sessionDate(o.session),
    title: stripMcLinks(title) || title,
  }
}

/** 「来自 ECP 09:43」里的课名：项目名（meetcaption.json 里那门课）→ 属性「课程」→ 笔记名 */
export function srcCourse(src: McSrc, path: string, projects: McProject[]): string {
  const p = projects.find((x) => x.id === src.course) ?? projects.find((x) => path.startsWith(x.folder + '/'))
  return p ? projectName(p) : (src.course ?? path.replace(/^.*\//, '').replace(/\.md$/i, ''))
}
