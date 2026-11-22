/**
 * 认一行待办（2026-11-22 定稿的行尾写法，「记号照旧、内容写中文」）：
 *   - [ ] 标题 📅 2026-11-23 15:00 🔔 提前1小时 🔁 每周日 ⏫ 🆔 a1b2c3
 *   - [x] 标题 📅 2026-11-22 ✅ 2026-11-22
 * 读的时候顺序随意：从行尾往前一个个认记号，认不出了，前面剩下的就是标题。
 * 每个记号记下它在这一行里的位置（连同前面那个空格），改的时候只换那几个字（edit.ts）。
 * 我们不用的 ⏳ 🛫 ➕ ⛔ 🏁 ❌ 也认位置，原样留着；⏰ 只有从 Obsidian 导入时才换（obsidian.ts）。
 */

import { normTime } from './dates'

export type FieldKind = 'date' | 'alarm' | 'sched' | 'start' | 'remind' | 'repeat' | 'prio' | 'id' | 'dep' | 'created' | 'done' | 'cancel' | 'onDone'

export type Prio = 0 | 1 | 2 | 3

export interface Field {
  kind: FieldKind
  /** 记号前面那段空白的开头（拿掉这个记号就是删 [start, end)） */
  start: number
  end: number
  emoji: string
  /** 记号后面的内容（优先级没有内容，是记号本身） */
  value: string
  valueStart: number
  valueEnd: number
  /** 📅 后面跟的钟点 */
  time?: string
  timeStart?: number
  timeEnd?: number
}

export interface TaskLine {
  indent: string
  bullet: string
  /** [ ] 里那个字 */
  mark: string
  markAt: number
  done: boolean
  /** [-] 取消了：不算没做完，也不算做完 */
  cancelled: boolean
  title: string
  titleStart: number
  titleEnd: number
  /** 按在这一行里的先后 */
  fields: Field[]
  date: string | null
  time: string | null
  remind: string | null
  repeat: string | null
  prio: Prio
  id: string | null
  doneDate: string | null
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
const PRIO_OF: Record<string, Prio> = { '⏫': 3, '🔺': 3, '🔼': 2, '🔽': 1, '⏬': 1 }

/** 软件写的时候的先后（读的时候随意）。新加一个记号时放在第一个比它靠后的记号前面 */
export const ORDER: FieldKind[] = ['date', 'alarm', 'sched', 'start', 'remind', 'repeat', 'prio', 'id', 'dep', 'created', 'done', 'cancel', 'onDone']

const VS = '\\uFE0F?'
const ALL_EMOJI = '📅⏰⏳🛫🔔🔁🆔⛔➕✅❌🏁⏫🔺🔼🔽⏬'
/** 自由文字的内容（提醒、重复）：不能含别的记号 */
const FREE = `[^${ALL_EMOJI}]*?`
const DATE = '(\\d{4}-\\d{2}-\\d{2})'

/** 每种记号：认法（从行尾往前，所以都锚在 $） */
const PATTERNS: { kind: FieldKind; re: RegExp }[] = [
  { kind: 'date', re: new RegExp(`[ \\t]+(📅)${VS}[ \\t]*${DATE}(?:([ \\t]+)(\\d{1,2}:\\d{2}))?$`, 'u') },
  { kind: 'alarm', re: new RegExp(`[ \\t]+(⏰)${VS}[ \\t]*((?:\\d{4}-\\d{2}-\\d{2}[ \\t]+)?\\d{1,2}:\\d{2})$`, 'u') },
  { kind: 'sched', re: new RegExp(`[ \\t]+(⏳)${VS}[ \\t]*${DATE}$`, 'u') },
  { kind: 'start', re: new RegExp(`[ \\t]+(🛫)${VS}[ \\t]*${DATE}$`, 'u') },
  { kind: 'created', re: new RegExp(`[ \\t]+(➕)${VS}[ \\t]*${DATE}$`, 'u') },
  { kind: 'done', re: new RegExp(`[ \\t]+(✅)${VS}[ \\t]*${DATE}$`, 'u') },
  { kind: 'cancel', re: new RegExp(`[ \\t]+(❌)${VS}[ \\t]*${DATE}$`, 'u') },
  { kind: 'id', re: new RegExp(`[ \\t]+(🆔)${VS}[ \\t]*([A-Za-z0-9_-]+)$`, 'u') },
  { kind: 'dep', re: new RegExp(`[ \\t]+(⛔)${VS}[ \\t]*([A-Za-z0-9_,-]+)$`, 'u') },
  { kind: 'onDone', re: new RegExp(`[ \\t]+(🏁)${VS}[ \\t]*(\\S+)$`, 'u') },
  { kind: 'prio', re: new RegExp(`[ \\t]+(⏫|🔺|🔼|🔽|⏬)(${VS})$`, 'u') },
  { kind: 'remind', re: new RegExp(`[ \\t]+(🔔)${VS}[ \\t]*(\\S${FREE})$`, 'u') },
  { kind: 'repeat', re: new RegExp(`[ \\t]+(🔁)${VS}[ \\t]*(\\S${FREE})$`, 'u') },
]

/** 列表记号 + [ ]：「- [ ] 」「* [x] 」「1. [ ] 」 */
const HEAD = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+\[([^\[\]])\](?=[ \t]|$)/

export function parseTaskLine(line: string): TaskLine | null {
  const h = HEAD.exec(line)
  if (!h) return null
  const indent = h[1]!
  const bullet = h[2]!
  const mark = h[3]!
  const markAt = h[0].length - 2
  // 标题从「]」后面的空白之后开始
  let titleStart = h[0].length
  while (titleStart < line.length && (line[titleStart] === ' ' || line[titleStart] === '\t')) titleStart++
  // 行尾的空白不算进任何记号
  let end = line.length
  while (end > titleStart && (line[end - 1] === ' ' || line[end - 1] === '\t')) end--

  const fields: Field[] = []
  for (;;) {
    const rest = line.slice(0, end)
    let hit: Field | null = null
    for (const p of PATTERNS) {
      const m = p.re.exec(rest)
      // 记号前面至少留一个字的标题位置：「- [ ] 📅 2026-11-23」也算（标题是空的）
      if (!m || m.index < titleStart - 1) continue
      const start = m.index
      const emojiAt = rest.indexOf(m[1]!, start)
      if (p.kind === 'prio') {
        hit = { kind: 'prio', start, end, emoji: m[1]!, value: m[1]!, valueStart: emojiAt, valueEnd: end }
      } else {
        const value = m[2]!
        // 内容都在这一段的最后（📅 后面可能还跟着钟点，要从记号往后找）
        const valueStart = p.kind === 'date' ? rest.indexOf(value, emojiAt) : end - value.length
        const f: Field = { kind: p.kind, start, end, emoji: m[1]!, value, valueStart, valueEnd: valueStart + value.length }
        if (p.kind === 'date' && m[4]) {
          f.time = m[4]
          f.timeEnd = end
          f.timeStart = end - m[4].length
        }
        hit = f
      }
      break
    }
    if (!hit) break
    fields.unshift(hit)
    end = hit.start
    if (end <= titleStart) break
  }
  const titleEnd = Math.max(titleStart, end)
  const t: TaskLine = {
    indent,
    bullet,
    mark,
    markAt,
    done: mark === 'x' || mark === 'X',
    cancelled: mark === '-',
    title: line.slice(titleStart, titleEnd),
    titleStart,
    titleEnd,
    fields,
    date: null,
    time: null,
    remind: null,
    repeat: null,
    prio: 0,
    id: null,
    doneDate: null,
  }
  for (const f of fields) {
    if (f.kind === 'date') {
      t.date = f.value
      t.time = f.time ? normTime(f.time) : null
    } else if (f.kind === 'remind') t.remind = f.value
    else if (f.kind === 'repeat') t.repeat = f.value
    else if (f.kind === 'prio') t.prio = PRIO_OF[f.emoji] ?? 0
    else if (f.kind === 'id') t.id = f.value
    else if (f.kind === 'done') t.doneDate = f.value
  }
  return t
}

/** 这一行是不是待办（不管写了什么记号） */
export const isTaskLine = (line: string): boolean => HEAD.test(line)
