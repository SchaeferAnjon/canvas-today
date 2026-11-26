/**
 * 手机全能模式（iPhone / iPad 经 Mac 用全能模式的 AI）：哪几步要先在手机上点头。纯函数，不碰 Electron。
 *
 * 要点头的（2026-11-24 用户定的那几样）：删文件、推送 / 同步到远端、发消息 / 邮件、提交表单、上传、付款、登录、跑会改库外东西的命令。
 * 库里的改动（写、改、新建、挪）不问：这一轮结束提交一次，手机上能一键撤回。
 *
 * 命令是照字面认的（Claude Code 的 Bash 那一步给的整行命令）：按 ; && || | 换行切成几段，每段认程序名和参数。
 * 认不全（脚本里干了什么看不见），所以「改库外东西」按看得见的认：写到库外的路径（重定向、tee、cp、mv、mkdir、sed -i、-o），
 * 程序参数或脚本里写着库外的路径、cd 到库外以后再动手，以及本来就改系统的那几样（sudo、brew、defaults write、launchctl、kill……）。
 * 临时文件夹（/tmp、/private/tmp、/var/folders、/dev/null）不算库外。
 */
import { homedir } from 'node:os'
import { isAbsolute, normalize, resolve } from 'node:path'
import { isCli } from '@cn/ai-engines/shared'
import { isLocalAddress } from './protocol'

/**
 * 手机来的这一问按哪种答：AI 对话里问才有全能模式（讲解、翻译、/ 命令照旧只读），手机没切就跟 Mac 右栏的全能模式开关；
 * 要全能模式还得：对方在局域网或本机地址、这台设备在 Mac 设置里没关、Mac 开着库、AI 对话用的是本机的命令行
 * （Claude Code、Codex、Gemini、OpenCode：2026-11-25 起四家的每一步都拦得住，见 agent/step-gate.ts；一把 Key、本机模型不行）。
 * 不够的答成只读，why 写为什么（手机上显示）
 */
export function askMode(o: { kind: string; mode?: 'full' | 'read'; omni: boolean; addr: string | undefined; deviceKind: string; noFull?: boolean; vault: boolean; engine: string; engineLabel: string }): { mode: 'full' | 'read'; why?: string; no?: FullNo } {
  const want = o.kind === 'chat' && (o.mode ?? (o.omni ? 'full' : 'read')) === 'full'
  if (!want) return { mode: 'read' }
  const no = fullNo(o)
  return no ? { mode: 'read', why: noWhy(no, o.deviceKind, o.engineLabel), no } : { mode: 'full' }
}

/**
 * 这台设备现在要全能模式会被挡在哪一道（没挡是 null）：lan 不在局域网或本机地址、device 这台在 Mac 设置里关了、vault Mac 上没开库、
 * engine AI 对话选的不是本机命令行。「在吗」也报这一样（手机头上照它说为什么只读），和真问时 askMode 同一个判断
 */
export type FullNo = 'lan' | 'device' | 'vault' | 'engine'
export function fullNo(o: { addr: string | undefined; noFull?: boolean; vault: boolean; engine: string }): FullNo | null {
  return !isLocalAddress(o.addr) ? 'lan' : o.noFull ? 'device' : !o.vault ? 'vault' : !isCli(o.engine) ? 'engine' : null
}

/** 挡住时回答上面那一句（旧的手机只认这句话，新的手机照 no 自己写） */
export function noWhy(no: FullNo, deviceKind: string, engineLabel: string): string {
  if (no === 'lan') return '全能模式只在同一个 Wi‑Fi 或这台 Mac 上用，这次只读'
  if (no === 'device') return `这台${deviceKind}在 Mac 的设置 › AI 里关了全能模式，这次只读`
  if (no === 'vault') return 'Mac 上没开库，这次只读'
  return `全能模式要用这台 Mac 上的命令行（Claude Code、Codex、Gemini、OpenCode；Mac 的 AI 对话选的是 ${engineLabel}），这次只读`
}

export type DangerKind = 'delete' | 'push' | 'send' | 'submit' | 'login' | 'pay' | 'upload' | 'outside'

/** 两颗按钮里「可以」那颗的字（和 Mac 右栏「可以，提交」「可以，上传」同一个说法） */
export const YES: Record<DangerKind, string> = {
  delete: '可以，删除',
  push: '可以，推送',
  send: '可以，发送',
  submit: '可以，提交',
  login: '可以，登录',
  pay: '可以，付款',
  upload: '可以，上传',
  outside: '可以，运行',
}

export interface Danger {
  kind: DangerKind
  /** 步骤行「等你点头：…」冒号后面那一段 */
  label: string
}

const TEMP = ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders', '/dev/null', '/dev/stdout', '/dev/stderr']

/** 这个路径在不在库外（库里、临时文件夹里都不算）；cwd 是这一段命令跑在哪 */
export function outsideVault(p: string, root: string, cwd = root): boolean {
  const raw = p.trim().replace(/^["']|["']$/g, '')
  if (!raw || raw === '-') return false
  const expanded = raw.replace(/^~(?=\/|$)/, homedir()).replace(/^\$HOME(?=\/|$)/, homedir()).replace(/^\$\{HOME\}(?=\/|$)/, homedir())
  if (/^\$(TMPDIR|\{TMPDIR\})/.test(expanded)) return false
  const abs = normalize(isAbsolute(expanded) ? expanded : resolve(cwd, expanded))
  if (TEMP.some((t) => abs === t || abs.startsWith(t + '/'))) return false
  const roots = [root, root.replace(/^\/private(?=\/)/, ''), root.startsWith('/var/') ? '/private' + root : root]
  return !roots.some((r) => abs === r || abs.startsWith(r + '/'))
}

/** 一行命令粗切成词（认单双引号，不认变量展开）；控制符号（; && || | > >> < 换行）单独成词 */
function words(cmd: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  let has = false
  const push = () => {
    if (has) out.push(cur)
    cur = ''
    has = false
  }
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]!
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && i + 1 < cmd.length) cur += cmd[++i]
      else cur += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      has = true
      continue
    }
    if (c === '\\' && i + 1 < cmd.length) {
      cur += cmd[++i]
      has = true
      continue
    }
    if (c === ' ' || c === '\t') {
      push()
      continue
    }
    const two = cmd.slice(i, i + 2)
    if (two === '&&' || two === '||' || two === '>>' || two === '&>') {
      push()
      out.push(two)
      i++
      continue
    }
    if (c === ';' || c === '|' || c === '\n' || c === '>' || c === '<' || c === '(' || c === ')' || c === '&') {
      push()
      out.push(c === '\n' || c === '(' || c === ')' || c === '&' ? ';' : c)
      continue
    }
    cur += c
    has = true
  }
  push()
  return out
}

const SEP = new Set([';', '&&', '||', '|'])
/** 只读、不改东西的程序：参数里写着库外的路径也不问 */
const READERS = new Set(['cat', 'ls', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'wc', 'file', 'stat', 'du', 'df', 'which', 'whereis', 'type', 'echo', 'printf', 'pwd', 'date', 'cal', 'awk', 'sort', 'uniq', 'cut', 'tr', 'jq', 'yq', 'diff', 'cmp', 'md5', 'shasum', 'sha256sum', 'basename', 'dirname', 'realpath', 'readlink', 'mdls', 'mdfind', 'test', '[', 'true', 'false', 'env', 'printenv', 'uname', 'whoami', 'id', 'hostname', 'sw_vers', 'tree', 'column', 'nl', 'fold', 'fmt', 'xxd', 'hexdump', 'strings', 'otool', 'plutil', 'sqlite3', 'pdftotext', 'pdfinfo', 'textutil', 'ps', 'top', 'lsof', 'man', 'help', 'sleep', 'seq', 'expr', 'bc'])
const DELETERS = new Set(['rm', 'rmdir', 'unlink', 'trash', 'shred', 'srm'])
/** 本来就改这台 Mac 的系统、别的软件的 */
const SYSTEM = new Set(['sudo', 'su', 'doas', 'launchctl', 'kill', 'killall', 'pkill', 'crontab', 'brew', 'port', 'softwareupdate', 'shutdown', 'reboot', 'halt', 'diskutil', 'networksetup', 'pmset', 'systemsetup', 'scutil', 'csrutil', 'spctl', 'tccutil', 'dscl', 'chflags', 'mount', 'umount', 'hdiutil', 'open', 'say', 'afplay', 'shortcuts', 'automator', 'security', 'pbcopy'])
const MAILERS = new Set(['mail', 'mailx', 'sendmail', 'mutt', 'msmtp', 'neomutt'])
const PUSHERS = new Set(['rsync', 'scp', 'sftp', 'ftp', 'rclone'])
const INTERPRETERS = new Set(['python', 'python3', 'node', 'ruby', 'perl', 'bash', 'sh', 'zsh', 'fish', 'swift', 'deno', 'bun', 'php', 'lua', 'Rscript', 'julia', 'osascript', 'npx', 'pnpm', 'npm', 'yarn', 'uv', 'pipx', 'make', 'go', 'cargo'])
/** 在库里动手的（cp、mv……）：目标在库外才问 */
const WRITERS = new Set(['cp', 'mv', 'ln', 'install', 'mkdir', 'touch', 'chmod', 'chown', 'chgrp', 'truncate', 'tee', 'ditto', 'unzip', 'tar', 'zip', 'git', 'sed', 'perl', 'curl', 'wget', 'dd', 'patch', 'xattr', 'setfile'])

/** 一段命令（不带分隔符）的程序名和参数；前面的 VAR=1、env、command、nohup、time、xargs 跳过 */
function program(seg: string[]): { prog: string; args: string[]; sudo: boolean } {
  let i = 0
  let sudo = false
  while (i < seg.length) {
    const w = seg[i]!
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) i++
    else if (['env', 'command', 'nohup', 'time', 'nice', 'caffeinate', 'exec', 'builtin', 'xargs'].includes(w)) {
      i++
      while (i < seg.length && seg[i]!.startsWith('-')) i++
    } else if (w === 'sudo' || w === 'doas') {
      sudo = true
      i++
      while (i < seg.length && seg[i]!.startsWith('-')) i++
    } else break
  }
  const prog = (seg[i] ?? '').split('/').pop() ?? ''
  return { prog, args: seg.slice(i + 1), sudo }
}

const cut = (s: string, n = 48) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n) + '…' : one
}

/** 一行命令要不要先问：要问的话是哪一种（同一行里有好几样时按删、推送、发送、上传、库外的顺序取第一样） */
export function commandDanger(cmd: string, root: string): DangerKind | null {
  const all = words(cmd)
  const found = new Set<DangerKind>()
  let cwd = root
  // 一段一段看：重定向的目标、程序和参数
  let seg: string[] = []
  const segs: { words: string[]; redirects: string[] }[] = []
  let redirects: string[] = []
  for (let i = 0; i < all.length; i++) {
    const w = all[i]!
    if (SEP.has(w)) {
      segs.push({ words: seg, redirects })
      seg = []
      redirects = []
    } else if (w === '>' || w === '>>' || w === '&>') {
      const target = all[i + 1]
      if (target && !SEP.has(target)) redirects.push(target.replace(/^&?\d*$/, ''))
      i++
    } else if (w === '<') i++
    else seg.push(w)
  }
  segs.push({ words: seg, redirects })
  for (const s of segs) {
    if (!s.words.length) {
      if (s.redirects.some((r) => r && outsideVault(r, root, cwd))) found.add('outside')
      continue
    }
    const { prog, args, sudo } = program(s.words)
    const sub = args.find((a) => !a.startsWith('-')) ?? ''
    const out = (p: string) => outsideVault(p, root, cwd)
    if (sudo) found.add('outside')
    if (s.redirects.some((r) => r && out(r))) found.add('outside')
    if (prog === 'cd') {
      cwd = resolve(cwd, (args[0] ?? homedir()).replace(/^~(?=\/|$)/, homedir()))
      continue
    }
    const away = outsideVault(cwd, root, cwd)
    if (DELETERS.has(prog)) found.add('delete')
    else if (prog === 'git') {
      const g = args.filter((a, k) => !(args[k - 1] === '-C' || a === '-C' || a.startsWith('-c')))
      const verb = g.find((a) => !a.startsWith('-')) ?? ''
      if (verb === 'push') found.add('push')
      else if (verb === 'rm' || verb === 'clean') found.add('delete')
      else if (verb === 'config' && args.some((a) => a === '--global' || a === '--system')) found.add('outside')
      else if (args.includes('-C') && out(args[args.indexOf('-C') + 1] ?? '') && !['status', 'log', 'diff', 'show', 'ls-files', 'rev-parse', 'branch', 'blame'].includes(verb)) found.add('outside')
    } else if (prog === 'find') {
      if (args.includes('-delete') || args.some((a, k) => (a === '-exec' || a === '-execdir' || a === '-ok') && DELETERS.has((args[k + 1] ?? '').split('/').pop() ?? ''))) found.add('delete')
    } else if (PUSHERS.has(prog)) found.add('push')
    else if (MAILERS.has(prog)) found.add('send')
    else if (prog === 'gh' || prog === 'glab') {
      if (args.some((a) => /^(create|comment|edit|merge|close|delete|upload|review|reopen|ready|transfer|archive|sync|push)$/.test(a)) || (sub === 'api' && args.some((a) => /^-X$|^--method$/.test(a) || /^-[fF]$/.test(a)))) found.add('push')
    } else if (prog === 'npm' && sub === 'publish') found.add('push')
    else if (prog === 'curl' || prog === 'wget' || prog === 'http' || prog === 'https') {
      const posts = args.some((a, k) => /^(-d|--data.*|-F|--form.*|-T|--upload-file(=.*)?|--json(=.*)?|--post-data(=.*)?|--post-file(=.*)?)$/.test(a) || /^-d./.test(a) || ((a === '-X' || a === '--request' || a === '--method') && /^(POST|PUT|PATCH|DELETE)$/i.test(args[k + 1] ?? '')) || /^-X(POST|PUT|PATCH|DELETE)$/i.test(a))
      if (posts) found.add('upload')
      const o = args.findIndex((a) => a === '-o' || a === '--output' || a === '-O' || a === '--output-document')
      if (o >= 0 && args[o + 1] && (prog !== 'curl' || args[o] !== '-O') && out(args[o + 1]!)) found.add('outside')
    } else if (prog === 'osascript' && /\b(Mail|Messages|send|iMessage|WeChat|Slack)\b/.test(args.join(' '))) found.add('send')
    else if (prog === 'open' && args.some((a) => /^(mailto|sms|imessage|facetime|tel):/i.test(a))) found.add('send')
    else if (SYSTEM.has(prog)) found.add('outside')
    else if (prog === 'defaults' && /^(write|delete|import|rename)$/.test(sub)) found.add('outside')
    else if (['pip', 'pip3', 'gem', 'cargo', 'go', 'pipx', 'npm', 'pnpm', 'yarn', 'bun'].includes(prog) && /^(install|i|add|uninstall|remove|update|upgrade)$/.test(sub) && (prog === 'pip' || prog === 'pip3' || prog === 'gem' || prog === 'pipx' || prog === 'cargo' || prog === 'go' || args.some((a) => a === '-g' || a === '--global'))) found.add('outside')
    if (READERS.has(prog) || found.has('delete')) continue
    // 写到哪：cp/mv/ln/install 的最后一个参数，mkdir/touch/chmod/tee 的每个参数，sed -i 的文件，tar -C、unzip -d、dd of=
    const paths = args.filter((a) => !a.startsWith('-'))
    let targets: string[] = []
    if (['cp', 'mv', 'ln', 'install', 'ditto'].includes(prog)) targets = paths.slice(-1)
    else if (['mkdir', 'touch', 'chmod', 'chown', 'chgrp', 'truncate', 'tee', 'xattr', 'setfile', 'patch'].includes(prog)) targets = paths
    else if (prog === 'sed' && args.some((a) => /^-i/.test(a))) targets = paths.slice(1)
    else if (prog === 'perl' && args.some((a) => /^-[a-z]*i/.test(a))) targets = paths.slice(1)
    else if (prog === 'tar' || prog === 'unzip') {
      const k = args.findIndex((a) => a === '-C' || a === '-d')
      if (k >= 0 && args[k + 1]) targets = [args[k + 1]!]
    } else if (prog === 'dd') targets = args.filter((a) => a.startsWith('of=')).map((a) => a.slice(3))
    if (targets.some(out)) found.add('outside')
    // cd 到库外以后再动手：写的、跑脚本的都算库外
    if (away && (WRITERS.has(prog) || INTERPRETERS.has(prog))) found.add('outside')
    // 跑脚本：参数（脚本路径、-c 里那一段）里写着库外的路径
    if (INTERPRETERS.has(prog)) {
      const text = args.join(' ')
      const named = [...text.matchAll(/(?:^|[\s"'=(,])((?:~|\$HOME|\/)[^\s"'(),;]*)/g)].map((m) => m[1]!)
      if (named.some((p) => p !== '/' && out(p)) || /expanduser|Path\.home\(\)|os\.homedir\(\)|process\.env\.HOME|ENV\[.HOME.\]/.test(text)) found.add('outside')
    }
  }
  for (const k of ['delete', 'push', 'send', 'upload', 'outside'] as const) if (found.has(k)) return k
  return null
}

/**
 * 命令行自己的一步（Claude Code 的叫法：Bash、Write、Edit……）要不要先问；label 是步骤行「等你点头：」后面那一段。
 * 写到库外的文件（Write、Edit 给的路径不在库里）算「改库外东西」
 */
export function stepDanger(tool: string, input: Record<string, unknown>, root: string): Danger | null {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  if (tool === 'Bash') {
    const cmd = s('command')
    const kind = commandDanger(cmd, root)
    if (!kind) return null
    const verb = { delete: '删', push: '推送', send: '发', upload: '上传', outside: '跑' }[kind as 'delete' | 'push' | 'send' | 'upload' | 'outside']
    return { kind, label: `${verb}：${cut(cmd)}` }
  }
  const file = s('file_path') || s('notebook_path')
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool) && file && outsideVault(file, root)) {
    const shown = file.startsWith(homedir() + '/') ? '~' + file.slice(homedir().length) : file
    return { kind: 'outside', label: `改库外的文件 ${cut(shown)}` }
  }
  return null
}
