/**
 * 库和索引：和画布笔记同一个库（一个文件夹，里面是 md），扫出所有「- [ ]」建一份索引（只在内存里，每次打开从库里重建）。
 * 外面改了（画布笔记里改、Git 拉下来）：监听整个库，那一篇停手 120ms 后重读，几百毫秒内界面就是新的。
 * 改文件一律走 change()：每篇排队、改之前重读一遍盘上的、先写临时文件再改名；写完马上更新索引，记一份撤销。
 * 不是合法 UTF-8 的、有单独 \r 的文件只读，不改（改了会把文件写坏）。
 */
import { type FSWatcher, watch } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { merge3 } from '@cn/format'
import { type FileTask, type Habit, isHabitPath, keyOf, parseHabit, type RingBy, sameTasks, scanTasks } from '@cn/tasks'
import type { HabitView, NoteView, Snapshot, TaskView } from '../shared/api'

const SKIP_DIRS = new Set(['.git', 'node_modules', '.trash', '.obsidian'])

interface FileEntry {
  path: string
  mtimeMs: number
  text: string
  readOnly: boolean
  tasks: FileTask[]
  /** 习惯/ 下面的一篇（每个习惯一篇，@cn/tasks habit.ts）才有 */
  habit: Habit | null
}

export interface Change {
  path: string
  /** null：文件原来没有 / 改完没有了 */
  before: string | null
  after: string | null
}

/** 字节 → 文字：BOM 和 \r\n 原样留在字里（写回去一个字节不差）；不是 UTF-8、有单独 \r 的只读 */
export function decode(bytes: Uint8Array): { text: string; readOnly: boolean } {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    const cr = (text.match(/\r/g) ?? []).length
    const crlf = (text.match(/\r\n/g) ?? []).length
    return { text, readOnly: cr !== crlf }
  } catch {
    return { text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes), readOnly: true }
  }
}

export class TaskVault {
  readonly root: string
  readonly name: string
  private files = new Map<string, FileEntry>()
  private version = 0
  private watcher: FSWatcher | null = null
  private timers = new Map<string, NodeJS.Timeout>()
  private queues = new Map<string, Promise<unknown>>()
  private undos = new Map<string, { changes: Change[]; message: string }>()
  private undoSeq = 0
  private tmpSeq = 0
  /** 索引变了（界面要刷新） */
  onChange: () => void = () => {}
  /** 提醒记录变了（别的设备的、Git 拉下来的） */
  onLogs: () => void = () => {}
  /** 专注记录变了（别的设备的、Git 拉下来的、自己刚记的） */
  onFocusLogs: () => void = () => {}
  /** 软件自己改了文件（交给提交的） */
  onWrote: (paths: string[], message: string) => void = () => {}
  /** 谁来响：镜像进系统提醒事项了的（main/mirror.ts 记着）由提醒事项响，本机不排通知 */
  ringByOf: (id: string | null) => RingBy = () => 'app'

  constructor(root: string) {
    this.root = resolve(root)
    this.name = basename(this.root)
  }

  /** 相对路径 → 绝对路径；不许跑出库外 */
  abs(rel: string): string {
    if (typeof rel !== 'string' || rel === '' || rel.includes('\0')) throw new Error(`路径不对：${rel}`)
    const p = resolve(this.root, rel)
    if (p !== this.root && !p.startsWith(this.root + sep)) throw new Error(`路径在库外：${rel}`)
    return p
  }

  rel(abs: string): string {
    return relative(this.root, abs).split(sep).join('/')
  }

  async scan(): Promise<void> {
    const paths: string[] = []
    const walk = async (dir: string) => {
      const subs: Promise<void>[] = []
      for (const ent of await readdir(dir, { withFileTypes: true })) {
        if (ent.isDirectory()) {
          if (!ent.name.startsWith('.') && !SKIP_DIRS.has(ent.name)) subs.push(walk(join(dir, ent.name)))
        } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) paths.push(this.rel(join(dir, ent.name)))
      }
      await Promise.all(subs)
    }
    await walk(this.root)
    const seen = new Set(paths)
    for (const p of [...this.files.keys()]) if (!seen.has(p)) this.files.delete(p)
    // 一次最多开 64 个文件
    for (let i = 0; i < paths.length; i += 64) await Promise.all(paths.slice(i, i + 64).map((p) => this.load(p)))
    this.version++
  }

  /** 读一篇进索引；返回有没有变 */
  private async load(path: string): Promise<boolean> {
    let st
    let bytes
    try {
      st = await stat(this.abs(path))
      bytes = await readFile(this.abs(path))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      return this.files.delete(path)
    }
    const { text, readOnly } = decode(bytes)
    const old = this.files.get(path)
    if (old && old.text === text && old.readOnly === readOnly) {
      old.mtimeMs = st.mtimeMs
      return false
    }
    this.files.set(path, { path, mtimeMs: st.mtimeMs, text, readOnly, tasks: scanTasks(text), habit: isHabitPath(path) ? parseHabit(path, text) : null })
    return true
  }

  snapshot(): Snapshot {
    const tasks: TaskView[] = []
    const notes: NoteView[] = []
    const habits: HabitView[] = []
    for (const f of [...this.files.values()].sort((a, b) => a.path.localeCompare(b.path))) {
      if (f.habit) habits.push({ ...f.habit, readOnly: f.readOnly })
      if (!f.tasks.length) continue
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
      notes.push({ path: f.path, title: f.path.replace(/^.*\//, '').replace(/\.md$/i, ''), folder: dir.split('/').filter(Boolean).join(' › '), mtimeMs: f.mtimeMs })
      const key = (line: number) => `${f.path}#${line}`
      for (const t of f.tasks) {
        tasks.push({
          key: key(t.line),
          id: t.task.id,
          rkey: t.task.id ?? keyOf(f.path, t.task.title, t.task.date),
          path: f.path,
          line: t.line,
          raw: t.raw,
          title: t.task.title,
          done: t.task.done,
          cancelled: t.task.cancelled,
          doing: t.task.doing,
          dupOf: null,
          dups: [],
          date: t.task.date,
          time: t.task.time,
          remind: t.task.remind,
          repeat: t.task.repeat,
          prio: t.task.prio,
          doneDate: t.task.doneDate,
          parent: t.parent === null ? null : key(t.parent),
          subs: t.children.map(key),
          depth: t.depth,
          heading: t.heading?.text ?? null,
          headingLevel: t.heading?.level ?? 0,
          headingLine: t.heading?.line ?? null,
          // 谁来响：镜像进系统提醒事项的标成 reminders，我们自己就不排通知
          ringBy: this.ringByOf(t.task.id),
        })
      }
    }
    habits.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    // 抄了好几遍的同一条：只显示一份（文件不动）
    const blocks = new Map<string, string | null>()
    for (const f of this.files.values()) for (const t of f.tasks) blocks.set(`${f.path}#${t.line}`, t.task.block)
    const groups = sameTasks(tasks.map((t) => ({ key: t.key, path: t.path, line: t.line, title: t.title, date: t.date, block: blocks.get(t.key) ?? null, done: t.done, cancelled: t.cancelled })))
    for (const t of tasks) {
      const g = groups.get(t.key)
      if (!g) continue
      if (g.rep === t.key) t.dups = g.all.filter((k) => k !== t.key)
      else t.dupOf = g.rep
    }
    return { version: this.version, tasks, notes, habits }
  }

  /** 盘上这一篇现在的字（不在返回 null） */
  async current(path: string): Promise<{ text: string; readOnly: boolean } | null> {
    try {
      return decode(await readFile(this.abs(path)))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  }

  isReadOnly(path: string): boolean {
    return this.files.get(path)?.readOnly ?? false
  }

  /** 这一篇最后改的时候（毫秒）：和提醒事项两边都改了时比先后 */
  mtime(path: string): number {
    return this.files.get(path)?.mtimeMs ?? 0
  }

  /**
   * 改几篇：paths 排队（每篇一个队），f 拿到这几篇盘上现在的字，交回改完的（不改的那篇交回原样；null 是删掉 / 本来没有）。
   * 写完马上更新索引、记撤销、交给提交；返回撤销的编号（什么都没改是 null）
   */
  async change<R>(paths: string[], message: string, f: (now: Map<string, string | null>) => { out: Map<string, string | null>; result: R } | null): Promise<{ undo: string | null; result: R } | null> {
    const run = async () => {
      const now = new Map<string, string | null>()
      for (const p of paths) {
        const c = await this.current(p)
        if (c?.readOnly) throw new ReadOnlyError(p)
        now.set(p, c ? c.text : null)
      }
      const r = f(now)
      if (!r) return null
      const changes: Change[] = []
      for (const p of paths) {
        const before = now.get(p) ?? null
        const after = r.out.has(p) ? r.out.get(p)! : before
        if (after !== before) changes.push({ path: p, before, after })
      }
      for (const c of changes) await this.writeRaw(c.path, c.after)
      if (!changes.length) return { undo: null, result: r.result }
      const id = `u${++this.undoSeq}`
      this.undos.set(id, { changes, message })
      if (this.undos.size > 100) this.undos.delete(this.undos.keys().next().value!)
      this.onWrote(
        changes.map((c) => c.path),
        message,
      )
      return { undo: id, result: r.result }
    }
    // 几篇一起改时排在每一篇的队尾（按名字排好，不会互相等死）
    const keys = [...new Set(paths)].sort()
    const prev = Promise.all(keys.map((k) => this.queues.get(k) ?? Promise.resolve()))
    const next = prev.then(run, run)
    for (const k of keys) this.queues.set(k, next)
    next.then(
      () => keys.forEach((k) => this.queues.get(k) === next && this.queues.delete(k)),
      () => keys.forEach((k) => this.queues.get(k) === next && this.queues.delete(k)),
    )
    return next
  }

  /** 写一篇（null 是删掉）：先写临时文件再改名；写完更新索引 */
  private async writeRaw(path: string, text: string | null) {
    const p = this.abs(path)
    if (text === null) {
      await rm(p, { force: true })
      this.files.delete(path)
    } else {
      await mkdir(dirname(p), { recursive: true })
      const tmp = `${p}.${process.pid}.${++this.tmpSeq}.tmp`
      await writeFile(tmp, text)
      await rename(tmp, p)
      if (path.toLowerCase().endsWith('.md')) {
        const st = await stat(p)
        this.files.set(path, { path, mtimeMs: st.mtimeMs, text, readOnly: false, tasks: scanTasks(text), habit: isHabitPath(path) ? parseHabit(path, text) : null })
      }
    }
    this.version++
    this.onChange()
  }

  /** 撤销一次改动：盘上还是改完的样子就换回去；后来又改过的照三方合并退回这一处，合不了不撤 */
  async undo(id: string): Promise<'ok' | 'changed' | 'gone'> {
    const u = this.undos.get(id)
    if (!u) return 'gone'
    const paths = u.changes.map((c) => c.path)
    const r = await this.change(paths, `撤销：${u.message}`, (now) => {
      const out = new Map<string, string | null>()
      for (const c of u.changes) {
        const cur = now.get(c.path) ?? null
        if (cur === c.after) out.set(c.path, c.before)
        else if (cur === null || c.after === null || c.before === null) return null
        else {
          const m = merge3(c.after, cur, c.before)
          if (m.conflict) return null
          out.set(c.path, m.text)
        }
      }
      return { out, result: true }
    })
    if (!r) return 'changed'
    this.undos.delete(id)
    return 'ok'
  }

  watch(): void {
    this.watcher = watch(this.root, { recursive: true }, (_ev, filename) => {
      if (!filename) return
      const rel = filename.split(sep).join('/')
      const parts = rel.split('/')
      // 提醒记录（别的设备写的、Git 拉下来的）：重新排提醒
      if (rel.startsWith('.canvas-tasks/专注/') && rel.endsWith('.csv')) {
        clearTimeout(this.timers.get(rel))
        this.timers.set(
          rel,
          setTimeout(() => (this.timers.delete(rel), this.onFocusLogs()), 200),
        )
        return
      }
      if (rel.startsWith('.canvas-tasks/') && rel.endsWith('.jsonl')) {
        clearTimeout(this.timers.get(rel))
        this.timers.set(
          rel,
          setTimeout(() => (this.timers.delete(rel), this.onLogs()), 200),
        )
        return
      }
      if (parts.some((x) => x.startsWith('.') || SKIP_DIRS.has(x)) || !rel.toLowerCase().endsWith('.md')) return
      clearTimeout(this.timers.get(rel))
      this.timers.set(
        rel,
        setTimeout(() => {
          this.timers.delete(rel)
          void this.reload(rel)
        }, 120),
      )
    })
  }

  private async reload(rel: string) {
    // 正在写这一篇（排着队）：写完再读，读到的是写完的
    await this.queues.get(rel)?.catch(() => {})
    if (await this.load(rel).catch(() => false)) {
      this.version++
      this.onChange()
    }
  }

  close(): void {
    this.watcher?.close()
    this.watcher = null
    for (const t of this.timers.values()) clearTimeout(t)
  }
}

export class ReadOnlyError extends Error {
  constructor(readonly path: string) {
    super(`《${path}》不是 UTF-8 或换行不规整，只读不改`)
  }
}
