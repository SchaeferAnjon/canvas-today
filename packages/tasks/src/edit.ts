/**
 * 改一行待办：只换要改的那几个字，这一行别的字节一个不动（「打开再保存文件不变」那条规矩落到每一行上）。
 * 有这个记号：只换它的内容；没有：按定稿的先后插进去（放在第一个比它靠后的记号前面，都没有就放行尾、行尾空白之前）；
 * 拿掉：连前面那个空格一起删。传进来的行不带换行符（\r 由 file.ts 管）。不是待办的行原样返回。
 */
import { type ISODate } from './dates'
import { EMOJI, type Field, type FieldKind, ORDER, parseTaskLine, type Prio, PRIO_EMOJI, type TaskLine } from './line'

const splice = (s: string, from: number, to: number, put: string) => s.slice(0, from) + put + s.slice(to)

/** 一行里去掉换行、收成一行（标题、提醒、重复里不许有换行） */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

const rank = (k: FieldKind) => ORDER.indexOf(k)

/** 新记号放哪：第一个比它靠后的记号前面；都没有就放在最后一个记号（或标题）后面 */
function insertAt(t: TaskLine, kind: FieldKind): number {
  const later = t.fields.find((f) => rank(f.kind) > rank(kind))
  if (later) return later.start
  const last = t.fields[t.fields.length - 1]
  return last ? last.end : t.titleEnd
}

/** 这种记号：写了两遍的（手打重了）按读的规矩取最靠行尾的那个 */
function field(t: TaskLine, kind: FieldKind): Field | undefined {
  return t.fields.findLast((f) => f.kind === kind)
}

/** 拿掉这种记号：写了两遍的都拿掉（不然读出来还在） */
function dropAll(line: string, t: TaskLine, kind: FieldKind): string {
  let out = line
  for (const f of [...t.fields].reverse()) if (f.kind === kind) out = splice(out, f.start, f.end, '')
  return out
}

/** 设一个有内容的记号；value 是 null 就拿掉 */
function setField(line: string, kind: Exclude<FieldKind, 'prio'>, value: string | null): string {
  const t = parseTaskLine(line)
  if (!t) return line
  const f = field(t, kind)
  if (value === null) return dropAll(line, t, kind)
  if (f) {
    // 📅 带着钟点时，只换日子那十个字
    return f.value === value ? line : splice(line, f.valueStart, f.valueEnd, value)
  }
  const at = insertAt(t, kind)
  return splice(line, at, at, ` ${EMOJI[kind]} ${value}`)
}

export function setDone(line: string, done: boolean, today: ISODate): string {
  const t = parseTaskLine(line)
  if (!t) return line
  if (done) {
    if (t.done) return line
    const marked = splice(line, t.markAt, t.markAt + 1, 'x')
    return field(t, 'done') ? marked : setField(marked, 'done', today)
  }
  if (!t.done && !t.cancelled) return line
  return setField(splice(line, t.markAt, t.markAt + 1, ' '), 'done', null)
}

export const setDate = (line: string, date: ISODate | null): string => setField(line, 'date', date)

/** 拿掉一种记号（连前面那个空格） */
export function removeField(line: string, kind: FieldKind): string {
  const t = parseTaskLine(line)
  return t ? dropAll(line, t, kind) : line
}

/** 钟点跟在 📅 日子后面；没有日子时加钟点，日子是 today */
export function setTime(line: string, time: string | null, today?: ISODate): string {
  const t = parseTaskLine(line)
  if (!t) return line
  const f = field(t, 'date')
  if (!f) {
    if (time === null || !today) return line
    return setField(line, 'date', `${today} ${time}`)
  }
  if (time === null) return f.time ? splice(line, f.valueEnd, f.timeEnd!, '') : line
  if (f.time) return f.time === time ? line : splice(line, f.timeStart!, f.timeEnd!, time)
  return splice(line, f.valueEnd, f.valueEnd, ` ${time}`)
}

export const setRemind = (line: string, v: string | null): string => setField(line, 'remind', v === null ? null : oneLine(v) || null)
export const setRepeat = (line: string, v: string | null): string => setField(line, 'repeat', v === null ? null : oneLine(v) || null)
export const setId = (line: string, id: string | null): string => setField(line, 'id', id)

export function setPrio(line: string, p: Prio): string {
  const t = parseTaskLine(line)
  if (!t) return line
  const f = field(t, 'prio')
  if (p === 0) return dropAll(line, t, 'prio')
  const e = PRIO_EMOJI[p]
  if (f) return f.emoji === e && f.valueEnd - f.valueStart === e.length ? line : splice(line, f.valueStart, f.valueEnd, e)
  const at = insertAt(t, 'prio')
  return splice(line, at, at, ` ${e}`)
}

export function setTitle(line: string, title: string): string {
  const t = parseTaskLine(line)
  if (!t) return line
  const v = oneLine(title)
  // 标题原来是空的、后面紧跟着记号：记号前面那个空格算在记号里，新标题后面补一个
  const first = t.fields[0]
  const gap = t.title === '' && first && first.start < t.titleStart && v ? ' ' : ''
  return splice(line, t.titleStart, t.titleEnd, v + gap)
}

export interface NewTask {
  title: string
  indent?: string
  date?: ISODate | null
  time?: string | null
  remind?: string | null
  repeat?: string | null
  prio?: Prio
  id?: string | null
}

/** 新写一行：照定稿的顺序 */
export function newTaskLine(o: NewTask): string {
  let s = `${o.indent ?? ''}- [ ] ${oneLine(o.title)}`
  if (o.date) s += ` ${EMOJI.date} ${o.date}${o.time ? ' ' + o.time : ''}`
  if (o.remind) s += ` ${EMOJI.remind} ${oneLine(o.remind)}`
  if (o.repeat) s += ` ${EMOJI.repeat} ${oneLine(o.repeat)}`
  if (o.prio) s += ` ${PRIO_EMOJI[o.prio]}`
  if (o.id) s += ` ${EMOJI.id} ${o.id}`
  return s
}

/** 6 位编号（只给要被别处指着的那条：提醒记录、canvas-today://task/<编号>） */
export function makeId(random: () => number): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += abc[Math.floor(random() * abc.length)]
  return s
}
