/**
 * 界面上的每个动作 → 改库里那一行（@cn/tasks 只换那几个字）。
 * 先认行：盘上第 line 行还是界面看到的那一行原文就改它；不是了（外面在上面加了几行、改了别处）就按原文找最近的一样的行，
 * 再按 🆔 找；都找不到就不改，告诉界面「这一行刚被别处改了」。
 * 抄了好几遍的同一条（索引里 dupOf / dups）：勾掉、改日子钟点、改名、删掉写到每一份上（一次改动、一个撤销），别的只改点的那一份。
 */
import { addSubtask, appendTask, completeTask, type CopyEdit, copiesOf, editCopy, editLine, type ISODate, isISODate, lineAt, makeId, minutesText, moveBlock, newTaskLine, normTime, parseQuick, parseRemind, parseRepeat, parseTaskLine, removeBlock, setCancelled, setDate, setDone, setDuration, setId, setPrio, setRemind, setRepeat, setTime, setTitle, setWhen, splitLines, type When } from '@cn/tasks'
import type { AddCtx, AddResult, EditReq, EditResult, Snapshot } from '../shared/api'
import type { PlanChange } from '../shared/ai-chat'
import { INBOX_NOTE } from '../shared/brand'
import { notesFor } from '../shared/quick'
import { isoPlus } from '../shared/when'
import { ReadOnlyError, type TaskVault } from './vault'

const newId = () => makeId(Math.random)

/** 文字里认那一行：先看原来的行号，再找原文一样、离得最近的，再按 🆔 */
export function locate(text: string, line: number, raw: string): number | null {
  if (lineAt(text, line) === raw) return line
  const lines = splitLines(text)
  let best: number | null = null
  for (let i = 0; i < lines.length; i++) {
    if (lineAt(text, i) !== raw) continue
    if (best === null || Math.abs(i - line) < Math.abs(best - line)) best = i
  }
  if (best !== null) return best
  const id = parseTaskLine(raw)?.id
  if (id) for (let i = 0; i < lines.length; i++) if (parseTaskLine(lineAt(text, i) ?? '')?.id === id) return i
  return null
}

/** 这种改法另外几份要不要跟着改、怎么改（@cn/tasks dupes.ts）；null 是只改点的那一份 */
function copyEdit(e: EditReq['edit']): CopyEdit | null {
  switch (e.op) {
    case 'done':
      return { op: 'done', done: e.done }
    case 'cancel':
      return { op: 'cancel' }
    case 'date':
      return { op: 'when', date: e.date, ...(e.date && e.time !== undefined ? { time: e.time } : {}) }
    case 'time':
      return { op: 'when', time: e.time }
    case 'when':
      return { op: 'when', date: e.when.date, ...(e.when.date ? { time: e.when.time } : {}) }
    case 'title':
      return { op: 'title', title: e.title }
    case 'delete':
      return { op: 'delete' }
    default:
      return null
  }
}

const noteTitle = (path: string) => path.replace(/^.*\//, '').replace(/\.md$/i, '')

/** 提交说明里怎么说这个动作 */
function say(req: EditReq, title: string): string {
  const e = req.edit
  switch (e.op) {
    case 'done':
      return e.done ? `勾掉「${title}」` : `「${title}」改回没做完`
    case 'cancel':
      return `「${title}」不做了`
    case 'minutes':
      return e.minutes ? `「${title}」估时 ${minutesText(e.minutes)}` : `「${title}」拿掉估时`
    case 'date':
      return e.date ? `「${title}」改到 ${e.date}${e.time ? ' ' + e.time : ''}` : `「${title}」拿掉日子`
    case 'time':
      return e.time ? `「${title}」改到 ${e.time}` : `「${title}」拿掉钟点`
    case 'remind':
      return e.remind ? `「${title}」${e.remind}提醒` : `「${title}」不提醒了`
    case 'repeat':
      return e.repeat ? `「${title}」${e.repeat}重复` : `「${title}」不重复了`
    case 'when':
      return e.when.date ? `「${title}」改到 ${e.when.date}${e.when.time ? ' ' + e.when.time : ''}` : `「${title}」拿掉日子`
    case 'prio':
      return `「${title}」改优先级`
    case 'title':
      return `「${title}」改名「${e.title}」`
    case 'addSub':
      return `「${title}」加一步「${e.title}」`
    case 'delete':
      return `删掉「${title}」`
    case 'move':
      return `「${title}」挪进《${noteTitle(e.to)}》`
  }
}

export async function applyEdit(v: TaskVault, req: EditReq, today: ISODate): Promise<EditResult> {
  const title = parseTaskLine(req.raw)?.title ?? req.raw
  if (req.edit.op === 'move' && req.edit.to === req.path) return { ok: false, reason: 'failed', message: '已经在这一篇里' }
  const ce = copyEdit(req.edit)
  // 只读的那几篇（不是 UTF-8、换行不规整）不跟着改，免得整次改动都改不成
  const copies = ce ? copiesOf(v.snapshot().tasks, req).filter((c) => !v.isReadOnly(c.path)) : []
  const paths = [...new Set([req.path, ...(req.edit.op === 'move' ? [req.edit.to] : []), ...copies.map((c) => c.path)])]
  const also = copies.length ? `（${copies.length + 1}处一起改）` : ''
  try {
    const r = await v.change(paths, '画布今日：' + say(req, title) + also, (now) => {
      const text = now.get(req.path)
      if (text == null) return null
      const n = locate(text, req.line, req.raw)
      if (n === null) return null
      const out = new Map<string, string | null>()
      const e = req.edit
      let line = n
      let next: { line: number; date: string } | undefined
      let movedTo: string | undefined
      let after: string
      switch (e.op) {
        case 'done': {
          if (e.done) {
            const c = completeTask(text, n, today, newId)
            after = c.text
            next = c.next
          } else after = editLine(text, n, (l) => setDone(l, false, today))
          break
        }
        case 'date':
          after = editLine(text, n, (l) => {
            let x = setDate(l, e.date)
            if (e.date && e.time !== undefined) x = setTime(x, e.time, today)
            return x
          })
          break
        case 'time':
          after = editLine(text, n, (l) => setTime(l, e.time, today))
          break
        case 'cancel':
          after = editLine(text, n, (l) => setCancelled(l, today))
          break
        case 'minutes':
          after = editLine(text, n, (l) => setDuration(l, e.minutes))
          break
        case 'remind':
          // 有提醒的那条给一个 🆔（提醒记录、以后的提醒事项镜像、canvas-today:// 链接都靠它认）
          after = editLine(text, n, (l) => {
            const x = setRemind(l, e.remind)
            return e.remind && !parseTaskLine(x)!.id ? setId(x, newId()) : x
          })
          break
        case 'repeat':
          after = editLine(text, n, (l) => setRepeat(l, e.repeat))
          break
        case 'when':
          // 选择器（task-pd289）：四样一起写，有提醒没 🆔 的给一个
          after = editLine(text, n, (l) => setWhen(l, e.when, newId))
          break
        case 'prio':
          after = editLine(text, n, (l) => setPrio(l, e.prio))
          break
        case 'title':
          if (!e.title.trim()) return null
          after = editLine(text, n, (l) => setTitle(l, e.title))
          break
        case 'addSub':
          if (!e.title.trim()) return null
          after = addSubtask(text, n, e.title).text
          break
        case 'delete':
          after = removeBlock(text, n).text
          break
        case 'move': {
          const dst = now.get(e.to) ?? null
          const m = moveBlock(text, n, dst ?? `# ${noteTitle(e.to)}\n\n`)
          after = m.from
          out.set(e.to, m.to)
          line = m.line
          movedTo = e.to
          break
        }
      }
      out.set(req.path, after)
      const where = movedTo ?? req.path
      const raw = e.op === 'delete' ? req.raw : (lineAt(out.get(where)!, line) ?? '')
      // 另外几份跟着改（同一篇里的也认得：按原文找，前面的行变了不要紧）
      let copied = 0
      for (const c of copies) {
        const cur = out.get(c.path) ?? now.get(c.path)
        if (cur == null) continue
        const k = locate(cur, c.line, c.raw)
        if (k === null) continue
        const changed = editCopy(cur, k, ce!, today)
        if (changed !== cur) copied++
        out.set(c.path, changed)
      }
      return { out, result: { line, raw, next, movedTo, copied } }
    })
    if (!r) return { ok: false, reason: 'gone' }
    return { ok: true, undo: r.undo ?? '', path: r.result.movedTo ?? req.path, line: r.result.line, raw: r.result.raw, ...(r.result.next && req.edit.op === 'done' ? { next: r.result.next } : {}), ...(r.result.movedTo ? { movedTo: r.result.movedTo } : {}), ...(r.result.copied ? { copies: r.result.copied } : {}) }
  } catch (err) {
    if (err instanceof ReadOnlyError) return { ok: false, reason: 'readonly', message: err.message }
    return { ok: false, reason: 'failed', message: String((err as Error).message ?? err) }
  }
}

/** 给这一条加一个 🆔（专注记录、canvas-today:// 链接认它）；已经有了原样。交回加好以后的那一行，找不到返回 null */
export async function ensureTaskId(v: TaskVault, t: { path: string; line: number; raw: string; title: string }): Promise<{ line: number; raw: string; id: string } | null> {
  const r = await v.change([t.path], `画布今日：给「${t.title}」加上 🆔（专注记录认它）`, (now) => {
    const text = now.get(t.path)
    if (text == null) return null
    const n = locate(text, t.line, t.raw)
    if (n === null) return null
    const cur = parseTaskLine(lineAt(text, n) ?? '')
    if (!cur) return null
    if (cur.id) return { out: new Map(), result: { line: n, raw: lineAt(text, n)!, id: cur.id } }
    const id = newId()
    const after = editLine(text, n, (l) => setId(l, id))
    return { out: new Map([[t.path, after]]), result: { line: n, raw: lineAt(after, n)!, id } }
  })
  return r?.result ?? null
}

/** AI 拆的几步一次加进这一条下面（缩进一格的「- [ ]」，一次改动、一个撤销） */
export async function addSubtasks(v: TaskVault, t: { path: string; line: number; raw: string; title: string }, titles: string[]): Promise<EditResult> {
  const clean = titles.map((x) => x.trim()).filter(Boolean)
  if (!clean.length) return { ok: false, reason: 'failed', message: '没有要加的' }
  try {
    const r = await v.change([t.path], `画布今日：「${t.title}」拆成${clean.length}步`, (now) => {
      const text = now.get(t.path)
      if (text == null) return null
      const n = locate(text, t.line, t.raw)
      if (n === null) return null
      let after = text
      for (const title of clean) after = addSubtask(after, n, title).text
      return { out: new Map([[t.path, after]]), result: { line: n, raw: lineAt(after, n) ?? t.raw } }
    })
    if (!r) return { ok: false, reason: 'gone' }
    return { ok: true, undo: r.undo ?? '', path: t.path, line: r.result.line, raw: r.result.raw }
  } catch (err) {
    if (err instanceof ReadOnlyError) return { ok: false, reason: 'readonly', message: err.message }
    return { ok: false, reason: 'failed', message: String((err as Error).message ?? err) }
  }
}

/** AI 排好的钟点一次写进那几行（📅 日子后面加钟点；几篇一起改，一个撤销）；交回写上了几条 */
export async function setTimes(v: TaskVault, items: { path: string; line: number; raw: string; title: string; time: string }[], today: ISODate): Promise<{ ok: true; undo: string; n: number } | { ok: false; reason: 'gone' | 'readonly' | 'failed'; message?: string }> {
  const paths = [...new Set(items.map((x) => x.path))]
  try {
    let n = 0
    const r = await v.change(paths, `画布今日：AI 把${items.length}条排进空着的时间`, (now) => {
      const out = new Map<string, string | null>()
      for (const p of paths) {
        let text = now.get(p)
        if (text == null) continue
        for (const x of items.filter((y) => y.path === p)) {
          const k = locate(text, x.line, x.raw)
          if (k === null) continue
          text = editLine(text, k, (l) => setTime(l, x.time, today))
          n++
        }
        out.set(p, text)
      }
      return n ? { out, result: n } : null
    })
    if (!r) return { ok: false, reason: 'gone' }
    return { ok: true, undo: r.undo ?? '', n: r.result }
  } catch (err) {
    if (err instanceof ReadOnlyError) return { ok: false, reason: 'readonly', message: err.message }
    return { ok: false, reason: 'failed', message: String((err as Error).message ?? err) }
  }
}

/**
 * AI 对话收下的那张改动单（task-ykkoz）：日子、钟点、优先级、拆小步一次写进几篇（一次改动、一次提交、一个撤销）。
 * 一篇里从下往上改（加子任务会把下面的行往下挤）；认不出的那一条跳过，交回写上了几条
 */
export async function applyPlan(v: TaskVault, changes: PlanChange[], title: string, today: ISODate): Promise<{ ok: true; undo: string; n: number } | { ok: false; reason: 'gone' | 'readonly' | 'failed'; message?: string }> {
  const paths = [...new Set(changes.map((x) => x.path))]
  try {
    let n = 0
    const r = await v.change(paths, `画布今日：AI 改了${changes.length}条（${title}）`, (now) => {
      const out = new Map<string, string | null>()
      for (const p of paths) {
        let text = now.get(p)
        if (text == null) continue
        const found = changes
          .filter((c) => c.path === p)
          .map((c) => ({ c, k: locate(text!, c.line, c.raw) }))
          .filter((x): x is { c: PlanChange; k: number } => x.k !== null)
          .sort((a, b) => b.k - a.k)
        for (const { c, k } of found) {
          text = editLine(text, k, (l) => {
            let x = l
            if (c.date !== undefined) x = setDate(x, c.date)
            if (c.time !== undefined) x = setTime(x, c.time, today)
            if (c.prio !== undefined) x = setPrio(x, c.prio)
            return x
          })
          for (const s of c.steps ?? []) text = addSubtask(text, k, s).text
          n++
        }
        out.set(p, text)
      }
      return n ? { out, result: n } : null
    })
    if (!r) return { ok: false, reason: 'gone' }
    return { ok: true, undo: r.undo ?? '', n: r.result }
  } catch (err) {
    if (err instanceof ReadOnlyError) return { ok: false, reason: 'readonly', message: err.message }
    return { ok: false, reason: 'failed', message: String((err as Error).message ?? err) }
  }
}

/** 一篇笔记叫这个名字（标题或最后一层文件夹）：#清单 用 */
/** 界面交来的 AI 认出来的那一份（task-pd289）：照 @cn/tasks 的写法再验一遍，不对的那项丢掉；没有标题、什么都不剩是 null */
function aiWhen(x: unknown, today: ISODate): When | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const s = (k: string) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string).trim() : null)
  const title = s('title')
  if (!title) return null
  const date = s('date') && isISODate(s('date')!) ? s('date') : null
  const time = s('time') ? normTime(s('time')!) : null
  const remind = s('remind') && parseRemind(s('remind')!) ? s('remind') : null
  const repeat = s('repeat') && parseRepeat(s('repeat')!) ? s('repeat') : null
  if (!date && !time && !remind && !repeat) return null
  return { title, date: date ?? (time ? today : null), time, remind, repeat, hits: [] }
}

/**
 * 快速加一条：认出日子钟点重复提醒优先级；#清单 对上哪篇就写进哪篇（shared/quick.ts notesFor：笔记名、文件夹名、模糊找），不然进 收件箱/待办.md（这一篇没有就建）；
 * when：AI 认出来的（task-pd289）；dest：全局小框里 ⌘↵ 自己换的那篇（索引里有待办的笔记，或收件箱；别的不认）
 */
export async function addTask(v: TaskVault, text: string, ctx: AddCtx, today: ISODate, snap: Snapshot, when?: unknown, now?: string, dest?: unknown): Promise<AddResult> {
  const q = parseQuick(text, now ?? today)
  const w = aiWhen(when, today)
  if (w) Object.assign(q, { title: w.title, date: w.date, time: w.time, remind: w.date ? w.remind : null, repeat: w.repeat })
  let title = q.title
  let path = typeof ctx === 'object' ? ctx.note : INBOX_NOTE
  const picked = typeof dest === 'string' && (dest === INBOX_NOTE || snap.notes.some((n) => n.path === dest)) ? dest : null
  if (picked) path = picked
  if (q.list) {
    const hit = picked ? null : (notesFor(snap.notes, q.list)[0]?.path ?? null)
    if (hit) path = hit
    // 对不上哪篇、自己换进了收件箱：#那几个字留在标题里，不丢
    else if (!picked || picked === INBOX_NOTE) title = `${title} #${q.list}`.trim()
  }
  if (!title) return { ok: false, reason: 'empty' }
  const date = q.date ?? (ctx === 'today' ? today : ctx === 'tomorrow' ? isoPlus(today, 1) : null)
  const line = newTaskLine({ title, date, time: q.time, remind: date ? q.remind : null, repeat: q.repeat, prio: q.prio })
  try {
    let created = false
    const r = await v.change([path], `画布今日：加了「${title}」`, (now) => {
      let cur = now.get(path) ?? null
      if (cur === null) {
        created = true
        cur = `# ${noteTitle(path)}\n\n`
      }
      const a = appendTask(cur, line)
      return { out: new Map([[path, a.text]]), result: a.line }
    })
    if (!r) return { ok: false, reason: 'failed' }
    return { ok: true, undo: r.undo ?? '', path, line: r.result, raw: line, title, date, time: q.time, created }
  } catch (err) {
    return { ok: false, reason: 'failed', message: String((err as Error).message ?? err) }
  }
}

/** 新清单：建一篇「收件箱/<名字>.md」（已经有同名的就用它） */
export async function newList(v: TaskVault, name: string): Promise<string | null> {
  const clean = name.replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim()
  if (!clean) return null
  const path = `收件箱/${clean}.md`
  await v.change([path], `画布今日：新清单「${clean}」`, (now) => (now.get(path) != null ? null : { out: new Map([[path, `# ${clean}\n\n`]]), result: true }))
  return path
}
