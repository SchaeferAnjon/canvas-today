/**
 * 认一行待办（2026-11-22 定稿的行尾写法，「记号照旧、内容写中文」）：
 *   - [ ] 标题 📅 2026-11-23 15:00 🔔 提前1小时 🔁 每周日 ⏫ 🆔 a1b2c3
 *   - [x] 标题 📅 2026-11-22 ✅ 2026-11-22
 * 读的时候顺序随意：从行尾往前一个个认记号，认不出了，前面剩下的就是标题。记号前面可以不空格（Obsidian Tasks 也认「）📅」）。
 * 每个记号记下它在这一行里的位置（连同前面那个空格），改的时候只换那几个字（edit.ts）。
 * 我们不用的 ⏳ 🛫 ➕ ⛔ 🏁 ❌ 也认位置，原样留着；⏰ 只有从 Obsidian 导入时才换（obsidian.ts）。
 * 引用块、提示块里的「> - [ ]」也是待办（quote 记着前面那段「> 」，改的时候不动它）。
 * 行尾的「^块编号」「#标签」「<!-- 注释 -->」和 Dataview 的「[键:: 值]」也一个个认掉，再往前认记号（全库待办收齐，画布今日地基）；
 * 标签紧挨着标题（左边没有别的记号）时还算标题的字。
 * 日子：有 📅 用 📅，没有用 ⏳（计划日），再没有用 Dataview 的 due::；dateFrom 记着是哪个，改日子时改它。
 */

import { normTime } from './dates'
import { DURATION_KEYS, parseMinutes } from './duration'

export type FieldKind =
  | 'date'
  | 'alarm'
  | 'sched'
  | 'start'
  | 'remind'
  | 'repeat'
  | 'prio'
  | 'id'
  | 'dep'
  | 'created'
  | 'done'
  | 'cancel'
  | 'onDone'
  /** Dataview 的「[键:: 值]」「(键:: 值)」，行尾的「due:: 日子」 */
  | 'dv'
  /** 行尾的 #标签（左边有别的记号时；紧挨着标题的还算标题） */
  | 'tag'
  /** <!-- 注释 --> */
  | 'note'
  /** ^块编号（别处 [[笔记#^编号]] 链过来的，要一直在行尾） */
  | 'block'

/** 行尾跟着的、不是我们写的记号：新加记号一律放在它们前面（块编号一直在行尾，别处的块链接不断） */
export const TAIL_KINDS: readonly FieldKind[] = ['tag', 'note', 'block']

export type Prio = 0 | 1 | 2 | 3

export interface Field {
  kind: FieldKind
  /** 记号前面那段空白的开头（拿掉这个记号就是删 [start, end)） */
  start: number
  end: number
  /** 记号本身：📅、#、^、<!--；Dataview 的是开头那个括号（行尾不带括号的是 due） */
  emoji: string
  /** 记号后面的内容（优先级没有内容，是记号本身；Dataview 的 due 是日子那十个字） */
  value: string
  valueStart: number
  valueEnd: number
  /** 日子后面跟的钟点（📅、⏳、Dataview 的 due） */
  time?: string
  timeStart?: number
  timeEnd?: number
  /** Dataview 的键（小写） */
  key?: string
}

export interface TaskLine {
  /** 引用块、提示块里的待办：前面那段「> 」「> > 」（不在引用里是空的） */
  quote: string
  /** 列表记号前面的缩进（在引用里时是「> 」后面的） */
  indent: string
  bullet: string
  /** [ ] 里那个字 */
  mark: string
  markAt: number
  done: boolean
  /** [-] 取消了：不算没做完，也不算做完 */
  cancelled: boolean
  /** [/] 做了一半：还算没做完，显示成「进行中」 */
  doing: boolean
  title: string
  titleStart: number
  titleEnd: number
  /** 按在这一行里的先后 */
  fields: Field[]
  date: string | null
  /** 日子从哪个记号来：📅（date）、⏳（sched）、Dataview 的 due（dv）；没有日子是 null */
  dateFrom: 'date' | 'sched' | 'dv' | null
  time: string | null
  remind: string | null
  repeat: string | null
  prio: Prio
  id: string | null
  doneDate: string | null
  /** 行尾的 ^块编号（不带 ^） */
  block: string | null
  /** 估时（分钟）：Dataview 的「[估时:: 30分钟]」（duration.ts）；没写是 null */
  minutes: number | null
}

/** 写的时候用的记号 */
export const EMOJI = {
  date: '📅',
  alarm: '⏰',
  sched: '⏳',
  start: '🛫',
  remind: '🔔',
  repeat: '🔁',
  id: '🆔',
  dep: '⛔',
  created: '➕',
  done: '✅',
  cancel: '❌',
  onDone: '🏁',
} as const

export const PRIO_EMOJI: Record<Exclude<Prio, 0>, string> = { 3: '⏫', 2: '🔼', 1: '🔽' }
/** 最低（Obsidian Tasks 的 ⏬）：读成低（1），画布今日四象限拿它当第 4 格「不重要不紧急」 */
export const LOWEST = '⏬'
/** 这一行的优先级记号是 ⏬（最低） */
export const isLowest = (t: TaskLine): boolean => t.fields.some((f) => f.kind === 'prio' && f.emoji === LOWEST)
const PRIO_OF: Record<string, Prio> = { '⏫': 3, '🔺': 3, '🔼': 2, '🔽': 1, '⏬': 1 }

/**
 * 软件写的时候的先后（读的时候随意）。新加一个记号时放在第一个比它靠后的记号前面：
 * Dataview 的字段最前（我们的记号接在它们后面），行尾的标签、注释、块编号最后（新记号插在它们前面）
 */
export const ORDER: FieldKind[] = ['dv', 'date', 'alarm', 'sched', 'start', 'remind', 'repeat', 'prio', 'id', 'dep', 'created', 'done', 'cancel', 'onDone', 'tag', 'note', 'block']

const VS = '\\uFE0F?'
const ALL_EMOJI = '📅⏰⏳🛫🔔🔁🆔⛔➕✅❌🏁⏫🔺🔼🔽⏬'
/** 自由文字的内容（提醒、重复）：不能含别的记号 */
const FREE = `[^${ALL_EMOJI}]*?`
const DATE = '(\\d{4}-\\d{2}-\\d{2})'
/** 记号前面的空白：可以没有（「）📅 2026-09-07」） */
const SP = '[ \\t]*'

/** 每种记号：认法（从行尾往前，所以都锚在 $） */
const PATTERNS: { kind: FieldKind; re: RegExp }[] = [
  { kind: 'date', re: new RegExp(`${SP}(📅)${VS}[ \\t]*${DATE}(?:([ \\t]+)(\\d{1,2}:\\d{2}))?$`, 'u') },
  { kind: 'alarm', re: new RegExp(`${SP}(⏰)${VS}[ \\t]*((?:\\d{4}-\\d{2}-\\d{2}[ \\t]+)?\\d{1,2}:\\d{2})$`, 'u') },
  { kind: 'sched', re: new RegExp(`${SP}(⏳)${VS}[ \\t]*${DATE}(?:([ \\t]+)(\\d{1,2}:\\d{2}))?$`, 'u') },
  { kind: 'start', re: new RegExp(`${SP}(🛫)${VS}[ \\t]*${DATE}$`, 'u') },
  { kind: 'created', re: new RegExp(`${SP}(➕)${VS}[ \\t]*${DATE}$`, 'u') },
  { kind: 'done', re: new RegExp(`${SP}(✅)${VS}[ \\t]*${DATE}$`, 'u') },
  { kind: 'cancel', re: new RegExp(`${SP}(❌)${VS}[ \\t]*${DATE}$`, 'u') },
  { kind: 'id', re: new RegExp(`${SP}(🆔)${VS}[ \\t]*([A-Za-z0-9_-]+)$`, 'u') },
  { kind: 'dep', re: new RegExp(`${SP}(⛔)${VS}[ \\t]*([A-Za-z0-9_,-]+)$`, 'u') },
  { kind: 'onDone', re: new RegExp(`${SP}(🏁)${VS}[ \\t]*(\\S+)$`, 'u') },
  { kind: 'prio', re: new RegExp(`${SP}(⏫|🔺|🔼|🔽|⏬)(${VS})$`, 'u') },
  { kind: 'remind', re: new RegExp(`${SP}(🔔)${VS}[ \\t]*(\\S${FREE})$`, 'u') },
  { kind: 'repeat', re: new RegExp(`${SP}(🔁)${VS}[ \\t]*(\\S${FREE})$`, 'u') },
]

/** 行尾的块编号、注释、标签：先认这几样（🔁 后面的自由文字不会把「#标签」吞进去） */
const BLOCK = /[ \t]+(\^)([A-Za-z0-9-]+)$/u
const NOTE = /[ \t]*(<!--)((?:(?!-->).)*)-->$/u
const TAG = /[ \t]+(#)([^\s#]+)$/u
/** Dataview：[键:: 值]、(键:: 值) */
const DV_BRACKET = /[ \t]*(\[)([^[\]():]+?)::[ \t]*([^[\]]*?)[ \t]*\]$/u
const DV_PAREN = /[ \t]*(\()([^[\]():]+?)::[ \t]*([^()]*?)[ \t]*\)$/u
/** 行尾不带括号的「due:: 2026-11-25」 */
const DV_BARE = /[ \t]+(due)::[ \t]*(\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2})?)$/u
/** Dataview 的日子：2026-11-25、2026-11-25T15:00、2026-11-25 15:00 */
const DV_DATE = /^(\d{4}-\d{2}-\d{2})(?:([T ])(\d{1,2}:\d{2}))?$/

/** 引用块的「> 」（可以几层：「> > 」「>>」），后面是缩进、列表记号 + [ ]：「- [ ] 」「* [x] 」「1. [ ] 」 */
const HEAD = /^((?:[ \t]*>[ \t]?)*)([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+\[([^[\]])\](?=[ \t]|$)/

/** 行尾的块编号、注释、标签（kind 认法 re）：认不出是 null */
function tail(rest: string, end: number, titleStart: number, kind: 'block' | 'note' | 'tag', re: RegExp): Field | null {
  const m = re.exec(rest)
  if (!m || m.index < titleStart - 1) return null
  const value = m[2]!
  // 纯数字的 #3 不是标签（Obsidian 也不认）
  if (kind === 'tag' && /^\d+$/.test(value)) return null
  const start = m.index
  if (kind === 'note') {
    const valueStart = rest.indexOf('<!--', start) + 4
    return { kind, start, end, emoji: '<!--', value, valueStart, valueEnd: valueStart + value.length }
  }
  return { kind, start, end, emoji: m[1]!, value, valueStart: end - value.length, valueEnd: end }
}

/** Dataview 的字段：键是 due、值是日子的，value 只是日子那十个字，后面的钟点记在 time */
function dataview(rest: string, end: number, titleStart: number): Field | null {
  let m = DV_BARE.exec(rest)
  const bare = !!m
  if (!m) m = DV_BRACKET.exec(rest) ?? DV_PAREN.exec(rest)
  if (!m || m.index < titleStart - 1) return null
  const key = (bare ? 'due' : m[2]!.trim()).toLowerCase()
  const raw = bare ? m[2]! : m[3]!
  // 值在最后（不带括号的）或者右括号和它前面的空白之前
  const close = bare ? 0 : 1 + /[ \t]*$/.exec(m[0].slice(0, -1))![0].length
  const rawEnd = end - close
  const rawStart = rawEnd - raw.length
  const f: Field = { kind: 'dv', start: m.index, end, emoji: m[1]!, value: raw, valueStart: rawStart, valueEnd: rawEnd, key }
  const d = key === 'due' ? DV_DATE.exec(raw) : null
  if (d) {
    f.value = d[1]!
    f.valueEnd = rawStart + d[1]!.length
    if (d[3]) {
      f.time = d[3]
      f.timeStart = rawEnd - d[3].length
      f.timeEnd = rawEnd
    }
  }
  return f
}

/** 从 rest 的行尾认一个记号（end 是 rest 的长度）；认不出是 null */
function peel(rest: string, end: number, titleStart: number): Field | null {
  const hit = tail(rest, end, titleStart, 'block', BLOCK) ?? tail(rest, end, titleStart, 'note', NOTE) ?? tail(rest, end, titleStart, 'tag', TAG) ?? dataview(rest, end, titleStart)
  if (hit) return hit
  for (const p of PATTERNS) {
    const m = p.re.exec(rest)
    // 记号前面至少留一个字的标题位置：「- [ ] 📅 2026-11-23」也算（标题是空的）
    if (!m || m.index < titleStart - 1) continue
    const start = m.index
    const emojiAt = rest.indexOf(m[1]!, start)
    if (p.kind === 'prio') return { kind: 'prio', start, end, emoji: m[1]!, value: m[1]!, valueStart: emojiAt, valueEnd: end }
    const value = m[2]!
    // 内容都在这一段的最后（📅 ⏳ 后面可能还跟着钟点，要从记号往后找）
    const dated = p.kind === 'date' || p.kind === 'sched'
    const valueStart = dated ? rest.indexOf(value, emojiAt) : end - value.length
    const f: Field = { kind: p.kind, start, end, emoji: m[1]!, value, valueStart, valueEnd: valueStart + value.length }
    if (dated && m[4]) {
      f.time = m[4]
      f.timeEnd = end
      f.timeStart = end - m[4].length
    }
    return f
  }
  return null
}

/** 估时的 Dataview 字段（[估时:: 30分钟]、[duration:: 30m]） */
export const isDuration = (f: Field): boolean => f.kind === 'dv' && DURATION_KEYS.includes(f.key ?? '')

/** Dataview 的 due 字段（值认得出是日子的） */
export const isDvDue = (f: Field): boolean => f.kind === 'dv' && f.key === 'due' && /^\d{4}-\d{2}-\d{2}$/.test(f.value)

export function parseTaskLine(line: string): TaskLine | null {
  const h = HEAD.exec(line)
  if (!h) return null
  const quote = h[1]!
  const indent = h[2]!
  const bullet = h[3]!
  const mark = h[4]!
  const markAt = h[0].length - 2
  // 标题从「]」后面的空白之后开始
  let titleStart = h[0].length
  while (titleStart < line.length && (line[titleStart] === ' ' || line[titleStart] === '\t')) titleStart++
  // 行尾的空白不算进任何记号
  let end = line.length
  while (end > titleStart && (line[end - 1] === ' ' || line[end - 1] === '\t')) end--
  const textEnd = end

  const fields: Field[] = []
  for (;;) {
    const hit = peel(line.slice(0, end), end, titleStart)
    if (!hit) break
    fields.unshift(hit)
    end = hit.start
    if (end <= titleStart) break
  }
  // 紧挨着标题的 #标签 还是标题的字（「- [ ] 改bug #todo」的标题是「改bug #todo」）
  while (fields.length && fields[0]!.kind === 'tag') fields.shift()
  const titleEnd = Math.max(titleStart, fields.length ? fields[0]!.start : textEnd)
  const t: TaskLine = {
    quote,
    indent,
    bullet,
    mark,
    markAt,
    done: mark === 'x' || mark === 'X',
    cancelled: mark === '-',
    doing: mark === '/',
    title: line.slice(titleStart, titleEnd),
    titleStart,
    titleEnd,
    fields,
    date: null,
    dateFrom: null,
    time: null,
    remind: null,
    repeat: null,
    prio: 0,
    id: null,
    doneDate: null,
    block: null,
    minutes: null,
  }
  // 同一种写了两遍的（手打重了）取最靠行尾的
  let sched: Field | null = null
  let due: Field | null = null
  for (const f of fields) {
    if (f.kind === 'date') {
      t.date = f.value
      t.dateFrom = 'date'
      t.time = f.time ? normTime(f.time) : null
    } else if (f.kind === 'sched') sched = f
    else if (isDvDue(f)) due = f
    else if (f.kind === 'remind') t.remind = f.value
    else if (f.kind === 'repeat') t.repeat = f.value
    else if (f.kind === 'prio') t.prio = PRIO_OF[f.emoji] ?? 0
    else if (f.kind === 'id') t.id = f.value
    else if (f.kind === 'done') t.doneDate = f.value
    else if (f.kind === 'block') t.block = f.value
    else if (isDuration(f)) t.minutes = parseMinutes(f.value)
  }
  // 没有 📅：⏳ 计划日当日子，再没有用 Dataview 的 due
  const alt = sched ?? due
  if (t.date === null && alt) {
    t.date = alt.value
    t.dateFrom = alt.kind === 'sched' ? 'sched' : 'dv'
    t.time = alt.time ? normTime(alt.time) : null
  }
  return t
}

/** 这一行是不是待办（不管写了什么记号） */
export const isTaskLine = (line: string): boolean => HEAD.test(line)

/** 一行开头引用块的「> 」（不在引用里是空串）和它有几层 */
export function quoteOf(line: string): { prefix: string; depth: number } {
  const prefix = /^(?:[ \t]*>[ \t]?)*/.exec(line)![0]
  let depth = 0
  for (const c of prefix) if (c === '>') depth++
  return { prefix, depth }
}
