/**
 * 右栏 AI 对话（task-ykkoz，设计稿 32-今日AI排日程，用户「按推荐来」）：一句话让 AI 排待办。AI 看得到近两周的待办、收件箱里没定日子的、
 * 系统日历的日程（藏起的日历不算，main/calendar.ts 的 events 已经去掉），只回一张改动单：日子、钟点、优先级、拆小步四样，
 * 不新加、不删、不改名（以后再说）。软件照这里查一遍（只认这四样、日子是真的、不早于今天、不撞日程和别的钟点）再给人看，
 * 收下才写进库（main/edits.ts 的 applyPlan：一次改动、一次提交、能撤销）。纯函数，单元测试 test/ai-chat.test.ts。
 */
import type { EngineId } from '../../../notes/src/shared/agent'
import type { AgentMode, TodayStep, TodayTurnCommit } from './ai-agent'
import type { Material } from '@cn/ai-chat/materials'
import type { Mention } from '@cn/ai-chat/mentions'
import { addDays, isISODate, type ISODate, minutesOf, normTime, type Prio, weekday } from '@cn/tasks'

/** 交给 AI 看的一条待办：id 是这一问里的短编号（t1、t2…），AI 照抄；key、line、raw 是收下时认那一行用的 */
export interface CtxTask {
  id: string
  key: string
  title: string
  path: string
  line: number
  raw: string
  date: ISODate | null
  time: string | null
  prio: Prio
  /** 已有的子任务（标题） */
  subs: string[]
  /** 子任务（挂在别的待办下面） */
  child: boolean
}

export interface CtxEvent {
  title: string
  date: ISODate
  /** 全天的没有 */
  from?: number
  to?: number
}

export interface ChatCtx {
  now: { date: ISODate; time: string }
  tasks: CtxTask[]
  events: CtxEvent[]
}

/** 改动单里的一条：哪一条（收下时认行用的 key、path、line、raw），原来什么样，改成什么样（只写要改的） */
export interface PlanChange {
  key: string
  title: string
  path: string
  line: number
  raw: string
  from: { date: ISODate | null; time: string | null; prio: Prio }
  date?: ISODate
  /** null：拿掉钟点 */
  time?: string | null
  prio?: Prio
  steps?: string[]
}

/** 软件没收的（AI 说了，但不合规矩）：哪一条、为什么 */
export interface Dropped {
  title: string
  why: 'overlap' | 'past' | 'baddate' | 'nodate'
  /** 撞上的那个日程或待办 */
  with?: string
}

export interface ChatReply {
  say: string
  changes: PlanChange[]
  dropped: Dropped[]
  keep?: string
}

/** 一张改动卡的样子：open 还没定；took 收下了（undo 撤销用，n 改了几条）；dropped 不要了；undone 收下后又撤销了 */
export interface ChatPlan {
  changes: PlanChange[]
  dropped: Dropped[]
  keep?: string
  state: 'open' | 'took' | 'dropped' | 'undone'
  /** 收下时勾着的那几条（changes 的下标） */
  on?: number[]
  undo?: string
  n?: number
}

/**
 * 对话里的一条（存在画布笔记的 userData/ai/chats/ 里，和画布笔记的 AI 对话同一种文件：role、text、time、by 和它的 StoredMsg 一样，
 * 画布笔记的对话菜单也列得出、点开看得到字；plan、seen 是画布今日自己的）
 */
export interface TodayMsg {
  id: number
  role: 'user' | 'ai'
  time: number
  text: string
  /** 用户这句带的图（输入框里贴的、拖进来的、「+」选的；画布笔记 StoredMsg.mats 同一个写法）：text 里的 ①② 是它们的位置 */
  mats?: Material[]
  engine?: EngineId
  /** 「Claude Code · Opus 5.5 · High」 */
  by?: string
  /** AI 读了什么：待办几条、收件箱几条、日程几个（回答上面那两行灰字） */
  seen?: { tasks: number; inbox: number; events: number; eventNames: string[] }
  plan?: ChatPlan
  error?: string
  /** 全能模式（画布笔记的 agent 跑的，shared/ai-agent.ts）：这一问是全能还是只在库里、AI 做的每一步、这一轮改了的那次提交（能撤回） */
  mode?: AgentMode
  steps?: TodayStep[]
  commit?: TodayTurnCommit
  /** 用户这句 @ 点名的笔记 / 清单（对标清单 U1，@cn/ai-chat 的胶囊）：字里照旧是「@标题」 */
  mentions?: Mention[]
}

/** 对话列表里的一段 */
export interface ChatInfo {
  id: string
  title: string
  at: number
  asks: number
}

/** 存在画布笔记对话目录里的地方 key：today:<编号> */
export const chatPlace = (id: string) => `today:${id}`
export const chatIdOf = (place: string) => (place.startsWith('today:') ? place.slice(6) : null)

export const CHAT_SYSTEM = `你是「画布今日」里帮人安排待办的助手。你看得到这个人近两周的待办、收件箱里没定日子的待办、系统日历里的日程（日程只读，不能改）。
你只能改待办的四样：日子 date、钟点 time、优先级 prio、拆成小步 steps（加在这一条下面的子任务）。不能新加待办、不能删、不能改名字、不能改日程；用户要这些，就在 say 里说现在还做不了。
只回一个 JSON 对象，不加别的话：
{"say": "一两句话：你怎么排的、为什么", "changes": [{"id": "照抄待办前面的编号", "date": "YYYY-MM-DD", "time": "HH:MM", "prio": 3, "steps": ["一步", "一步"]}], "keep": "没动的为什么不动（可以不写）"}
每一项只写要改的那几样，不改的不写；time 写 null 是拿掉钟点。规矩：
- 日子要是真的日子，不早于今天；过期的挪到今天或以后。
- 有钟点的一件事按 60 分钟算：不能和日程重叠，彼此也不重叠，也不和已经有钟点的待办重叠；一般在 08:00 到 21:00 之间；今天的不早于现在。
- 优先级：3 高（⏫）、2 中（🔼）、1 低（🔽）、0 不设。
- 拆小步：3 到 6 步，动词开头，每步不超过 20 个字，已经有的子任务不再写。
- 用户附了图（课表、通知、聊天截图）：从图里读出日子和钟点，图里的课和安排当作已经占着的时间，和日程一样不能撞；图里有要新加的事，在 say 里说现在还加不了。
- 用户只是问问题、不用改的，changes 给空数组。
- say 和 keep 用用户说话的语言。`

const PRIO_ZH = ['没设', '低', '中', '高']
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** 前面几轮：用户的话、AI 说的、那张卡后来怎样了（交给 AI 接着聊，不靠命令行的会话） */
export function historyText(msgs: readonly TodayMsg[], keep = 8): string {
  const out: string[] = []
  for (const m of msgs.slice(-keep)) {
    if (m.role === 'user') {
      const n = m.mats?.filter((x) => x.kind === 'image').length ?? 0
      out.push(`用户：${m.text}${n ? `（附了${n}张图）` : ''}`)
    }
    else if (m.error) out.push('你：（这一问没答上）')
    else {
      const p = m.plan
      const st = !p || !p.changes.length ? '' : p.state === 'took' ? `（用户收下了${p.n ?? p.changes.length}条）` : p.state === 'dropped' ? '（用户没要）' : p.state === 'undone' ? '（收下后又撤销了）' : '（用户还没定）'
      out.push(`你：${m.text}${st}`)
    }
  }
  return out.join('\n')
}

/**
 * 全局快速输入框问 AI、全能模式关着时（用户 2026-11-25 选方案 B：「问 AI 能不能建待办跟全能模式开关走，开着就能建，关着只答」）：
 * 一次问、不给工具，只回答，不交改动单。不翻：给 AI 的系统提示
 */
export const ANSWER_SYSTEM = `你是「画布今日」（任务软件）里的助手。你看得到这个人近两周的待办、收件箱里没定日子的待办、系统日历里的日程，还有他这一问附的图。
现在全能模式关着：你只能回答，不能新加、修改、删除任何待办或笔记，也不能跑命令、上网。用户要你加待办、改日子、改笔记，就照实说现在只能回答，请他在输入框下面打开「全能模式」再说一次，并告诉他那一条可以怎么写（比如「明天15:00 交报告」）。
用平实的几句话直接回答；用户用什么语言问就用什么语言答；不编造库里没有的事。`

/** 假 AI 只回答（e2e）：说清收到几张图、全能模式关着不动库 */
export function fakeAnswerOnly(ask: string, images = 0): string {
  return `（测试回答：只回答${images ? `，看到图 ${images} 张` : ''}）你问的是「${ask.split('\n')[0]!.slice(0, 40)}」。全能模式关着，我只回答、不动库；要我加待办，请在输入框下面打开全能模式再说一次。`
}

export function chatPrompt(ctx: ChatCtx, history: string, ask: string): string {
  return [ctxText(ctx), ...(history ? ['前面的对话：', history] : []), `这一次用户说：${ask}`].join('\n')
}

/** 现在几点、近两周的待办（带编号）、收件箱里没定日子的、系统日历的日程：排日程那一问和全能模式每一问都给 */
export function ctxText(ctx: ChatCtx): string {
  const { now } = ctx
  const line = (t: CtxTask) => {
    const when = t.date ? `${t.date}${t.time ? ' ' + t.time : ''}${t.date < now.date ? '（过期了）' : ''}` : '没定日子'
    const subs = t.subs.length ? ` · 已有子任务：${t.subs.join('；')}` : ''
    return `${t.id} · ${t.title} · ${when} · 优先级${PRIO_ZH[t.prio]} · ${t.path}${t.child ? ' · 是子任务' : ''}${subs}`
  }
  const dated = ctx.tasks.filter((t) => t.date)
  const undated = ctx.tasks.filter((t) => !t.date)
  const evs = [...ctx.events].sort((a, b) => a.date.localeCompare(b.date) || (a.from ?? -1) - (b.from ?? -1))
  return [
    `现在：${now.date} ${WD[weekday(now.date)]} ${now.time}`,
    '待办（编号 · 标题 · 日子 钟点 · 优先级 · 在哪篇笔记）：',
    ...(dated.length ? dated.map(line) : ['（没有）']),
    '收件箱里没定日子的：',
    ...(undated.length ? undated.map(line) : ['（没有）']),
    '系统日历的日程（只读）：',
    ...(evs.length ? evs.map((e) => `${e.date} ${WD[weekday(e.date)]} ${e.from === undefined ? '全天' : `${hm(e.from)}–${hm(e.to!)}`} ${e.title}`) : ['（没有）']),
  ].join('\n')
}

/** 回答里第一个 JSON 对象（前后有字、包在 ``` 里都认） */
function firstObject(text: string): Record<string, unknown> | null {
  const s = text.indexOf('{')
  const e = text.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try {
    const v = JSON.parse(text.slice(s, e + 1)) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function prioOf(v: unknown): Prio | undefined {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3) return v as Prio
  if (typeof v !== 'string') return undefined
  const s = v.trim().toLowerCase()
  if (/^[0-3]$/.test(s)) return Number(s) as Prio
  if (s.includes('⏫') || s === '高' || s === 'high') return 3
  if (s.includes('🔼') || s === '中' || s === 'medium') return 2
  if (s.includes('🔽') || s === '低' || s === 'low') return 1
  if (s === '没设' || s === 'none') return 0
  return undefined
}

function stepsOf(v: unknown, existing: string[]): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const seen = new Set(existing.map((x) => x.trim()))
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') continue
    const s = x
      .replace(/^\s*(?:[-*•]|\d+[.、)）])\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length === 8) break
  }
  return out.length ? out : undefined
}

const LEN = 60
const overlap = (a: { from: number; to: number }, b: { from: number; to: number }) => a.from < b.to && b.from < a.to

/**
 * AI 的回答查一遍：只认给它的编号、只认四样；日子是真的、不早于今天；钟点不撞日程、不撞别的有钟点的待办（改了的照改完的算）、
 * 今天的不早于现在；和原来一样的那几样不算改。不合规矩的那一条整条不收，记在 dropped 里给人看为什么
 */
export function readChat(answer: string, ctx: ChatCtx): ChatReply | null {
  const o = firstObject(answer)
  if (!o) return null
  const say = typeof o.say === 'string' ? o.say.trim() : ''
  const keep = typeof o.keep === 'string' && o.keep.trim() ? o.keep.trim() : undefined
  const byId = new Map(ctx.tasks.map((t) => [t.id, t]))
  const raw = Array.isArray(o.changes) ? o.changes : []
  const wants: { t: CtxTask; date?: ISODate; time?: string | null; prio?: Prio; steps?: string[]; bad?: Dropped['why'] }[] = []
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue
    const c = v as Record<string, unknown>
    const t = typeof c.id === 'string' ? byId.get(c.id.trim()) : undefined
    if (!t || wants.some((w) => w.t === t)) continue
    const w: (typeof wants)[number] = { t }
    if (typeof c.date === 'string') {
      const d = c.date.trim()
      if (!isISODate(d)) w.bad = 'baddate'
      else if (d < ctx.now.date) w.bad = 'past'
      else if (d !== t.date) w.date = d
    }
    if (c.time === null) {
      if (t.time) w.time = null
    } else if (typeof c.time === 'string') {
      const tm = normTime(c.time.trim())
      if (!tm) w.bad ??= 'baddate'
      else if (tm !== t.time || w.date) w.time = tm
    }
    const p = prioOf(c.prio)
    if (p !== undefined && p !== t.prio) w.prio = p
    const st = stepsOf(c.steps, t.subs)
    if (st) w.steps = st
    wants.push(w)
  }
  const dropped: Dropped[] = []
  // 改完以后占着的钟点：日程、没改钟点的待办、前面收下的
  const busy: { date: ISODate; from: number; to: number; title: string }[] = ctx.events.filter((e) => e.from !== undefined).map((e) => ({ date: e.date, from: e.from!, to: e.to!, title: e.title }))
  const moving = new Set(wants.filter((w) => !w.bad && (w.date !== undefined || w.time !== undefined)).map((w) => w.t.key))
  for (const t of ctx.tasks) if (t.date && t.time && !moving.has(t.key)) busy.push({ date: t.date, from: minutesOf(t.time), to: minutesOf(t.time) + LEN, title: t.title })
  const changes: PlanChange[] = []
  for (const w of wants) {
    const { t } = w
    if (w.bad) {
      dropped.push({ title: t.title, why: w.bad })
      continue
    }
    const date = w.date ?? t.date
    const time = w.time === undefined ? t.time : w.time
    if (w.time && !date) {
      dropped.push({ title: t.title, why: 'nodate' })
      continue
    }
    if ((w.date !== undefined || w.time !== undefined) && date && date < ctx.now.date) {
      dropped.push({ title: t.title, why: 'past' })
      continue
    }
    if ((w.date !== undefined || w.time !== undefined) && date && time) {
      const span = { from: minutesOf(time), to: minutesOf(time) + LEN }
      if (date === ctx.now.date && span.from < minutesOf(ctx.now.time)) {
        dropped.push({ title: t.title, why: 'past' })
        continue
      }
      const hit = busy.find((b) => b.date === date && overlap(b, span))
      if (hit) {
        dropped.push({ title: t.title, why: 'overlap', with: hit.title })
        continue
      }
      busy.push({ date, ...span, title: t.title })
    }
    if (w.date === undefined && w.time === undefined && w.prio === undefined && !w.steps) continue
    changes.push({
      key: t.key,
      title: t.title,
      path: t.path,
      line: t.line,
      raw: t.raw,
      from: { date: t.date, time: t.time, prio: t.prio },
      ...(w.date !== undefined ? { date: w.date } : {}),
      ...(w.time !== undefined ? { time: w.time } : {}),
      ...(w.prio !== undefined ? { prio: w.prio } : {}),
      ...(w.steps ? { steps: w.steps } : {}),
    })
  }
  // 卡上按改完的日子、钟点排（没日子的在后面），和日历上从左到右一样
  const when = (c: PlanChange) => `${c.date ?? c.from.date ?? '9999-99-99'} ${(c.time === undefined ? c.from.time : c.time) ?? '99:99'}`
  changes.sort((a, b) => when(a).localeCompare(when(b)))
  return { say: say || (changes.length ? '' : '这次没有要改的。'), changes, dropped, ...(keep ? { keep } : {}) }
}

/** 对话的名字：第一句话（去掉「帮我」「请」这类开头、图的编号 ①②），最多 16 个字 */
export function chatTitle(first: string): string {
  const s = first
    .replace(/[①-⑳]/g, '')
    // @ 点名的「@小论文计划」在标题里只写名字
    .replace(/(^|\s)@(?=\S)/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/^(请|麻烦|帮我|帮忙|能不能|可以)+/, '')
    .trim()
  return s.length > 16 ? s.slice(0, 16) + '…' : s || '新对话'
}

/** 这一句像不像要排日程（⌘K 里打的：像就把「问 AI」放第一行，回车直接开对话） */
export const looksLikePlan = (s: string) => /排|挪|安排|优先级|拆|空着|太满|推迟|往后|提前|计划|放到|改到|调到|schedul|reschedul|plan |plan$|move .*to|prioriti|break .* into|split/i.test(s)

/** 近两周的待办、收件箱里没定日子的：交给 AI 看的那一批 */
export function pickTasks<T extends { key: string; done: boolean; cancelled: boolean; date: string | null; parent: string | null; path: string }>(tasks: readonly T[], today: ISODate, inbox: string): T[] {
  const end = addDays(today, 13)
  return tasks.filter((t) => !t.done && !t.cancelled && (t.date ? t.date <= end && (t.parent === null || t.date !== null) : t.path === inbox && t.parent === null))
}

// ---------- @ 点名的笔记（对标清单 U1） ----------

/** 一篇最多交给 AI 多少字（几千行的笔记只给前面这一截） */
export const MENTION_CHARS = 6000
/** 一问最多点名几篇 */
export const MENTION_MAX = 5

/** 界面交来的点名：路径是库里的 .md、标题是字，最多 MENTION_MAX 篇；不对的丢掉 */
export function checkMentions(raw: unknown): Mention[] {
  if (!Array.isArray(raw)) return []
  const out: Mention[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const m = x as Record<string, unknown>
    if (typeof m.path !== 'string' || !/\.md$/i.test(m.path) || m.path.startsWith('/') || m.path.split('/').includes('..')) continue
    if (typeof m.title !== 'string' || !m.title.trim()) continue
    if (out.some((y) => y.path === m.path)) continue
    out.push({ path: m.path, title: m.title, kind: 'doc' })
    if (out.length >= MENTION_MAX) break
  }
  return out
}

/** 点名的那几篇交给 AI 的那一块（接在用户那句话后面）：每篇「### 路径」+ 全文（太长截掉） */
export function mentionBlock(notes: readonly { path: string; text: string }[]): string {
  if (!notes.length) return ''
  const one = (n: { path: string; text: string }) => `### ${n.path}\n${n.text.length > MENTION_CHARS ? n.text.slice(0, MENTION_CHARS) + '\n…（后面还有，没给）' : n.text}`
  return `\n\n【点名的笔记】用户用 @ 点名了这几篇，说的「@名字」就是它们（库里的路径和内容；里面没做完的待办也在上面的待办里，带编号）：\n${notes.map(one).join('\n\n')}`
}

/** 一问里点名了哪几篇（假 AI 用：认 mentionBlock 写的「### 路径」） */
export const mentionedPaths = (ask: string): string[] => (ask.includes('【点名的笔记】') ? [...ask.slice(ask.indexOf('【点名的笔记】')).matchAll(/^### (.+\.md)$/gm)].map((m) => m[1]!) : [])

// ---------- 假 AI（e2e、单元测试；CT_AI_FAKE=1）：照话里的词给一张像样的改动单，走和真 AI 一样的 readChat ----------

const FAKE_STEPS: Record<string, string[]> = {
  补实验图: ['把三组实验结果导出成表', '画准确率曲线', '画消融对比柱状图', '图注和编号对上正文'],
  交论文初稿: ['通读一遍，改错字', '补参考文献格式', '导出 PDF', '发给导师'],
}

/** images：这一问带了几张图（假 AI 在 say 前面说一句「看到了 2 张图。」，e2e 看得出图交到了） */
export function fakeChatAnswer(ask: string, ctx: ChatCtx, images = 0): string {
  const { now } = ctx
  const tom = addDays(now.date, 1)
  const ans = (say: string, changes: Record<string, unknown>[], keep?: string) => JSON.stringify({ say: `${images ? `看到了${images}张图。` : ''}${say}`, changes, ...(keep ? { keep } : {}) })
  // 点名了笔记：「把 @小论文计划 排进下周」把那几篇里没定日子、没钟点的挪到下周一（点名的那几篇里的）
  const named = mentionedPaths(ask)
  if (named.length) {
    const mon = addDays(now.date, ((8 - weekday(now.date)) % 7) || 7)
    const ts = ctx.tasks.filter((t) => named.includes(t.path) && !t.child && !t.time)
    if (/下周|next week/i.test(ask)) return ans(`《${named.map((p) => p.replace(/^.*\//, '').replace(/\.md$/i, '')).join('》《')}》里的${ts.length}条排到下周一。`, ts.slice(0, 6).map((t) => ({ id: t.id, date: mon })))
    return ans(`看了点名的《${named.map((p) => p.replace(/^.*\//, '').replace(/\.md$/i, '')).join('》《')}》，里面有${ts.length}条没做完。`, [])
  }
  if (ask.includes('（测试：Markdown）')) return ans('**先做**这两条：\n\n- 交论文初稿\n- 补实验图\n\n日子写成 `📅 2026-11-23`。', [])
  if (ask.includes('撞日程')) {
    // 故意排到「和爸妈视频」那一小时：软件该把它挡下来
    const t = ctx.tasks.find((x) => x.date === now.date && !x.time)
    return ans('放到下午四点做。', t ? [{ id: t.id, time: '16:00' }] : [])
  }
  if (/优先级|priorit/i.test(ask)) {
    const lv = (s: string) => (/导师|邮件/.test(s) ? 3 : /快递|猫/.test(s) ? 2 : 1)
    const cs = ctx.tasks.filter((t) => !t.date).map((t) => ({ id: t.id, prio: lv(t.title) }))
    return ans('导师在等回信，放第一格；快递和猫粮放第二格；别的不急。', cs)
  }
  if (/拆|steps|break/i.test(ask)) {
    const t = ctx.tasks.find((x) => ask.includes(x.title)) ?? ctx.tasks.find((x) => FAKE_STEPS[x.title]) ?? ctx.tasks[0]
    if (!t) return ans('没有能拆的待办。', [])
    return ans(`「${t.title}」拆成了几小步。`, [{ id: t.id, steps: FAKE_STEPS[t.title] ?? ['想清楚第一步做什么', '做完一半时检查一遍', '收尾，写一句结论'] }])
  }
  if (/太满|挪一挪|move/i.test(ask)) {
    const ts = ctx.tasks.filter((t) => t.date === tom && !t.time && t.prio < 3 && !t.child)
    const cs = ts.slice(0, 2).map((t, i) => (i === 0 ? { id: t.id, date: addDays(tom, 3) } : { id: t.id, date: addDays(tom, 1), time: '10:00' }))
    return ans('明天留有钟点的和高优先级的，另外几条挪到空一点的日子。', cs, '有钟点的和高优先级的不动')
  }
  if (/排进|空着|作业|schedule/i.test(ask)) {
    const end = addDays(now.date, 6)
    const ts = ctx.tasks.filter((t) => t.date && t.date <= end && !t.time && !t.child && (!ask.includes('作业') || t.path.startsWith('课程/')))
    const taken = [
      ...ctx.events.filter((e) => e.from !== undefined).map((e) => ({ date: e.date, from: e.from!, to: e.to! })),
      ...ctx.tasks.filter((t) => t.date && t.time).map((t) => ({ date: t.date!, from: minutesOf(t.time!), to: minutesOf(t.time!) + LEN })),
    ]
    const cs: Record<string, unknown>[] = []
    for (const t of ts.slice(0, 4)) {
      const date = t.date! < now.date ? now.date : t.date!
      let s = date === now.date ? Math.ceil(minutesOf(now.time) / 60) * 60 + 60 : 10 * 60
      while (taken.some((b) => b.date === date && overlap(b, { from: s, to: s + LEN }))) s += 60
      if (s + LEN > 21 * 60) continue
      taken.push({ date, from: s, to: s + LEN })
      cs.push({ id: t.id, ...(date !== t.date ? { date } : {}), time: hm(s) })
    }
    return ans(`这${cs.length}条都排进了空着的时间，避开了日历里的日程；过期的放在今天先补上。`, cs)
  }
  return ans(`我看了你这两周的${ctx.tasks.length}条待办和${ctx.events.length}个日程。想怎么排，直接说就行。`, [])
}
