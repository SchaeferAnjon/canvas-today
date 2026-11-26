/**
 * 上手卡里「装 Claude Code」那一条（task-587os，设计页第 3 节）：照官方的原生安装命令跑（不用 Node），输出一行行给界面看；
 * 登录跑 `claude auth login --claudeai`（用 Claude 会员订阅登，不是 API Key），在 Anthropic 自己的页面登（条款不准第三方收集
 * Claude 账号凭据，软件里不放登录框），跑完再问 `claude auth status --json` 登没登好（claude 2.1.332 的 --help 核过这两个子命令）。
 * 授权页由我们用系统浏览器打开（shell.openExternal，测试模式里是记录器）：claude 认 BROWSER，给它一个只把网址记进文件的小脚本，
 * 我们读到网址再打开；它自己在 localhost 上等浏览器回调，登好就退出。
 * 测试实例（CN_E2E=1）不真装：CN_CC_FAKE=ok|fail 演装好、装不上（默认装好）；假引擎（CN_AI_FAKE=1、不真找命令）时登录直接算登好，
 * 用假命令行（e2e 临时家目录里的 fake-cli）时照真的跑。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { shell } from 'electron'
import { t } from '../../shared/i18n'
import { E2E } from '../test-mode'
import { cliEnv, findCli, runProc } from '@cn/ai-engines'
import { installCli, type InstallMode } from './cli-install'

/** 装、修 Claude Code：照官方原生安装命令（cli-install.ts），每一行输出交给 onLine；没装上抛一句 */
export function installClaudeCode(onLine: (line: string) => void, mode: InstallMode = 'install'): Promise<void> {
  return installCli('claude', mode, onLine)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 假引擎、不真找命令（CN_AI_FAKE=1 且没有 CN_REAL_FIND=1）：登录、登没登好都不跑命令行 */
const PRETEND = () => E2E && process.env.CN_AI_FAKE === '1' && process.env.CN_REAL_FIND !== '1'

/** 正在跑的 `claude auth login`（同一时间只跑一个；再点一次登录等同一个） */
let login: { child: ChildProcess; done: Promise<boolean> } | null = null

/**
 * 登录：起 `claude auth login --claudeai`，它要开的授权页交给系统浏览器，等用户在浏览器里登好（最多 10 分钟）；
 * 登好返回 true，取消、超时、没登好返回 false，起不来抛一句
 */
export async function loginClaudeCode(): Promise<boolean> {
  if (PRETEND()) {
    await sleep(200)
    return true
  }
  if (login) return login.done
  const exe = findCli('claude')
  if (!exe) throw new Error(t('还没找到claude：先装好再登录'))
  const dir = mkdtempSync(join(tmpdir(), 'cn-cc-login-'))
  const urlFile = join(dir, 'url')
  const browser = join(dir, 'open-url')
  writeFileSync(browser, `#!/bin/sh\nprintf '%s\\n' "$1" >> '${urlFile}'\n`)
  chmodSync(browser, 0o755)
  const child = spawn(exe, ['auth', 'login', '--claudeai'], { cwd: homedir(), env: cliEnv({ BROWSER: browser }), stdio: ['ignore', 'pipe', 'pipe'] })
  // 输出不用看（登没登好问 auth status），读走免得管道塞满
  child.stdout!.resume()
  child.stderr!.resume()
  // 网址一写进文件就用系统浏览器打开（只开 https 的）
  let opened = false
  const poll = setInterval(() => {
    if (opened) return
    let url = ''
    try {
      url = readFileSync(urlFile, 'utf8').trim().split('\n')[0] ?? ''
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      return
    }
    if (!/^https:\/\//.test(url)) return
    opened = true
    void shell.openExternal(url)
  }, 150)
  const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60_000)
  const done = new Promise<boolean>((resolve, reject) => {
    const end = () => {
      clearInterval(poll)
      clearTimeout(timer)
      rmSync(dir, { recursive: true, force: true })
      login = null
    }
    child.on('error', (e) => {
      end()
      reject(new Error(t('{name} 启动不了：{error}', { name: exe, error: e.message })))
    })
    child.on('close', (code) => {
      end()
      if (code !== 0) return resolve(false)
      void claudeLoggedIn().then(resolve, reject)
    })
  })
  login = { child, done }
  return done
}

/** 「取消」：停下正在等浏览器的登录 */
export function cancelClaudeLogin(): void {
  login?.child.kill('SIGTERM')
}

/** `claude auth status --json` 说登好了没有（没登录时它退出码 1、loggedIn false） */
export async function claudeLoggedIn(): Promise<boolean> {
  if (PRETEND()) return true
  const exe = findCli('claude')
  if (!exe) return false
  const r = await runProc(exe, ['auth', 'status', '--json'], { timeoutMs: 15_000 })
  try {
    const o = JSON.parse(r.stdout) as { loggedIn?: unknown }
    return o.loggedIn === true
  } catch {
    return r.code === 0
  }
}
