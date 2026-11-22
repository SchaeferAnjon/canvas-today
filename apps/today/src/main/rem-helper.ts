/**
 * 和提醒事项小助手（native/reminders，Swift 写的命令行程序）说话：开起来一直开着，一行一个 JSON（规矩见小助手的 Server.swift）。
 * 小助手在哪：发布包里在 Canvas Today.app/Contents/MacOS/canvas-today-reminders；开发时是 native/reminders 编出来的；CT_REMINDERS_HELPER 指定。
 * 测试模式（CT_E2E=1）一律带 --memory <CT_REMINDERS_MEMORY>：提醒事项是那个文件里的假的；没给这个文件就当没有小助手，绝不开真的。
 * 小助手退出了（崩了、被杀了）：等着的请求都报错，下一次请求再开起来。
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'

export class HelperError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** 小助手的路径和参数；没有能用的就是 null。测试模式（e2e）没给假提醒事项的文件就是 null：绝不开真的 */
export function helperCommand(env: NodeJS.ProcessEnv, o: { e2e: boolean; packaged: boolean; execPath: string; here: string }): { bin: string; args: string[] } | null {
  const { packaged, execPath, here } = o
  const memory = env.CT_REMINDERS_MEMORY
  if (o.e2e && !memory) return null
  const dev = ['apple/Products/Release', 'release', 'debug'].map((p) => join(here, '../../native/reminders/.build', p, 'canvas-today-reminders'))
  const candidates = env.CT_REMINDERS_HELPER ? [env.CT_REMINDERS_HELPER] : packaged ? [join(dirname(execPath), 'canvas-today-reminders')] : dev
  const bin = candidates.find((p) => existsSync(p))
  if (!bin) return null
  return { bin, args: memory ? ['--memory', memory] : [] }
}

interface Waiting {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

export class RemHelper extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null
  private seq = 0
  private waiting = new Map<number, Waiting>()

  constructor(private cmd: { bin: string; args: string[] } | null) {
    super()
  }

  get available(): boolean {
    return this.cmd !== null
  }

  /** --memory 的假提醒事项（测试用的命令只有它认） */
  get memory(): boolean {
    return !!this.cmd?.args.includes('--memory')
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child
    if (!this.cmd) throw new HelperError('unavailable', '没有提醒事项小助手')
    const c = spawn(this.cmd.bin, this.cmd.args, { stdio: ['pipe', 'pipe', 'pipe'] })
    this.child = c
    createInterface({ input: c.stdout }).on('line', (l) => this.onLine(l))
    c.stderr.on('data', (d) => console.error('[提醒事项小助手]', String(d).trim()))
    // 小助手先退出时写 stdin 会 EPIPE：报给等着的请求，不让主进程崩
    c.stdin.on('error', (e) => this.gone(c, e.message))
    c.on('error', (e) => this.gone(c, e.message))
    c.on('exit', (code, sig) => this.gone(c, `退出了（${code ?? sig}）`))
    return c
  }

  private gone(c: ChildProcessWithoutNullStreams, why: string) {
    if (this.child !== c) return
    this.child = null
    for (const w of this.waiting.values()) {
      clearTimeout(w.timer)
      w.reject(new HelperError('exited', `提醒事项小助手${why}`))
    }
    this.waiting.clear()
  }

  private onLine(line: string) {
    let m: { id?: number; ok?: boolean; result?: unknown; code?: string; error?: string; event?: string }
    try {
      m = JSON.parse(line)
    } catch {
      console.error('[提醒事项小助手] 看不懂的一行：', line)
      return
    }
    if (m.event === 'changed') {
      this.emit('changed')
      return
    }
    const w = typeof m.id === 'number' ? this.waiting.get(m.id) : undefined
    if (!w) return
    this.waiting.delete(m.id!)
    clearTimeout(w.timer)
    if (m.ok) w.resolve(m.result)
    else w.reject(new HelperError(m.code ?? 'failed', m.error ?? '小助手没说为什么'))
  }

  /** 发一个请求等回答；timeout 毫秒（系统问权限的那一下要等人点，给得长） */
  request<T>(cmd: string, params: Record<string, unknown> = {}, timeout = 30_000): Promise<T> {
    let c: ChildProcessWithoutNullStreams
    try {
      c = this.start()
    } catch (e) {
      return Promise.reject(e)
    }
    const id = ++this.seq
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id)
        reject(new HelperError('timeout', `提醒事项小助手 ${Math.round(timeout / 1000)} 秒没回`))
      }, timeout)
      this.waiting.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      c.stdin.write(JSON.stringify({ ...params, id, cmd }) + '\n')
    })
  }

  stop() {
    const c = this.child
    this.child = null
    if (!c) return
    for (const w of this.waiting.values()) {
      clearTimeout(w.timer)
      w.reject(new HelperError('exited', '提醒事项小助手关了'))
    }
    this.waiting.clear()
    c.stdin.end()
    setTimeout(() => c.exitCode === null && c.kill(), 1000)
  }
}
