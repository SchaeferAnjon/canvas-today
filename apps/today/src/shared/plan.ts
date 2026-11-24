/**
 * 排一天（2026-11-23 用户选方向 B，设计页 45-画布今日特色 的 B1–B5）：早上挑今天做的、估时、排进日历的空档；白天跟着「现在」那一块；晚上收工写进日记。
 * 这里是纯函数（界面、主进程、单元测试 test/plan.test.ts 共用），不碰文件、不拿系统时间。
 *
 * 时间块怎么存（task 第 4 条，定了写在 docs/DEVELOPMENT.md）：开始的钟点就是那一行 📅 后面的钟点，多长是「[估时:: 30分钟]」（@cn/tasks duration.ts）；
 * 都在库里那一行上，换台设备、Git 拉下来、以后的 iPad 版都看得到。没估的按一小时算（日历上的块默认也画一小时）。
 */
// 只引日历的算法（主进程也用这一份：菜单栏那一行），不把 React 组件带进主进程
import { type CalEvent, eventsOn } from '@cn/calendar/model'
import { type ISODate, diffDays, hhmm, minutesOf } from '@cn/tasks'
import type { TaskView } from './api'
import { INBOX_NOTE } from './brand'
import { type Lang, tr } from './i18n'
import { listed, open } from './views'
import { isoPlus, mdLabel } from './when'

/** 没估的按多久算（分钟） */
export const DEFAULT_EST = 60
/** 估时那一排几格 */
export const EST_CHOICES = [15, 30, 60, 120] as const
/** 一天里能排事的时段（同 AI 排空档 ai-plan.ts 的 08:00–21:00） */
export const DAY_FROM = 8 * 60
export const DAY_TO = 21 * 60

export const est = (t: Pick<TaskView, 'minutes'>): number => t.minutes ?? DEFAULT_EST

export type PlanStep = 'left' | 'pick' | 'place' | 'now' | 'close'
export const MORNING: PlanStep[] = ['left', 'pick', 'place', 'now']

const byWhen = (a: TaskView, b: TaskView) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.path.localeCompare(b.path) || a.line - b.line

/**
 * 早上挑的几堆（只算没做完的、日子类看法里列出来的那份，抄了几遍的只算一条）：
 *   left 过期没做完的（昨天剩下的在前，越早的越往后）；today 今天的；inbox 收件箱里没日子的；week 往后六天到期的
 */
export function planLists(ts: readonly TaskView[], today: ISODate) {
  const live = ts.filter((t) => open(t) && listed(t))
  return {
    left: live.filter((t) => t.date !== null && t.date < today).sort((a, b) => b.date!.localeCompare(a.date!) || byWhen(a, b)),
    today: live.filter((t) => t.date === today).sort(byWhen),
    inbox: live.filter((t) => t.path === INBOX_NOTE && t.parent === null && !t.date).sort((a, b) => a.line - b.line),
    week: live.filter((t) => t.date !== null && t.date > today && diffDays(t.date, today) < 7).sort((a, b) => a.date!.localeCompare(b.date!) || byWhen(a, b)),
  }
}

/** 一段时间（分钟，0–1440） */
export interface Span {
  from: number
  to: number
}

/** 某天占着的时间：系统日程（只算定时的；藏起的日历本来就不给）和有钟点、没做完的待办（skip 那条不算） */
export function busyOn(events: readonly CalEvent[], ts: readonly TaskView[], d: ISODate, skip?: string): Span[] {
  const out: Span[] = eventsOn(events, d).timed.map((s) => ({ from: s.from, to: s.to }))
  for (const t of ts) {
    if (t.key === skip || t.date !== d || !t.time || !open(t) || !listed(t)) continue
    const from = minutesOf(t.time)
    out.push({ from, to: Math.min(1440, from + est(t)) })
  }
  return out.sort((a, b) => a.from - b.from)
}

/** spans 合起来以后在 [from, to) 里占了多少分钟 */
function covered(spans: readonly Span[], from: number, to: number): number {
  let n = 0
  let at = from
  for (const s of [...spans].sort((a, b) => a.from - b.from)) {
    const a = Math.max(at, s.from)
    const b = Math.min(to, s.to)
    if (b > a) {
      n += b - a
      at = b
    }
  }
  return n
}

/** 今天还能用来做事的分钟：DAY_FROM–DAY_TO（今天从现在起）去掉日程 */
export function capacity(events: readonly CalEvent[], d: ISODate, today: ISODate, nowMin: number): number {
  const from = d === today ? Math.max(DAY_FROM, nowMin) : DAY_FROM
  if (from >= DAY_TO) return 0
  return DAY_TO - from - covered(eventsOn(events, d).timed, from, DAY_TO)
}

/** 往后找第一个放得下 minutes 的空档（从 after 起，对齐到一刻钟；放不下是 null） */
export function freeSlot(busy: readonly Span[], minutes: number, after: number, until = DAY_TO): number | null {
  let at = Math.ceil(Math.max(after, DAY_FROM) / 15) * 15
  for (;;) {
    if (at + minutes > until) return null
    const hit = busy.find((s) => s.from < at + minutes && s.to > at)
    if (!hit) return at
    at = Math.ceil(hit.to / 15) * 15
  }
}

/** 今天排了钟点、没做完的几块（按钟点） */
export function blocksToday(ts: readonly TaskView[], today: ISODate): TaskView[] {
  return ts.filter((t) => t.date === today && t.time && open(t) && listed(t)).sort(byWhen)
}

/** 「现在」那一块（钟点落在它里面的）和接下来的几块 */
export function nowAndNext(ts: readonly TaskView[], today: ISODate, nowMin: number): { cur: TaskView | null; next: TaskView[] } {
  const bs = blocksToday(ts, today)
  const cur = bs.find((t) => minutesOf(t.time!) <= nowMin && nowMin < minutesOf(t.time!) + est(t)) ?? null
  return { cur, next: bs.filter((t) => t !== cur && minutesOf(t.time!) + est(t) > nowMin) }
}

/** 这一块还剩几分钟 */
export const leftOf = (t: TaskView, nowMin: number): number => Math.max(0, minutesOf(t.time!) + est(t) - nowMin)

/**
 * 菜单栏图标旁边那一行（白天跟着）：正在做的那一块「写 Ex03 报告 · 还剩50分」；不在哪一块里是空的，
 * 菜单栏照旧写今天还有几条（快速加一条那条线的 MenuBar.setCount，下一件在小窗里）
 */
export function trayLine(lang: Lang, ts: readonly TaskView[], today: ISODate, nowMin: number, max = 18): string {
  const { cur } = nowAndNext(ts, today, nowMin)
  const cut = (s: string) => (s.length > max ? s.slice(0, max - 1) + '…' : s)
  return cur ? tr(lang, 'planTrayNow', cut(cur.title), leftOf(cur, nowMin)) : ''
}

/** 估时怎么说：「30分」「1时」「1时30分」（界面上的，不写进文件） */
export function estLabel(lang: Lang, n: number): string {
  const h = Math.floor(n / 60)
  const m = n % 60
  return lang === 'zh' ? (h ? `${h}时${m ? m + '分' : ''}` : `${m}分`) : h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`
}

/** 「4小时45分」：今天要做多久 / 能用多久（中文不手打空格，DESIGN.md「字体」） */
export function spanLabel(lang: Lang, n: number): string {
  const h = Math.floor(n / 60)
  const m = n % 60
  if (lang === 'zh') return h ? `${h}小时${m ? `${m}分` : ''}` : `${m}分钟`
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

// ---------- 收工：写进日记 ----------

/**
 * 日记放在哪：一个带 {date}（2026-11-23）和可选 {YYYY}、{MM} 的路径样子，「10-Journal/01daily/{YYYY}/{date}.md」。
 * 不写死文件夹名（画布笔记要给别人用）：先看设置里选的，再看 Obsidian 日记插件的设置，再从库里已有的「2026-11-22.md」这种文件认，
 * 都没有放在画布笔记的「周记」分类旁边（画布笔记的周记就在那，2026-W47.md）
 */
export interface JournalPlace {
  pattern: string
  /** chosen 设置里选的；obsidian 照 .obsidian/daily-notes.json；found 库里已有几篇；default 都没有 */
  how: 'chosen' | 'obsidian' | 'found' | 'default'
  /** found：库里照这个样子的有几篇 */
  count: number
}

const DAY_FILE = /^(\d{4})-(\d{2})-(\d{2})\.md$/i
/** 文件夹名像日记的（「01daily」「日记」「Journal」「Daily Notes」「每日」） */
const DIARY_NAME = /daily|diary|journal|日记|每日|日誌/i

/** 库里已有的日记长什么样：照「YYYY-MM-DD.md」的文件按样子分组，像日记的文件夹优先，再比篇数；少于 3 篇不算 */
export function journalCandidates(paths: readonly string[]): { pattern: string; count: number }[] {
  const groups = new Map<string, number>()
  for (const p of paths) {
    const parts = p.split('/')
    const m = DAY_FILE.exec(parts[parts.length - 1]!)
    if (!m) continue
    const [, y, mo] = m
    const dir = parts.slice(0, -1).map((s) => (s === y ? '{YYYY}' : s === `${y}-${mo}` ? '{YYYY}-{MM}' : s === mo && parts.includes(y!) ? '{MM}' : s))
    const pattern = [...dir, '{date}.md'].join('/')
    groups.set(pattern, (groups.get(pattern) ?? 0) + 1)
  }
  const diary = (p: string) => (DIARY_NAME.test(p) ? 1 : 0)
  return [...groups]
    .filter(([, n]) => n >= 3)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => diary(b.pattern) - diary(a.pattern) || b.count - a.count || a.pattern.localeCompare(b.pattern))
}

/**
 * Obsidian 日记插件的设置（.obsidian/daily-notes.json 的 folder、format）换成路径样子：format 只认 YYYY、MM、DD 和别的字原样（默认 YYYY-MM-DD）；
 * 有别的 moment 写法（dddd、Do…）认不了，返回 null
 */
export function obsidianPattern(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const folder = typeof o.folder === 'string' ? o.folder.replace(/^\/+|\/+$/g, '') : ''
  const format = typeof o.format === 'string' && o.format.trim() ? o.format.trim() : 'YYYY-MM-DD'
  const rest = format.replace(/YYYY|MM|DD/g, '')
  if (/[A-Za-z]/.test(rest)) return null
  const name = format === 'YYYY-MM-DD' ? '{date}' : format.replace(/YYYY/g, '{YYYY}').replace(/MM/g, '{MM}').replace(/DD/g, '{DD}')
  return `${folder ? folder + '/' : ''}${name}.md`
}

/** 照样子换成那一天的路径 */
export function journalPath(pattern: string, d: ISODate): string {
  return pattern.replace(/\{date\}/g, d).replace(/\{YYYY\}/g, d.slice(0, 4)).replace(/\{MM\}/g, d.slice(5, 7)).replace(/\{DD\}/g, d.slice(8, 10))
}

/** 设置里选的 → Obsidian 日记插件 → 库里认出来的 → 「周记」旁边 */
export function journalPlace(o: { chosen: string | null; obsidian: string | null; paths: readonly string[]; fallbackDir: string }): JournalPlace {
  if (o.chosen) return { pattern: o.chosen, how: 'chosen', count: 0 }
  if (o.obsidian) return { pattern: o.obsidian, how: 'obsidian', count: 0 }
  const c = journalCandidates(o.paths)[0]
  if (c) return { pattern: c.pattern, how: 'found', count: c.count }
  return { pattern: `${o.fallbackDir}/{date}.md`, how: 'default', count: 0 }
}

/** 收工那天每一条怎么了 */
export interface CloseItem {
  title: string
  /** 在哪篇（笔记名，写成 [[双链]] 点得回去） */
  note: string
  how: 'done' | 'moved' | 'dropped' | 'left'
  /** moved：挪到哪天 */
  to?: ISODate
}

/** 收工那一节的标题（再收一次换掉这一节，不另加一节） */
export const closeHeading = (lang: Lang) => `## ${tr(lang, 'planCloseHead')}`
const CLOSE_HEADS = ['## 收工', '## Shutdown']

/**
 * 写进日记的那一节：标题带钟点，一句做了几条、专注了多久，再一条一条（不写成「- [ ]」：那样画布今日又会把它当成一条新待办收进来，
 * 就是滴答同步把同一条抄进几十篇日记的那个样子；写「做完：…」「挪到 11月24日：…」，后面 [[笔记]] 点得回原来那一篇）
 */
export function closeSection(lang: Lang, o: { time: string; items: readonly CloseItem[]; focus: { n: number; minutes: number } }): string {
  const done = o.items.filter((x) => x.how === 'done').length
  const head = `${closeHeading(lang)} ${o.time}`
  const sum = o.focus.n ? tr(lang, 'planCloseSumFocus', done, o.focus.n, o.focus.minutes) : tr(lang, 'planCloseSum', done)
  const line = (x: CloseItem) => {
    const what = x.how === 'done' ? tr(lang, 'planCloseDone') : x.how === 'moved' ? tr(lang, 'planCloseMoved', mdLabel(lang, x.to!)) : x.how === 'dropped' ? tr(lang, 'planCloseDropped') : tr(lang, 'planCloseLeft')
    return `- ${what}${x.title}（[[${x.note}]]）`
  }
  const order: CloseItem['how'][] = ['done', 'moved', 'left', 'dropped']
  const lines = order.flatMap((h) => o.items.filter((x) => x.how === h).map(line))
  return [head, '', sum, ...(lines.length ? ['', ...lines] : [])].join('\n') + '\n'
}

/** 新建那一天的日记：一行标题 */
export const journalHead = (lang: Lang, d: ISODate, wd: string) => `# ${d} ${wd}\n`

/**
 * 把收工那一节放进日记：已经有「## 收工」（同一天又收了一次）就换掉那一节（到下一个一二级标题或文末），没有就接在最后，中间空一行。
 * 文件原来的换行（\r\n）照旧
 */
export function putClose(text: string, section: string): string {
  const crlf = text.includes('\r\n')
  const t = crlf ? text.replace(/\r\n/g, '\n') : text
  const lines = t.split('\n')
  const at = lines.findIndex((l) => CLOSE_HEADS.some((h) => l === h || l.startsWith(h + ' ')))
  let out: string
  if (at >= 0) {
    let end = lines.findIndex((l, i) => i > at && /^#{1,2} /.test(l))
    if (end < 0) end = lines.length
    const before = lines.slice(0, at).join('\n')
    const after = lines.slice(end).join('\n')
    out = before + (before ? '\n' : '') + section + (after ? '\n' + after : '')
  } else {
    const base = t.replace(/\n+$/, '')
    out = base ? `${base}\n\n${section}` : section
  }
  return crlf ? out.replace(/\n/g, '\r\n') : out
}

/** 收工时没做完的「挪去哪」几颗：明天、后天、下周一（today 是周日时下周一就是明天，换成后天） */
export const tomorrowOf = (today: ISODate) => isoPlus(today, 1)

/** 推到后面：原来那一块结束以后（已经过了就从现在起）找下一个放得下的空档；今天放不下返回 null（交给界面挪到明天） */
export function pushLater(t: TaskView, events: readonly CalEvent[], ts: readonly TaskView[], today: ISODate, nowMin: number): string | null {
  const busy = busyOn(events, ts, today, t.key)
  const after = Math.max(nowMin, t.time ? minutesOf(t.time) + est(t) : nowMin)
  const at = freeSlot(busy, est(t), after)
  return at === null ? null : hhmm(at)
}
