// 退出要快（packages/quit-fast，大库提速、退出卡顿）：
// - 盯网络进程的小 sh：到点主进程还在，就杀这个软件的网络进程（Chromium 重起的、成了孤儿的也杀）；别的设置目录的、主进程还在时不是网络进程的不碰；
//   主进程没了以后它的孤儿扫 5 轮就走；
// - 盯主进程收尾的小 sh：主进程的 JS 走完、过一会儿还卡在 Chromium 收尾里，就结束它；自己退了就什么都不做。
// 量的是 sh 记下的步骤（醒了、杀了谁、扫完孤儿 / 盯满了），不量墙上的钟：机器忙时 pgrep、ps 一轮就要零点几秒到几秒，同一份脚本 1 到 30 秒都有
// （负载 960 时第一条盯满 4 秒的 sh 跑了 30 秒）。超时只用来抓卡死的，给得宽
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { disableSlowFeatures, flushSessions, killMainLater, killNetworkLater, NET_MARK } from '../src/index'

const MARK = '--utility-sub-type=network.mojom.NetworkService'
// 设置目录里带空格和正则里有意思的字（真的设置目录在 Application Support 里）
const dir = mkdtempSync(join(tmpdir(), 'cn-quit fast (ud)+'))
const UD = join(dir, 'user data')
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** 像 Chromium 收尾时的网络进程：一直闲着不退，命令行和真的一样带子类型和设置目录（这个测试进程的子进程） */
const fakeNet = (args: string[] = ['--type=utility', MARK, `--user-data-dir=${UD}`, '--shared-files']) =>
  spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)', '--', ...args], { stdio: 'ignore' })
/** 成了孤儿的进程（父进程是 1，默认像网络进程）：中间隔一层马上退的 sh；回它的 pid */
const orphanNet = (args: string[] = ['--type=utility', MARK, `--user-data-dir=${UD}`]) => {
  const out = join(dir, `pid-${Math.random()}`)
  const sh = spawn('/bin/sh', ['-c', `"${process.execPath}" -e 'setTimeout(() => {}, 30000)' -- ${args.map((a) => `'${a}'`).join(' ')} & echo $! > '${out}'`], { stdio: 'ignore' })
  return new Promise<number>((r) => sh.once('exit', () => r(Number(readFileSync(out, 'utf8').trim()))))
}
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const exited = (p: ChildProcess) => new Promise<string | null>((r) => (p.exitCode !== null || p.signalCode !== null ? r(p.signalCode) : p.once('exit', (_c, sig) => r(sig))))
const gone = (p: ChildProcess) => new Promise<void>((r) => (p.exitCode !== null || p.signalCode !== null ? r() : p.once('exit', () => r())))
const until = async (f: () => boolean, ms = 60_000) => {
  const end = Date.now() + ms
  while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 50))
  return f()
}
/** sh 记下的一行一行（去掉前面的秒） */
const said = (log: string) => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => l.replace(/^\d+ /, '')) : [])
const logFile = () => join(dir, `sh-${Math.random()}.log`)

it('到点主进程还在：这个软件的网络进程 SIGKILL，Chromium 又起一个也杀；GPU 进程、别的设置目录的网络进程不碰', async () => {
  const net = fakeNet()
  const gpu = fakeNet(['--type=gpu-process', `--user-data-dir=${UD}`])
  const otherApp = fakeNet([MARK, `--user-data-dir=${UD}-另一个`])
  const t = Date.now()
  const sh = killNetworkLater(process.pid, UD, 200, 4_000)
  expect(await exited(net)).toBe('SIGKILL')
  expect(Date.now() - t).toBeGreaterThanOrEqual(190)
  // sh 不会把自己认成网络进程，接着盯
  await new Promise((r) => setTimeout(r, 600))
  expect(sh.exitCode).toBe(null)
  const again = fakeNet()
  expect(await exited(again)).toBe('SIGKILL')
  for (const p of [gpu, otherApp]) expect(p.exitCode === null && p.signalCode === null).toBe(true)
  gpu.kill()
  otherApp.kill()
  // 主进程（这个测试进程）一直在：sh 会盯满 4 秒那么多轮，看完了就收掉它
  sh.kill()
  await gone(sh)
}, 120_000)

it('主进程走了、留下的孤儿网络进程（父进程是 1）也杀：主进程在的时候、走了以后 1 秒内冒出来的都算', async () => {
  // 主进程：活 1.5 秒
  const main = spawn('/bin/sleep', ['1.5'])
  const first = await orphanNet()
  const sh = killNetworkLater(main.pid!, UD, 200, 8_000)
  expect(await until(() => !alive(first))).toBe(true)
  await gone(main)
  const late = await orphanNet()
  expect(await until(() => !alive(late))).toBe(true)
  await gone(sh)
}, 120_000)

it('主进程已经没了：留下的这个软件的孤儿（网页进程也算）扫 5 轮就走，不盯满；别的设置目录的孤儿、主进程名下还在的不碰', async () => {
  const dead = spawn('/usr/bin/true')
  await gone(dead)
  const orphan = await orphanNet(['--type=renderer', `--user-data-dir=${UD}`])
  const stranger = await orphanNet(['--type=renderer', `--user-data-dir=${UD}-另一个`])
  const mine = fakeNet(['--type=renderer', `--user-data-dir=${UD}`])
  const log = logFile()
  // 一共能盯 3 秒（14 轮）：扫完 5 轮就走的话记「扫完孤儿」，一直盯到头记「盯满了」
  const sh = killNetworkLater(dead.pid!, UD, 100, 3_000, NET_MARK, log)
  expect(await until(() => !alive(orphan))).toBe(true)
  await gone(sh)
  expect(said(log)).toEqual(['醒了', `杀孤儿 ${orphan}`, '主进程没了', '扫完孤儿'])
  expect(alive(stranger)).toBe(true)
  expect(mine.exitCode === null && mine.signalCode === null).toBe(true)
  process.kill(stranger, 'SIGTERM')
  mine.kill()
}, 120_000)

it('给了记录文件（测试模式）：醒了、杀了哪个网络进程、主进程什么时候没的，一行一样记下来', async () => {
  const main = spawn('/bin/sleep', ['0.8'])
  const net = await orphanNet()
  const log = logFile()
  const sh = killNetworkLater(main.pid!, UD, 100, 6_000, NET_MARK, log)
  expect(await until(() => !alive(net))).toBe(true)
  await gone(sh)
  const lines = said(log)
  expect(lines[0]).toBe('醒了')
  expect(lines).toContain(`杀网络进程 ${net}`)
  expect(lines.slice(-2)).toEqual(['主进程没了', '扫完孤儿'])
}, 120_000)

it('进程号、设置目录不对就报错，不起 sh', () => {
  expect(() => killNetworkLater(1, UD)).toThrow('进程号不对')
  expect(() => killNetworkLater(Number.NaN, UD)).toThrow('进程号不对')
  expect(() => killNetworkLater(process.pid, 'user data')).toThrow('设置目录不对')
  expect(() => killMainLater(1)).toThrow('进程号不对')
})

/** 演主进程：一个 node 进程在自己的 exit 之后（这里直接）叫 killMainLater 盯自己，然后 stuck 为真就一直不退（卡在收尾里），否则马上退 */
const fakeMain = (stuck: boolean, log: string) =>
  spawn(
    process.execPath,
    ['-e', `import(${JSON.stringify(join(import.meta.dirname, '../src/index.ts'))}).then((m) => { m.killMainLater(process.pid, 300, ${JSON.stringify(log)}); ${stuck ? 'setInterval(() => {}, 1000)' : 'process.exit(0)'} })`],
    { stdio: 'ignore' },
  )

it('主进程的 JS 走完以后卡在收尾里：过一会儿盯着的 sh 把它 SIGKILL，记「收尾卡住，结束主进程」', async () => {
  const log = logFile()
  const main = fakeMain(true, log)
  expect(await exited(main)).toBe('SIGKILL')
  expect(await until(() => said(log).length > 0)).toBe(true)
  expect(said(log)).toEqual([`收尾卡住，结束主进程 ${main.pid}`])
}, 120_000)

it('主进程自己退了：盯着的 sh 的父进程成了 1，到点什么都不做（进程号就算给了别人也不碰）', async () => {
  const log = logFile()
  const main = fakeMain(false, log)
  expect(await exited(main)).toBe(null)
  expect(main.exitCode).toBe(0)
  // sh 睡 0.3 秒醒来看一眼就走；等它走（它是 main 的孩子，测试这边看不到它，等到它肯定醒过之后）
  await new Promise((r) => setTimeout(r, 1500))
  expect(said(log)).toEqual([])
}, 120_000)

it('反弹跟踪数据库（DIPS）并进 --disable-features：已经关掉的别的功能照留、不重复', () => {
  const sw = new Map<string, string>()
  const cmd = { getSwitchValue: (n: string) => sw.get(n) ?? '', appendSwitch: (n: string, v = '') => void sw.set(n, v) }
  expect(disableSlowFeatures(cmd)).toBe('DIPS')
  sw.set('disable-features', 'AudioServiceOutOfProcess')
  expect(disableSlowFeatures(cmd)).toBe('AudioServiceOutOfProcess,DIPS')
  expect(disableSlowFeatures(cmd)).toBe('AudioServiceOutOfProcess,DIPS')
  expect(sw.get('disable-features')).toBe('AudioServiceOutOfProcess,DIPS')
})

it('退出前写盘：每个会话的网页存储和 cookie 都写；cookie 卡住不等过 ms', async () => {
  const did: string[] = []
  const ses = (name: string, cookie: Promise<void>) => ({ flushStorageData: () => void did.push(`${name} 存储`), cookies: { flushStore: () => (did.push(`${name} cookie`), cookie) } })
  expect(await flushSessions([ses('默认', Promise.resolve()), ses('网页', Promise.resolve())])).toBe('写完')
  expect(did).toEqual(['默认 存储', '网页 存储', '默认 cookie', '网页 cookie'])
  expect(await flushSessions([ses('卡住', new Promise(() => {}))], 50)).toBe('超时')
})
