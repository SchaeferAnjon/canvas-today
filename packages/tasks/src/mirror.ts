/**
 * 镜像进系统「提醒事项」（2026-11-22 用户选 A：「那就选a」）：带 🔔 的待办在 iCloud 提醒事项的「画布今日」列表里放一份，
 * 苹果同步、到点由提醒事项在每台设备上响；镜像了的，我们所有的 App 都不再给它排本机通知（索引里 ringBy: 'reminders'）。
 * 这里只有纯函数：一条待办在提醒事项里长什么样（mirrorFields），一次同步两边各要改什么（planMirror）。
 * 读写提醒事项的是画布今日里的 Swift 小助手；写回库里那一行（只改那几个字）由调用的人做。
 *
 * 同步的规矩（规格 05-任务软件 7-flow）：
 * - 我们这边新建、改标题、改时间、改提醒、勾掉、删掉都同步过去；提醒事项里勾掉、改时间、改标题写回库里那一行；
 *   提醒事项里删掉那条只去掉库里那条的 🔔（提示一次）。
 * - 冲突：勾掉优先；别的以后改的为准（库里看那篇笔记的修改时间，提醒事项看那一条的修改时间）；差不到一分钟分不清，以库为准、提示一次。
 * - 重复的只镜像下一次那一条（勾掉后库里生成的下一条有新的 🆔，另建一条）；子任务不镜像。
 * - 两台设备各镜像出一份时靠 🆔 认出、留先建的。
 * - 「上次同步时两边是什么样」（base）每台设备各记一份，丢了也不要紧：没记过的那条按「认领」处理（库为准、勾掉优先）。
 */
import { isISODate, normTime } from './dates'
import { setDate, setDone, setId, setRemind, setTime, setTitle } from './edit'
import { editLine, lineAt, splitLines } from './file'
import { parseTaskLine, type Prio } from './line'
import { completeTask } from './recur'
import { fireAt, parseRemind } from './remind'

/** 默认镜像进去的列表 */
export const MIRROR_LIST = '画布今日'

/** 提醒事项里认出是哪一条：链接 canvas-today://task/<🆔>（点开回画布今日的这一条） */
export const mirrorUrl = (id: string): string => `canvas-today://task/${id}`

const ID_RE = /canvas-today:\/\/task\/([A-Za-z0-9_-]+)/g

/**
 * 这一条是不是我们镜像的、是哪一条。EventKit 的 url 在提醒事项 App 里看不到、App 里填的网址也读不到（苹果开发者论坛 thread/128140），
 * 所以备注最后一行也写一份链接：链接读不到时看备注
 */
export function idFromMirror(url: string | null | undefined, notes: string | null | undefined): string | null {
  for (const s of [url, notes]) {
    if (!s) continue
    const all = [...s.matchAll(ID_RE)]
    if (all.length) return all[all.length - 1]![1]!
  }
  return null
}

/** EventKit 的优先级：1 高、5 中、9 低、0 没设（提醒事项 App 里的三档） */
export const EK_PRIO: Record<Prio, number> = { 0: 0, 1: 9, 2: 5, 3: 1 }

/** 读回来：1–4 算高，5 中，6–9 低 */
export function prioFromEK(p: number): Prio {
  if (p >= 1 && p <= 4) return 3
  if (p === 5) return 2
  if (p >= 6 && p <= 9) return 1
  return 0
}

/** 闹钟：at 是本地钟点「2026-11-23T14:00」；offset 是相对到期多少秒（负的是提前）；place 是到某地提醒（我们不做，只读） */
export type RemAlarm = { at: string } | { offset: number } | { place: string }

/** 到期：「2026-11-23 15:00」，没钟点「2026-11-23」 */
export const dueOf = (date: string | null, time: string | null): string | null => (date ? (time ? `${date} ${time}` : date) : null)

export function parseDue(due: string): { date: string; time: string | null } | null {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?$/.exec(due.trim())
  if (!m || !isISODate(m[1]!)) return null
  const time = m[2] ? normTime(m[2]) : null
  if (m[2] && !time) return null
  return { date: m[1]!, time }
}

/**
 * 闹钟按 🔔 算：有钟点的「提前 N」「准时」写成相对到期（在提醒事项里改了到期时间，闹钟跟着挪，不用等我们同步）；
 * 没钟点（照 09:00 算）、「前一天 20:00」写成绝对的本地钟点。没日子、说法认不出：没有闹钟
 */
export function alarmOf(date: string | null, time: string | null, remind: string | null): RemAlarm | null {
  if (!date || !remind) return null
  const r = parseRemind(remind)
  if (!r) return null
  if (time && r.kind === 'before') return { offset: r.minutes ? -r.minutes * 60 : 0 }
  const at = fireAt(date, time, remind)
  return at ? { at } : null
}

const MARKS = /[📅⏰⏳🛫🔔🔁🆔⛔➕✅❌🏁⏫🔺🔼🔽⏬]️?/gu

/** 从提醒事项来的标题：去掉我们的记号（不然写进行里读出来变成日子、提醒）、收成一行 */
export const cleanTitle = (s: string): string => s.replace(MARKS, ' ').replace(/\s+/g, ' ').trim()

/** 没写标题的待办在提醒事项里叫什么 */
export const UNTITLED = '（没写名字）'

/** 镜像要知道的一条待办（从索引里取，mirrorSource） */
export interface MirrorSource {
  id: string | null
  title: string
  date: string | null
  time: string | null
  remind: string | null
  prio: Prio
  /** 勾掉了或取消了 */
  done: boolean
  path: string
  /** 第几行，从 0 数 */
  line: number
  /** 是子任务（不镜像） */
  isSub: boolean
  subsDone: number
  subsTotal: number
  /** 那篇笔记最后改的时候（毫秒）：两边都改了时比先后 */
  modified: number
}

/** 索引里的一条 → MirrorSource；isDone：子任务做没做完（按 key 查） */
export function mirrorSource(
  t: { id: string | null; title: string; date: string | null; time: string | null; remind: string | null; prio: Prio; done: boolean; cancelled: boolean; path: string; line: number; parent: string | null; subs: string[] },
  isDone: (key: string) => boolean,
  modified: number,
): MirrorSource {
  return {
    id: t.id,
    title: t.title,
    date: t.date,
    time: t.time,
    remind: t.remind,
    prio: t.prio,
    done: t.done || t.cancelled,
    path: t.path,
    line: t.line,
    isSub: t.parent !== null,
    subsDone: t.subs.filter(isDone).length,
    subsTotal: t.subs.length,
    modified,
  }
}

/** 提醒事项里那一条我们管的几样 */
export interface RemFields {
  title: string
  due: string | null
  completed: boolean
  priority: number
  alarms: RemAlarm[]
  notes: string
  url: string
}

/** 「来自《小论文计划》· 写作」：几层文件夹用 › 连（和画布今日界面上一样） */
export function sourceLine(path: string): string {
  const parts = path.split('/').filter(Boolean)
  const name = (parts.pop() ?? path).replace(/\.md$/i, '')
  return parts.length ? `来自《${name}》· ${parts.join(' › ')}` : `来自《${name}》`
}

/**
 * 一条待办在提醒事项里的样子（7-item）：标题不带记号；到期是 📅；闹钟按 🔔；优先级三档；链接 canvas-today://task/🆔；
 * 备注三行：「来自《笔记》· 文件夹 · 子任务 0/4」、回到笔记那一行的链接（noteUrl，行号从 1 数）、canvas-today 链接。
 * 提醒事项是系统界面，不会自动在中文和数字之间加间距，「子任务 0/4」照 macOS 习惯留空格
 */
export function mirrorFields(s: MirrorSource, noteUrl: (path: string, line: number) => string): RemFields {
  const id = s.id ?? ''
  const head = sourceLine(s.path) + (s.subsTotal ? ` · 子任务 ${s.subsDone}/${s.subsTotal}` : '')
  const alarm = alarmOf(s.date, s.time, s.remind)
  return {
    title: s.title.trim() || UNTITLED,
    due: dueOf(s.date, s.time),
    completed: s.done,
    priority: EK_PRIO[s.prio],
    alarms: alarm ? [alarm] : [],
    notes: [head, noteUrl(s.path, s.line + 1), mirrorUrl(id)].join('\n'),
    url: mirrorUrl(id),
  }
}

/** 提醒事项里的一条（Swift 小助手读出来的） */
export interface RemItem {
  /** EventKit 的 calendarItemIdentifier */
  rid: string
  title: string
  notes: string | null
  url: string | null
  due: string | null
  completed: boolean
  /** 勾掉的那一刻（本地钟点「2026-11-23T15:02」） */
  completedAt: string | null
  priority: number
  alarms: RemAlarm[]
  /** 建的、最后改的时候（毫秒） */
  created: number
  modified: number
}

/** 上次同步完两边是什么样（每台设备各记一份） */
export interface MirrorBase {
  rid: string
  title: string
  due: string | null
  done: boolean
  priority: number
  /** 写过去的闹钟（JSON） */
  alarms: string
  notes: string
  /** 同步的时候（毫秒） */
  at: number
}

/** 要写回库里那一行的（调用的人按 🆔 找到那一行，只改那几个字） */
export type WriteBack =
  | { op: 'tick'; id: string; path: string; line: number; title: string; date: string | null }
  | { op: 'untick'; id: string; path: string; line: number; title: string }
  | { op: 'title'; id: string; path: string; line: number; title: string; was: string }
  | { op: 'due'; id: string; path: string; line: number; title: string; date: string | null; time: string | null }
  | { op: 'unremind'; id: string; path: string; line: number; title: string }
  /** 带提醒、要镜像但没有 🆔 的：先给它一个（下一次同步再建） */
  | { op: 'assignId'; path: string; line: number; title: string }

export type MirrorNotice =
  | { kind: 'deleted'; id: string; title: string }
  | { kind: 'conflict'; id: string; title: string; field: 'title' | 'due' }
  | { kind: 'massGone'; n: number }

export interface MirrorPlan {
  create: { id: string; fields: RemFields }[]
  update: { id: string; rid: string; patch: Partial<RemFields> }[]
  remove: { id: string; rid: string }[]
  writeBack: WriteBack[]
  /** base 要改成的（null 是不再记）；新建的那几条建好拿到 rid 后由调用的人记 */
  base: Map<string, MirrorBase | null>
  notices: MirrorNotice[]
  /** 同步完还镜像着的（索引里标 ringBy: 'reminders'，本机不再排通知）；新建的建好了调用的人再加上 */
  mirrored: string[]
  /** 库里一下子少了好多条时，先等一等的那几条：🆔 → 头一次发现不见的时候 */
  pendingGone: Record<string, number>
}

export interface MirrorInput {
  /** 库里的待办（有 🆔 的，和带提醒、没 🆔 的） */
  tasks: MirrorSource[]
  /** 那个列表里现在的（包括已完成的） */
  items: RemItem[]
  base: Record<string, MirrorBase>
  /** 现在（毫秒，和文件修改时间、提醒事项的修改时间同一个钟） */
  now: number
  pendingGone?: Record<string, number>
  /** 回到笔记那一行的链接（画布笔记的 canvas-notes://open） */
  noteUrl: (path: string, line: number) => string
}

/** 一下子少了这么多条（而且超过一半）当成「不是用户一条条删的」 */
const MASS = 5
/** 库里一下子少了很多条：等这么久还不在再删（切分支、Git 拉的半路） */
const WAIT_GONE = 30_000
/** 两边修改时间差不到这么多算分不清先后 */
const CLOSE = 60_000

/** 要镜像的新的一条：没做完、不是子任务、有 📅、🔔 认得出 */
const wantsNew = (t: MirrorSource) => !t.isSub && !t.done && !!t.date && !!t.remind && !!parseRemind(t.remind)

/** 镜像过的还接着镜像：还在、不是子任务、还带着 🔔（去掉 📅 的留着，只是没有到期和闹钟） */
const keeps = (t: MirrorSource) => !t.isSub && !!t.remind

/** 两边都改了，谁晚：差不到一分钟分不清 */
function later(vault: number, rem: number): 'vault' | 'rem' | null {
  if (rem - vault > CLOSE) return 'rem'
  if (vault - rem > CLOSE) return 'vault'
  return null
}

const alarmsOf = (due: string | null, remind: string | null): RemAlarm[] => {
  const d = due ? parseDue(due) : null
  const a = alarmOf(d?.date ?? null, d?.time ?? null, remind)
  return a ? [a] : []
}

export function planMirror(inp: MirrorInput): MirrorPlan {
  const out: MirrorPlan = { create: [], update: [], remove: [], writeBack: [], base: new Map(), notices: [], mirrored: [], pendingGone: {} }
  const base = inp.base
  // 库里有 🆔 的按 🆔 找（同一个 🆔 抄了两行的用第一行）；带提醒、没 🆔 的先给它一个
  const byId = new Map<string, MirrorSource>()
  for (const t of inp.tasks) {
    if (t.id) {
      if (!byId.has(t.id)) byId.set(t.id, t)
    } else if (wantsNew(t)) out.writeBack.push({ op: 'assignId', path: t.path, line: t.line, title: t.title })
  }
  // 提醒事项里认得出的，按 🆔 分组；同一个 🆔 好几条（两台设备各建了一份）：留先建的，删别的（只删这个库里、或记过的 🆔）
  const groups = new Map<string, RemItem[]>()
  for (const r of inp.items) {
    const id = idFromMirror(r.url, r.notes)
    if (!id) continue
    const g = groups.get(id)
    if (g) g.push(r)
    else groups.set(id, [r])
  }
  const rem = new Map<string, RemItem>()
  for (const [id, rs] of groups) {
    if (!byId.has(id) && !base[id]) continue
    rs.sort((a, b) => a.created - b.created || (a.rid < b.rid ? -1 : a.rid > b.rid ? 1 : 0))
    rem.set(id, rs[0]!)
    for (const r of rs.slice(1)) out.remove.push({ id, rid: r.rid })
  }

  const baseIds = Object.keys(base)
  // 提醒事项里一下子少了好多条（别的设备关了镜像、列表被清空、换了账户）：不当成一条条删的，不去掉 🔔，重新放进去
  const vanished = baseIds.filter((id) => !rem.has(id))
  const massVanish = vanished.length >= MASS && vanished.length * 2 > baseIds.length
  if (massVanish) out.notices.push({ kind: 'massGone', n: vanished.length })
  // 库里一下子少了好多条（切分支、Git 拉的半路）：先等 30 秒
  const goneFromVault = baseIds.filter((id) => !byId.has(id) && rem.has(id))
  const massGoneVault = goneFromVault.length >= MASS && goneFromVault.length * 2 > baseIds.length

  const create = (v: MirrorSource) => out.create.push({ id: v.id!, fields: mirrorFields(v, inp.noteUrl) })

  const ids = new Set<string>([...baseIds, ...rem.keys()])
  for (const [id, v] of byId) if (wantsNew(v)) ids.add(id)

  for (const id of ids) {
    const v = byId.get(id) ?? null
    const r = rem.get(id) ?? null
    const b = base[id] ?? null
    if (!b) {
      if (v && !r) {
        if (wantsNew(v)) create(v)
      } else if (v && r && keeps(v)) adopt(v, r)
      // 提醒事项里有、库里没有这个 🆔，又没记过：别的库、别的设备的，不碰
      continue
    }
    if (!v) {
      // 库里那一行删掉了
      if (!r) out.base.set(id, null)
      else if (massGoneVault) {
        const first = inp.pendingGone?.[id] ?? inp.now
        if (inp.now - first >= WAIT_GONE) {
          out.remove.push({ id, rid: r.rid })
          out.base.set(id, null)
        } else out.pendingGone[id] = first
      } else {
        out.remove.push({ id, rid: r.rid })
        out.base.set(id, null)
      }
      continue
    }
    if (!keeps(v)) {
      // 去掉了 🔔、成了子任务：那边删掉，以后本机自己管（没提醒就不响）
      if (r) out.remove.push({ id, rid: r.rid })
      out.base.set(id, null)
      continue
    }
    if (!r) {
      out.base.set(id, null)
      if (massVanish) {
        if (!v.done) create(v)
      } else if (!v.done) {
        // 在提醒事项里删掉了：库里这一条不删，只去掉 🔔，提示一次
        out.writeBack.push({ op: 'unremind', id, path: v.path, line: v.line, title: v.title })
        out.notices.push({ kind: 'deleted', id, title: v.title })
      }
      continue
    }
    merge(id, v, r, b)
  }

  /** 认领一条没记过的（另一台设备建的、本机记录丢了）：库里的为准，勾掉优先 */
  function adopt(v: MirrorSource, r: RemItem) {
    const id = v.id!
    const want = mirrorFields(v, inp.noteUrl)
    const patch: Partial<RemFields> = {}
    if (r.title !== want.title) patch.title = want.title
    if (r.due !== want.due) patch.due = want.due
    const done = v.done || r.completed
    if (done !== r.completed) patch.completed = done
    if (r.completed && !v.done) out.writeBack.push({ op: 'tick', id, path: v.path, line: v.line, title: v.title, date: r.completedAt ? r.completedAt.slice(0, 10) : null })
    if (r.priority !== want.priority) patch.priority = want.priority
    if (JSON.stringify(r.alarms) !== JSON.stringify(want.alarms)) patch.alarms = want.alarms
    if (r.notes !== want.notes) patch.notes = want.notes
    if (r.url !== want.url) patch.url = want.url
    if (Object.keys(patch).length) out.update.push({ id, rid: r.rid, patch })
    out.base.set(id, { rid: r.rid, title: want.title, due: want.due, done, priority: want.priority, alarms: JSON.stringify(want.alarms), notes: want.notes, at: inp.now })
  }

  /** 三方比：库里现在、提醒事项里现在、上次同步完 */
  function merge(id: string, v: MirrorSource, r: RemItem, b: MirrorBase) {
    const want = mirrorFields(v, inp.noteUrl)
    const patch: Partial<RemFields> = {}
    const wb: WriteBack[] = []
    const at = { id, path: v.path, line: v.line }
    const who = later(v.modified, r.modified)

    // 标题
    const rTitle = cleanTitle(r.title)
    let title: string
    const vT = want.title !== b.title
    const rT = rTitle !== b.title
    if (vT && rT && want.title !== rTitle) {
      if (who === 'rem') {
        title = rTitle
        wb.push({ op: 'title', ...at, title: rTitle, was: v.title })
      } else {
        title = want.title
        if (!who) out.notices.push({ kind: 'conflict', id, title: want.title, field: 'title' })
      }
    } else if (rT) {
      title = rTitle
      if (rTitle !== want.title) wb.push({ op: 'title', ...at, title: rTitle, was: v.title })
    } else title = want.title
    if (r.title !== title) patch.title = title

    // 到期（📅 日子和钟点）
    let due: string | null
    const vD = want.due !== b.due
    const rD = r.due !== b.due
    const backDue = (d: string | null) => {
      const p = d ? parseDue(d) : null
      wb.push({ op: 'due', ...at, title: title, date: p?.date ?? null, time: p?.time ?? null })
    }
    if (vD && rD && want.due !== r.due) {
      if (who === 'rem') {
        due = r.due
        backDue(r.due)
      } else {
        due = want.due
        if (!who) out.notices.push({ kind: 'conflict', id, title, field: 'due' })
      }
    } else if (rD) {
      due = r.due
      if (r.due !== want.due) backDue(r.due)
    } else due = want.due
    if (r.due !== due) patch.due = due

    // 勾没勾：两边都改了就勾掉优先
    const vX = v.done !== b.done
    const rX = r.completed !== b.done
    const done = vX && rX ? v.done || r.completed : vX ? v.done : rX ? r.completed : b.done
    if (done !== r.completed) patch.completed = done
    if (done !== v.done)
      wb.push(done ? { op: 'tick', ...at, title, date: r.completedAt ? r.completedAt.slice(0, 10) : null } : { op: 'untick', ...at, title })

    // 优先级、闹钟、备注、链接：库为准，只在库里变了时写过去（提醒事项里手改的这几样不跟它抢）
    if (want.priority !== b.priority) patch.priority = want.priority
    const alarms = alarmsOf(due, v.remind)
    const alarmsJ = JSON.stringify(alarms)
    if (alarmsJ !== b.alarms) patch.alarms = alarms
    if (want.notes !== b.notes) patch.notes = want.notes
    if (r.url !== want.url) patch.url = want.url

    out.writeBack.push(...wb)
    if (Object.keys(patch).length) out.update.push({ id, rid: r.rid, patch })
    out.base.set(id, { rid: r.rid, title, due, done, priority: want.priority, alarms: alarmsJ, notes: want.notes, at: inp.now })
  }

  // 同步完还镜像着的：原来记着的（没被拿掉）加上这次认领、改过的
  const final = new Map<string, MirrorBase | null>(Object.entries(base))
  for (const [id, b] of out.base) final.set(id, b)
  out.mirrored = [...final].filter(([, b]) => b !== null).map(([id]) => id)
  return out
}

/** 那一行在第几行：先看原来的行号，不对就按 🆔 找（外面在上面加了几行）；加编号的按行号和标题认 */
function locate(text: string, w: WriteBack): number | null {
  const at = (n: number) => {
    const l = lineAt(text, n)
    return l === undefined ? null : parseTaskLine(l)
  }
  if (w.op === 'assignId') {
    const ok = (n: number) => {
      const t = at(n)
      return !!t && !t.id && !!t.remind && t.title === w.title
    }
    if (ok(w.line)) return w.line
    const n = splitLines(text).length
    let best: number | null = null
    for (let i = 0; i < n; i++) if (ok(i) && (best === null || Math.abs(i - w.line) < Math.abs(best - w.line))) best = i
    return best
  }
  if (at(w.line)?.id === w.id) return w.line
  const n = splitLines(text).length
  for (let i = 0; i < n; i++) if (at(i)?.id === w.id) return i
  return null
}

/**
 * 把同步要写回的几样改进这一篇（同一篇的几样按顺序一样样改）：按 🆔 找那一行，只改那几个字；
 * 勾掉重复的照 completeTask 在下面加下一次那一条（新编号 newId）。找不到那一行的放进 missing，不改
 */
export function applyWriteBacks(text: string, wbs: WriteBack[], today: string, newId: () => string): { text: string; applied: WriteBack[]; missing: WriteBack[] } {
  let out = text
  const applied: WriteBack[] = []
  const missing: WriteBack[] = []
  for (const w of wbs) {
    const n = locate(out, w)
    if (n === null) {
      missing.push(w)
      continue
    }
    switch (w.op) {
      case 'tick':
        if (!parseTaskLine(lineAt(out, n)!)!.done) out = completeTask(out, n, w.date ?? today, newId).text
        break
      case 'untick':
        out = editLine(out, n, (l) => setDone(l, false, today))
        break
      case 'title':
        if (w.title.trim()) out = editLine(out, n, (l) => setTitle(l, w.title))
        break
      case 'due':
        out = editLine(out, n, (l) => (w.date ? setTime(setDate(l, w.date), w.time, today) : setDate(l, null)))
        break
      case 'unremind':
        out = editLine(out, n, (l) => setRemind(l, null))
        break
      case 'assignId':
        out = editLine(out, n, (l) => setId(l, newId()))
        break
    }
    applied.push(w)
  }
  return { text: out, applied, missing }
}
