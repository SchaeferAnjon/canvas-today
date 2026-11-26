/**
 * 出错日志（task-pyb39「突然白屏」）：界面里的报错、没接住的异常、界面进程没了、卡住、页面没载进来，都记进
 * ~/Library/Logs/Canvas Notes/main.log，白屏了也有据可查（以前主进程不记界面的报错，只能让用户开开发者工具）。
 *
 * - 只写错误和堆栈：不写笔记内容、网页内容（右栏网页那几个 webContents 不接，只接主窗口）；每条最长 4000 字。
 * - 换文件：跨天或超过 2MB 时 main.log → main.1.log → … → main.6.log，连当天的一共留 7 份。
 * - 刷屏时（渲染里一个错一秒报几百次）每分钟最多记 300 条，多的记一行「省略了 N 条」。
 * 不碰 Electron，能单独测；接 Electron 的在 setupCrashLog。
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { REPORT_KINDS, type RendererReport } from '../shared/crash'

export const LOG_FILE = 'main.log'
const MAX_TEXT = 4000

export interface RollingLogOptions {
  /** 连 main.log 一共留几份 */
  keep?: number
  maxBytes?: number
  /** 每分钟最多记几条 */
  perMinute?: number
  now?: () => Date
}

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const stamp = (d: Date) => `${day(d)} ${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`

export class RollingLog {
  private keep: number
  private maxBytes: number
  private perMinute: number
  private now: () => Date
  private minute = -1
  private count = 0
  private dropped = 0

  constructor(
    readonly dir: string,
    o: RollingLogOptions = {},
  ) {
    this.keep = o.keep ?? 7
    this.maxBytes = o.maxBytes ?? 2 * 1024 * 1024
    this.perMinute = o.perMinute ?? 300
    this.now = o.now ?? (() => new Date())
  }

  get file() {
    return join(this.dir, LOG_FILE)
  }

  /** what：哪一类（renderer-error、render-process-gone…）；text：错误和堆栈 */
  write(what: string, text: string) {
    const now = this.now()
    const m = Math.floor(now.getTime() / 60000)
    if (m !== this.minute) {
      const dropped = this.dropped
      this.minute = m
      this.count = 0
      this.dropped = 0
      if (dropped) this.append(now, 'log', `上一分钟太多了，省略了 ${dropped} 条`)
    }
    if (this.count >= this.perMinute) {
      this.dropped++
      return
    }
    this.count++
    this.append(now, what, text)
  }

  private append(now: Date, what: string, text: string) {
    mkdirSync(this.dir, { recursive: true })
    this.roll(now)
    const body = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…（截掉 ${text.length - MAX_TEXT} 字）` : text
    // 多行的堆栈缩进两格，一眼看出哪几行是同一条
    appendFileSync(this.file, `[${stamp(now)}] [${what}] ${body.replace(/\n/g, '\n  ')}\n`)
  }

  /** 跨天、太大：往后挪一格，最老的那份删掉 */
  private roll(now: Date) {
    if (!existsSync(this.file)) return
    const st = statSync(this.file)
    if (day(st.mtime) === day(now) && st.size < this.maxBytes) return
    const old = join(this.dir, `main.${this.keep - 1}.log`)
    if (existsSync(old)) rmSync(old)
    for (let i = this.keep - 2; i >= 1; i--) {
      const f = join(this.dir, `main.${i}.log`)
      if (existsSync(f)) renameSync(f, join(this.dir, `main.${i + 1}.log`))
    }
    renameSync(this.file, join(this.dir, 'main.1.log'))
  }
}

/** 主进程这边恢复本机记录时丢掉坏数据也记一行；日志建好前（单独测的时候）不记 */
let shared: RollingLog | null = null
export function shareLog(log: RollingLog) {
  shared = log
}
export function logDropped(area: string, why: string) {
  shared?.write('restore', `[${area}] 恢复时丢掉了坏数据：${why}`)
}
/** 别的模块记一行（手机 AI 每次来问按哪种答，用户说「手机上只读」时有据可查） */
export function logLine(what: string, text: string) {
  shared?.write(what, text)
}

const str = (v: unknown, max = MAX_TEXT) => (typeof v === 'string' ? v.slice(0, max) : '')

export function formatReport(r: unknown): { what: string; text: string } | null {
  if (!r || typeof r !== 'object') return null
  const o = r as Record<string, unknown>
  // 界面报上来的一条（ErrorBoundary 接住的、window.onerror、unhandledrejection、恢复时丢掉的坏数据）：只留类型、哪一块、错误、堆栈
  const kind = REPORT_KINDS.includes(o.kind as RendererReport['kind']) ? (o.kind as RendererReport['kind']) : null
  if (!kind) return null
  const area = str(o.area, 80)
  const lines = [`${area ? `[${area}] ` : ''}${str(o.message) || '（没有说明）'}`]
  const stack = str(o.stack)
  if (stack) lines.push(stack)
  const cs = str(o.componentStack)
  if (cs) lines.push(`组件：${cs.trim()}`)
  return { what: `renderer-${kind}`, text: lines.join('\n') }
}
