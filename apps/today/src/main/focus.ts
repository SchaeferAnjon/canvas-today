/**
 * 番茄钟（v2 原型「专注」）：25 分钟，挂在一条任务上；专注满了往库里记一行（@cn/tasks focus.ts：.canvas-tasks/专注/<设备名>/YYYY-MM.csv，
 * 每台设备只写自己那份），那一条没有 🆔 的先给它加一个（记录认 🆔，行号变了也认得出），弹一个通知。中途放弃的不记。
 * 计时在主进程：关了主窗口照样走、到点照样记；钟用 clock.ts 的 now()（测试拨钟就是快进）。
 * 读的时候把所有设备的记录合起来：今天专注了几分钟、每条任务专注过几个番茄（详情里的「🍅 2」）。
 */
import { readdir, readFile } from 'node:fs/promises'
import { appendFocus, FOCUS_MINUTES, type FocusRecord, focusOn, focusPath, parseFocus } from '@cn/tasks'
import type { FocusInfo, FocusTask } from '../shared/api'
import { isoOf, localStamp } from '../shared/when'
import type { TaskVault } from './vault'

export interface FocusDeps {
  vault: () => TaskVault | null
  device: string
  now: () => number
  /** 这一条现在在库里的样子（行号、原文可能变了）；没有了返回 null */
  find: (t: FocusTask) => FocusTask | null
  /** 给这一条加一个 🆔，交回加好的那一条 */
  ensureId: (t: FocusTask) => Promise<FocusTask | null>
  /** 专注满了：弹通知、说一句 */
  done: (r: FocusRecord, file: string) => void
  /** 状态变了：告诉界面 */
  emit: (info: FocusInfo) => void
}

const LEN = FOCUS_MINUTES * 60_000

export class FocusTimer {
  private task: FocusTask | null = null
  private running = false
  /** 还剩几毫秒（停着的时候） */
  private left = LEN
  /** 什么时候到点（走着的时候，软件的钟） */
  private endsAt: number | null = null
  /** 这一个番茄第一次按「开始」的时刻 */
  private startedAt: number | null = null
  private timer: NodeJS.Timeout | null = null
  private records: FocusRecord[] = []
  private finishing = false

  constructor(private d: FocusDeps) {}

  info(): FocusInfo {
    const now = this.d.now()
    const today = isoOf(now)
    const counts: Record<string, number> = {}
    for (const r of this.records) if (r.id) counts[r.id] = (counts[r.id] ?? 0) + 1
    return {
      task: this.task,
      running: this.running,
      left: Math.max(0, this.running && this.endsAt ? this.endsAt - now : this.left),
      endsAt: this.running ? this.endsAt : null,
      total: LEN,
      today: focusOn(this.records, today),
      counts,
      file: focusPath(this.d.device, today.slice(0, 7)),
    }
  }

  private emit() {
    this.d.emit(this.info())
  }

  /** 换一条（走着的时候也能换：记录记在换过去的那一条上） */
  setTask(t: FocusTask | null) {
    this.task = t
    this.emit()
  }

  /** 开始或接着走（暂停过的从停下的地方接着）；给了另一条就换成它、从 25 分钟重新开始，给的是同一条就接着 */
  start(t?: FocusTask | null) {
    const now = this.d.now()
    if (t !== undefined && t?.key !== this.task?.key) {
      this.task = t
      this.left = LEN
    } else if (this.running) return this.emit()
    if (this.left <= 0 || this.left > LEN) this.left = LEN
    if (this.left === LEN) this.startedAt = now
    this.running = true
    this.endsAt = now + this.left
    this.schedule()
    this.emit()
  }

  pause() {
    if (!this.running) return
    this.left = Math.max(0, (this.endsAt ?? 0) - this.d.now())
    this.running = false
    this.endsAt = null
    this.clear()
    this.emit()
  }

  /** 放弃：不记，回到 25 分钟 */
  stop() {
    this.running = false
    this.endsAt = null
    this.left = LEN
    this.startedAt = null
    this.clear()
    this.emit()
  }

  /** 钟拨过了、睡醒了：看看是不是到点了 */
  check() {
    if (this.running) this.schedule()
  }

  private clear() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private schedule() {
    this.clear()
    if (!this.running || this.endsAt === null) return
    const wait = this.endsAt - this.d.now()
    if (wait <= 0) return void this.finish()
    // 最多等一分钟再看一眼（钟可能被拨过、电脑睡过）
    this.timer = setTimeout(() => this.schedule(), Math.min(wait + 20, 60_000))
  }

  /** 专注满了：先停钟，再记一行（那一条没有 🆔 的先加一个） */
  private async finish() {
    if (this.finishing) return
    this.finishing = true
    const end = this.d.now()
    const begin = this.startedAt ?? end - LEN
    const task = this.task
    this.running = false
    this.endsAt = null
    this.left = LEN
    this.startedAt = null
    this.clear()
    try {
      let cur = task ? this.d.find(task) : null
      if (cur && !cur.id) cur = (await this.d.ensureId(cur)) ?? cur
      if (cur) this.task = cur
      const r: FocusRecord = { start: localStamp(begin).slice(0, 16), end: localStamp(end).slice(0, 16), minutes: FOCUS_MINUTES, id: cur?.id ?? task?.id ?? null, title: cur?.title ?? task?.title ?? '', path: cur?.path ?? task?.path ?? '' }
      const file = focusPath(this.d.device, r.start.slice(0, 7))
      const v = this.d.vault()
      if (v) await v.change([file], `画布今日：专注 ${FOCUS_MINUTES} 分钟${r.title ? `「${r.title}」` : ''}`, (now) => ({ out: new Map([[file, appendFocus(now.get(file) ?? null, r)]]), result: true }))
      this.records.push(r)
      this.d.done(r, file)
    } finally {
      this.finishing = false
      this.emit()
    }
  }

  /** 读所有设备这几个月的记录（这个月、上个月够算「今天」；🍅 数要全部，文件不多，全读） */
  async load() {
    const v = this.d.vault()
    const all: FocusRecord[] = []
    if (v) {
      const base = v.abs('.canvas-tasks/专注')
      let devices: string[] = []
      try {
        devices = (await readdir(base, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      }
      for (const dev of devices) {
        const files = (await readdir(v.abs(`.canvas-tasks/专注/${dev}`))).filter((f) => /^\d{4}-\d{2}\.csv$/.test(f))
        for (const f of files) all.push(...parseFocus(await readFile(v.abs(`.canvas-tasks/专注/${dev}/${f}`), 'utf8')))
      }
    }
    this.records = all
    this.emit()
  }
}
