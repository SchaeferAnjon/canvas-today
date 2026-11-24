/**
 * 找回清掉的对话（2026-11-24，一次性）：0.5.10 以前头上「+」新对话会把这一处的对话清掉，问答就没了；
 * 用 Claude Code 答的那些，Claude Code 自己在 <配置目录>/projects/<库路径>/<会话号>.jsonl 留着全文。
 * 这里只读那些文件：哪个对话都没引用的会话号，读出问答（用户说的那句、AI 回答的字，工具步骤不要），
 * 按第一问时「当前标签」认是哪一处（文档、白板、文件夹、首页），收进那一处的「之前的对话」；认不出的进「找回的对话」。
 * 不改 Claude Code 的文件；每个库只做一次（chats/<库>/recovered.json 记着）。用 API Key 那几家、Codex 等答的没有这种记录，找不回。
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { StoredMsg } from '../../shared/agent'

/** 认不出是哪一处的进这一处 */
export const RECOVERED = { key: 'recovered', label: '找回的对话' } as const // 不翻：存进对话文件的名字，界面上照 key 翻

export interface Found {
  /** 那一处（对话的 key 和名字） */
  place: { key: string; label: string }
  session: string
  msgs: StoredMsg[]
  /** 最后一问的时间 */
  at: number
}

/** Claude Code 把工作目录写成文件夹名：字母数字以外的都换成 - */
export const projectDirName = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, '-')

/** 发给 AI 的整段里用户说的那句：「用户说：\n」后面，去掉末尾的【语言】那一行 */
function said(prompt: string): string | null {
  const at = prompt.lastIndexOf('用户说：\n') // 不翻：给 AI 的提示词里的标记
  if (at < 0) return null
  return prompt
    .slice(at + 5)
    .replace(/\n\n【语言】[^\n]*$/, '')
    .trim()
}

/** 第一问时开着的是哪一处（describeContext 的「当前标签：…」那一行） */
function placeOf(prompt: string): Found['place'] {
  const line = /^当前标签：(.*)$/m.exec(prompt)?.[1] ?? '' // 不翻：给 AI 的上下文
  const doc = /^(?:文档|白板)「(.*)」（(.+?\.md)）/.exec(line)
  if (doc) return { key: `file:${doc[2]}`, label: doc[1]! }
  const folder = /^文件夹「(.*)」的首页（(.+?)，/.exec(line)
  if (folder) return { key: `folder:${folder[2]}`, label: folder[1]! }
  if (line === '首页') return { key: 'home', label: '首页' } // 不翻：存进对话文件的名字
  return { ...RECOVERED }
}

type Line = { type?: string; isSidechain?: boolean; isMeta?: boolean; timestamp?: string; message?: { content?: unknown } }

const texts = (content: unknown): string[] =>
  typeof content === 'string' ? [content] : Array.isArray(content) ? content.flatMap((b: { type?: string; text?: unknown }) => (b?.type === 'text' && typeof b.text === 'string' ? [b.text] : [])) : []

/** 一个会话文件读成问答；不是 AI 对话问的（读 PDF、旁支、小活）读不出「用户说」，返回 null */
export function readSession(file: string, session: string, nextId: () => number): Found | null {
  const msgs: StoredMsg[] = []
  let place: Found['place'] | null = null
  let answer: string[] = []
  let answerAt = 0
  const endAnswer = () => {
    if (answer.length) msgs.push({ id: nextId(), role: 'ai', text: answer.join('\n\n'), time: answerAt })
    answer = []
  }
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (!raw.trim()) continue
    let l: Line
    try {
      l = JSON.parse(raw) as Line
    } catch {
      continue
    }
    if (l.isSidechain || l.isMeta) continue
    const time = l.timestamp ? Date.parse(l.timestamp) || 0 : 0
    if (l.type === 'user') {
      const prompt = texts(l.message?.content).join('\n')
      const q = said(prompt)
      // 工具结果也是 user 一行：没有「用户说」的不算一问
      if (q === null) continue
      endAnswer()
      place ??= placeOf(prompt)
      msgs.push({ id: nextId(), role: 'user', text: q, time })
    } else if (l.type === 'assistant' && msgs.length) {
      const t = texts(l.message?.content).join('\n\n').trim()
      if (t) {
        answer.push(t)
        answerAt = time
      }
    }
  }
  endAnswer()
  if (!place || !msgs.some((m) => m.role === 'user')) return null
  return { place, session, msgs, at: msgs.reduce((t, m) => Math.max(t, m.time ?? 0), 0) }
}

/**
 * 这个库在 Claude Code 里没被引用的会话读出来（旧的在前）。known：软件记着的全部会话号（对话、旁支、读 PDF 的都算）。
 * 从同一段分出去的会话（旁支 fork 出来的）开头几问一样：第一问和时间一样的只留问得最多的那个
 */
export function findLost(claudeDir: string, cwd: string, known: Set<string>, nextId: () => number): Found[] {
  // Claude Code 记的是解开链接以后的路径（/var → /private/var）：两种都看
  let real = cwd
  try {
    real = realpathSync(cwd)
  } catch {
    // 库不在了：照原样找
  }
  const files: { dir: string; name: string }[] = []
  for (const d of new Set([projectDirName(cwd), projectDirName(real)])) {
    const dir = join(claudeDir, 'projects', d)
    try {
      for (const name of readdirSync(dir)) files.push({ dir, name })
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }
  const byFirst = new Map<string, Found>()
  for (const { dir, name } of files) {
    if (!name.endsWith('.jsonl')) continue
    const session = name.slice(0, -6)
    if (known.has(session) || !statSync(join(dir, name)).isFile()) continue
    const f = readSession(join(dir, name), session, nextId)
    if (!f) continue
    const first = f.msgs[0]!
    const k = `${first.time}\n${first.text}`
    const had = byFirst.get(k)
    if (!had || had.msgs.length < f.msgs.length) byFirst.set(k, f)
  }
  return [...byFirst.values()].sort((a, b) => a.at - b.at)
}

/** 软件记着的会话号：对话文件、读 PDF 的会话文件里所有长得像会话号的字 */
export function knownSessions(files: string[]): Set<string> {
  const out = new Set<string>()
  for (const f of files) {
    let s: string
    try {
      s = readFileSync(f, 'utf8')
    } catch {
      continue
    }
    for (const m of s.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)) out.add(m[0])
  }
  return out
}
