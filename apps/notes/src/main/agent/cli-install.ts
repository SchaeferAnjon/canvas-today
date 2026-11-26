/**
 * 各家命令行的「安装」「修复」（r172 A6，设置 › AI「各家命令行」那一行；右栏引导卡、上手卡装 Claude Code 也走这里）。
 * 照各家官方说明的装法，都装在用户目录、不用 sudo（2026-11-25 查的官方文档和安装脚本）：
 * - Claude Code：curl -fsSL https://claude.ai/install.sh | bash（code.claude.com/docs/en/setup「Native Install」，装到 ~/.local/bin/claude，以后自己更新）
 * - Codex：curl -fsSL https://chatgpt.com/codex/install.sh | sh（Codex CLI 文档的独立安装，装到 ~/.local/bin/codex）
 * - OpenCode：curl -fsSL https://opencode.ai/install | bash（1.x 那一线的安装脚本，装到 ~/.opencode/bin；2.x 换成了 opencode.ai/v2/install，
 *   我们核过的是 1.x，engine-health 的 VERIFIED）
 * - Gemini CLI：官方只有 npm 和 Homebrew（github.com/google-gemini/gemini-cli）：有 npm 用 npm install -g --prefix ~/.local @google/gemini-cli@latest
 *   （命令落在 ~/.local/bin/gemini，不碰要 sudo 的全局目录），没有 npm 有 Homebrew 用 brew install gemini-cli，都没有就说先装 Node.js
 * 修复 = 照它现在的装法再装一遍：Homebrew 装的 brew reinstall，npm 装的用同一个 npm 再装一遍最新的，别的跑官方安装脚本。
 * 测试实例（CN_E2E=1）不真装：给了 CN_CLI_INSTALL_RECORDER（测试写的小脚本）就跑它，参数是 家、install|repair、本来要跑的那条命令；
 * 没给时 Claude Code 照旧演几行（CN_CC_FAKE=ok|fail），别的家不装。
 */
import { spawn } from 'node:child_process'
import { accessSync, constants, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { t } from '../../shared/i18n'
import { E2E } from '../test-mode'
import { cliEnv, locateCli, NPM_PACKAGE, searchDirs } from '@cn/ai-engines'
import type { CliId } from '@cn/ai-engines/shared'

export type InstallMode = 'install' | 'repair'
export type InstallPlan = { cmd: string; args: string[]; text: string } | { none: string }

/** 官方安装脚本（原样写给人看的那一行） */
export const INSTALL_SCRIPT: Record<Exclude<CliId, 'gemini'>, string> = {
  claude: 'curl -fsSL https://claude.ai/install.sh | bash',
  codex: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
  opencode: 'curl -fsSL https://opencode.ai/install | bash',
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function executable(p: string): boolean {
  try {
    accessSync(p, constants.X_OK)
    return true
  } catch {
    return false
  }
}

const real = (p: string) => {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

/** 在找命令行的那些目录里找一个工具（npm、brew）；端到端测试（CN_CLI_HOME_ONLY=1）同找命令行一样只看临时家目录 */
function tool(name: string): string | null {
  const home = process.env.HOME || homedir()
  const only = process.env.CN_CLI_HOME_ONLY === '1'
  for (const d of only ? searchDirs(process.env, undefined, true).filter((x) => x.startsWith(home + '/')) : [...searchDirs(), '/opt/homebrew/bin', '/usr/local/bin']) if (executable(join(d, name))) return join(d, name)
  return null
}

const sh = (line: string) => ({ cmd: '/bin/bash', args: ['-c', line], text: line })

/**
 * 这一家怎么装。found：这台 Mac 上找到的那个命令（运行不了也算找到），修复时照它的装法重装
 */
export function installPlan(id: CliId, found?: string | null): InstallPlan {
  const where = found ? real(found) : ''
  // Homebrew 装的：同一个 formula / cask 重装
  const cask = /\/Caskroom\/([^/]+)\//.exec(where)?.[1]
  const formula = /\/Cellar\/([^/]+)\//.exec(where)?.[1]
  if (cask || formula) {
    const brew = tool('brew') ?? 'brew'
    const args = cask ? ['reinstall', '--cask', cask] : ['reinstall', formula!]
    return { cmd: brew, args, text: `brew ${args.join(' ')}` }
  }
  // npm 全局装的：用同一个前缀里的 npm 再装一遍最新的
  const prefix = /^(.*)\/lib\/node_modules\//.exec(where)?.[1]
  if (prefix) {
    const npm = executable(join(prefix, 'bin', 'npm')) ? join(prefix, 'bin', 'npm') : (tool('npm') ?? 'npm')
    const args = ['install', '-g', '--prefix', prefix, `${NPM_PACKAGE[id]}@latest`]
    return { cmd: npm, args, text: `npm install -g ${NPM_PACKAGE[id]}@latest` }
  }
  if (id !== 'gemini') return sh(INSTALL_SCRIPT[id])
  const npm = tool('npm')
  if (npm) {
    const local = join(homedir(), '.local')
    return { cmd: npm, args: ['install', '-g', '--prefix', local, '@google/gemini-cli@latest'], text: 'npm install -g --prefix ~/.local @google/gemini-cli@latest' }
  }
  const brew = tool('brew')
  if (brew) return { cmd: brew, args: ['install', 'gemini-cli'], text: 'brew install gemini-cli' }
  return { none: t('Gemini CLI要先有Node.js：到 nodejs.org 装好Node.js，再点「安装」') }
}

/** 装没装上：一句人话（给界面）+ 输出的最后几十行（「看详情」） */
export class InstallFailed extends Error {
  constructor(
    message: string,
    readonly log: string[],
  ) {
    super(message)
  }
}

/** 输出认成一句人话 */
function humanWhy(lines: string[], code: number | null, text: string): string {
  const all = lines.join('\n')
  if (/Could not resolve host|curl: \((6|7|28|35|56)\)|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|getaddrinfo/i.test(all)) return t('连不上下载的地方，看看网络再试一次')
  if (/EACCES|Permission denied|Operation not permitted/i.test(all)) return t('没有权限写进安装的文件夹')
  if (/No space left/i.test(all)) return t('磁盘满了，装不下')
  return t('{cmd} 没跑成（退出码 {code}）', { cmd: text, code: code ?? '—' })
}

/** 测试实例没给记录器时 Claude Code 演几行（上手卡的老测试用，CN_CC_FAKE=fail 演装不上） */
async function fakeClaude(onLine: (line: string) => void): Promise<void> {
  const fail = process.env.CN_CC_FAKE === 'fail'
  const lines = ['Downloading Claude Code 2.1.330 for darwin-arm64…', 'Verifying checksum…', ...(fail ? ['curl: (6) Could not resolve host: claude.ai'] : ['Installed to ~/.local/bin/claude', '✓ claude 2.1.330'])]
  for (const l of lines) {
    onLine(l)
    await sleep(120)
  }
  if (fail) throw new InstallFailed(t('没装上：{line}', { line: 'curl: (6) Could not resolve host: claude.ai' }), lines)
}

/** 同一家同一时间只装一个 */
const running = new Map<CliId, Promise<void>>()

/** 装、修：每一行输出交给 onLine；装好返回，没装上抛 InstallFailed */
export function installCli(id: CliId, mode: InstallMode, onLine: (line: string) => void): Promise<void> {
  const busy = running.get(id)
  if (busy) return busy
  const p = run(id, mode, onLine).finally(() => running.delete(id))
  running.set(id, p)
  return p
}

async function run(id: CliId, mode: InstallMode, onLine: (line: string) => void): Promise<void> {
  const plan = installPlan(id, locateCli(id)?.path)
  if ('none' in plan) throw new InstallFailed(plan.none, [])
  let use = plan
  if (E2E) {
    const rec = process.env.CN_CLI_INSTALL_RECORDER
    if (rec) use = { cmd: rec, args: [id, mode, plan.text], text: plan.text }
    else if (id === 'claude') return fakeClaude(onLine)
    else throw new InstallFailed(t('测试里不装'), [])
  }
  onLine(`$ ${plan.text}`)
  await new Promise<void>((resolve, reject) => {
    const log: string[] = [`$ ${plan.text}`]
    const child = spawn(use.cmd, use.args, { cwd: homedir(), env: cliEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
    let buf = ''
    const take = (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      const lines = buf.split(/\r?\n|\r/)
      buf = lines.pop() ?? ''
      for (const raw of lines) {
        // 去掉终端颜色、进度条的控制字
        const line = raw.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim()
        if (!line) continue
        log.push(line)
        if (log.length > 60) log.shift()
        onLine(line)
      }
    }
    child.stdout!.on('data', take)
    child.stderr!.on('data', take)
    // 下载要几十秒；10 分钟还没完就当卡住了
    const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60_000)
    child.on('error', (e) => {
      clearTimeout(timer)
      log.push(e.message)
      reject(new InstallFailed(t('{cmd} 跑不起来：{error}', { cmd: plan.text, error: e.message }), log))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new InstallFailed(humanWhy(log, code, plan.text), log))
    })
  })
}
