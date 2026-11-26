/**
 * 改一行待办：只换要改的那几个字，这一行别的字节一个不动（「打开再保存文件不变」那条规矩落到每一行上）。
 * 有这个记号：只换它的内容；没有：按定稿的先后插进去（放在第一个比它靠后的记号前面，都没有就放行尾、行尾空白之前）；
 * 拿掉：连前面那个空格一起删。传进来的行不带换行符（\r 由 file.ts 管）。不是待办的行原样返回。
 * 行尾的 #标签、<!-- 注释 -->、^块编号 排在最后：新记号插在它们前面，块编号一直在行尾（别处的块链接不断）。
 * 日子从哪来就改哪（📅、⏳、Dataview 的 due::）；拿掉日子时这几样都拿掉（不然拿掉 📅 以后 ⏳ 又顶上来）。
 */
import { type ISODate } from './dates'
import { DURATION_KEYS, minutesTextLike } from './duration'
import { EMOJI, type Field, type FieldKind, isDuration, isDvDue, LOWEST, ORDER, parseTaskLine, type Prio, PRIO_EMOJI, type TaskLine } from './line'

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
function setField(line: string, kind: keyof typeof EMOJI, value: string | null): string {
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

/** 日子写在哪个记号里（📅、没有 📅 时的 ⏳ 或 Dataview 的 due） */
function dateField(t: TaskLine): Field | undefined {
  if (t.dateFrom === 'dv') return t.fields.findLast(isDvDue)
  return t.dateFrom ? field(t, t.dateFrom) : undefined
}

/** 拿掉几个记号（从右往左删，前面的位置不变） */
function dropFields(line: string, fs: Field[]): string {
  let out = line
  for (const f of [...fs].sort((a, b) => b.start - a.start)) out = splice(out, f.start, f.end, '')
  return out
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
  // 改回没做完：✅ 和 ❌ 的日子都拿掉
  return setField(setField(splice(line, t.markAt, t.markAt + 1, ' '), 'done', null), 'cancel', null)
}

/** 不做了：[-] 加 ❌ 今天（Obsidian Tasks 的取消写法）；已经取消的原样 */
export function setCancelled(line: string, today: ISODate): string {
  const t = parseTaskLine(line)
  if (!t || t.cancelled) return line
  const marked = splice(line, t.markAt, t.markAt + 1, '-')
  return setField(setField(marked, 'done', null), 'cancel', today)
}

/**
 * 估时（分钟，duration.ts）：有估时字段就换它的值（别人写的英文 30m 照英文写回）；没有就加「[估时:: 30分钟]」，
 * 照 Dataview 字段的位置放在别的记号前面（标题后面、📅 前面）；null 拿掉
 */
export function setDuration(line: string, minutes: number | null): string {
  const t = parseTaskLine(line)
  if (!t) return line
  const fs = t.fields.filter(isDuration)
  if (minutes === null) return dropFields(line, fs)
  const f = fs[fs.length - 1]
  if (f) {
    const v = minutesTextLike(minutes, f.value)
    return f.value === v ? line : splice(line, f.valueStart, f.valueEnd, v)
  }
  const at = insertAt(t, 'dv')
  // 后面紧贴着记号（「（第二次）📅 2026-09-22」这种没空格的）：补一个空格，不写成「]📅」
  const gap = at < line.length && !/\s/.test(line[at]!) ? ' ' : ''
  return splice(line, at, at, ` [${DURATION_KEYS[0]}:: ${minutesTextLike(minutes, '')}]${gap}`)
}

/** 改日子：日子从哪个记号来就改哪个；没有就加 📅；null 拿掉 📅、⏳ 和 Dataview 的 due */
export function setDate(line: string, date: ISODate | null): string {
  const t = parseTaskLine(line)
  if (!t) return line
  if (date === null) return dropFields(line, t.fields.filter((f) => f.kind === 'date' || f.kind === 'sched' || isDvDue(f)))
  const f = dateField(t)
  if (!f) return setField(line, 'date', date)
  return f.value === date ? line : splice(line, f.valueStart, f.valueEnd, date)
}

/** 拿掉一种记号（连前面那个空格） */
export function removeField(line: string, kind: FieldKind): string {
  const t = parseTaskLine(line)
  return t ? dropAll(line, t, kind) : line
}

/** 钟点跟在日子后面（📅 ⏳ 空一格，Dataview 的 due 用 T 连着）；没有日子时加钟点，日子是 today */
export function setTime(line: string, time: string | null, today?: ISODate): string {
  const t = parseTaskLine(line)
  if (!t) return line
  const f = dateField(t)
  if (!f) {
    if (time === null || !today) return line
    return setField(line, 'date', `${today} ${time}`)
  }
  if (time === null) return f.time ? splice(line, f.valueEnd, f.timeEnd!, '') : line
  if (f.time) return f.time === time ? line : splice(line, f.timeStart!, f.timeEnd!, time)
  return splice(line, f.valueEnd, f.valueEnd, `${f.kind === 'dv' ? 'T' : ' '}${time}`)
}

export const setRemind = (line: string, v: string | null): string => setField(line, 'remind', v === null ? null : oneLine(v) || null)
export const setRepeat = (line: string, v: string | null): string => setField(line, 'repeat', v === null ? null : oneLine(v) || null)
export const setId = (line: string, id: string | null): string => setField(line, 'id', id)

/** lowest：低优先级写成 ⏬（最低，画布今日四象限第 4 格；读的时候 ⏬ 和 🔽 都算低，PRIO_OF） */
export function setPrio(line: string, p: Prio, lowest = false): string {
  const t = parseTaskLine(line)
  if (!t) return line
  const f = field(t, 'prio')
  if (p === 0) return dropAll(line, t, 'prio')
  const e = p === 1 && lowest ? LOWEST : PRIO_EMOJI[p]
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

/** 32 位 FNV-1a（按 UTF-16 码元） */
function fnv(s: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h
}

/** 照一段文字算出来的 6 位编号（和 makeId 同一套字）：几台设备照同样的文字算出同一个 */
export function hashId(key: string): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let n = fnv(key, 0x811c9dc5) * 2 ** 21 + (fnv(key, 0x050c5d1f) & 0x1fffff)
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += abc[n % 36]
    n = Math.floor(n / 36)
  }
  return s
}
