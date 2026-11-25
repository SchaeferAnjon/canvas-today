/**
 * 退出要快（退出卡顿，照画布笔记，共用 packages/quit-fast）：
 * - 机器忙时 Chromium 收尾在 IO 线程上等网络进程自己退，最多等 10 秒，常常等满：0.8 秒后它还在就杀掉；
 * - 反弹跟踪数据库（DIPS）不开：它在后台优先级的线程上写盘，盘忙时写不完，退出一直等；
 * - 主进程的 JS 走完 2 秒还没退（后台线程上别的活卡住），盯着的 sh 结束它。
 */
import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { cpus } from 'node:os'
import { join } from 'node:path'
import { launch } from './app'

/** 造负载：cpu 数 × 2 个忙循环子进程，跑 ms 毫秒自己停（像几条测试线一起跑的时候） */
function busy(ms: number): ChildProcess[] {
  const code = `const end = Date.now() + ${ms}; while (Date.now() < end) Math.sqrt(Math.random())`
  return Array.from({ length: cpus().length * 2 }, () => spawn(process.execPath, ['-e', code], { stdio: 'ignore' }))
}

test('机器忙（几十个进程抢 CPU）时退出：进程 5 秒内没了（以前常常拖满 10 秒等网络进程）；反弹跟踪数据库不开', async () => {
  const run = await launch()
  const loads: ChildProcess[] = []
  try {
    expect(await run.app.evaluate(({ app }) => app.commandLine.getSwitchValue('disable-features'))).toContain('DIPS')
    loads.push(...busy(10_000))
    await new Promise((r) => setTimeout(r, 1_000))
    const proc = run.app.process()
    const t = Date.now()
    await run.app.close()
    const ms = Date.now() - t
    expect(proc.exitCode !== null || proc.signalCode !== null).toBe(true)
    const sh = join(run.userData, 'quit-sh.log')
    console.log(`负载下退出 ${ms} ms；盯网络进程的 sh：${existsSync(sh) ? readFileSync(sh, 'utf8').trim().replace(/\n/g, ' → ') : '没记'}`)
    expect(ms).toBeLessThan(5_000)
    for (const f of ['DIPS', 'DIPS-wal']) expect(existsSync(join(run.userData, f)), f).toBe(false)
  } finally {
    for (const p of loads) p.kill()
    rmSync(run.root, { recursive: true, force: true, maxRetries: 5 })
  }
})
