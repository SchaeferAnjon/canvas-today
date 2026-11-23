/**
 * AI 回答里的引用（task-3e53q）：回答里写的 [字](链接)、[[双链]] 指的是库里的哪样东西、到哪一行 / 哪一段 / 哪一页，
 * AI 对话、旁支、讲解卡、白板卡里点它（预览卡、⌘点打开）都按这里认。
 * 认法：
 * - 网址（http、https）原样；带 #:~:text= 的是网页里的一段；
 * - canvas-notes://chat?… 是「回到 AI 对话」；
 * - 库里的文件：先按写的地方（base，这篇笔记所在的文件夹）认，再按库根目录认（AI 的工作目录是库根目录，它写的路径多半相对库根），
 *   绝对路径、file:// 在库里的去掉库的那截；没写 .md 的补上；都找不到按文件名在全库找（只有一篇同名的才算）；
 * - # 后面：PDF 的 page=N&rect=…；笔记的 L12、L12-L20（行号从文件第一行数起，和 AI 读文件时看到的一样）、^块号、标题。
 * 纯函数，不碰 DOM、不依赖 Electron（iPad 版照着移植）。
 */
import { resolveLink } from './blocks'
import { parsePdfAnchor, type Rect } from './pdf-link'

/** 笔记里的哪一处：几行（1 起，含 frontmatter）、某个标题下、某个块（^id） */
export type CiteAnchor = { line: number; end: number } | { heading: string } | { block: string }

export type Cite =
  | { kind: 'note'; path: string; anchor?: CiteAnchor }
  /** page：链接里写了第几页才有（光一个 PDF 不翻页，开在上次看到的地方） */
  | { kind: 'pdf'; path: string; page?: number; rect?: Rect }
  /** 别的库里文件（HTML、图片……）：按类型开 */
  | { kind: 'file'; path: string }
  | { kind: 'web'; url: string }
  | { kind: 'chat'; key: string; msg: number }

/** 认不出时为什么（预览卡上照实说） */
export type CiteMiss = { kind: 'missing'; label: string } | { kind: 'outside'; path: string }

export interface CiteCtx {
  /** 写着这个链接的笔记（库里的路径）；AI 回答没有，给空串 = 库根目录 */
  base: string
  /** 库在这台机器上的绝对路径（认 AI 写的绝对路径） */
  root: string
  /** 库里所有文件（相对库根，/ 分隔） */
  files: readonly string[]
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1)

/** 写着的路径 → 库里在的那个文件；找不到是 null */
function findFile(written: string, ctx: CiteCtx): string | null {
  const have = new Set(ctx.files)
  const lower = new Map(ctx.files.map((f) => [f.toLowerCase(), f]))
  const tries: string[] = []
  const add = (p: string | null) => {
    if (!p) return
    tries.push(p)
    if (!/\.[a-z0-9]{1,5}$/i.test(baseName(p))) tries.push(p + '.md')
  }
  // 相对写的地方、相对库根（resolveLink 认的是「笔记里的相对链接」：库根那一次假装写在库根的一篇里）
  if (ctx.base) add(resolveLink(ctx.base, written))
  add(resolveLink('_', written))
  for (const t of tries) {
    if (have.has(t)) return t
    const ci = lower.get(t.toLowerCase())
    if (ci) return ci
  }
  // 按文件名全库找：只认唯一的一篇（两篇同名就不猜）
  const name = baseName(tries[0] ?? written).toLowerCase()
  const names = [name, /\.[a-z0-9]{1,5}$/i.test(name) ? '' : name + '.md'].filter(Boolean)
  const same = ctx.files.filter((f) => names.includes(baseName(f).toLowerCase()))
  return same.length === 1 ? same[0]! : null
}

/** # 后面那截（已解码）→ 笔记里的哪一处 */
export function noteAnchorOf(hash: string): CiteAnchor | undefined {
  const h = hash.trim()
  if (!h) return undefined
  const lines = /^L(\d+)(?:\s*[-–~]\s*L?(\d+))?$/i.exec(h)
  if (lines) {
    const a = Number(lines[1])
    const b = lines[2] ? Number(lines[2]) : a
    if (a >= 1) return { line: Math.min(a, b), end: Math.max(a, b) }
  }
  if (h.startsWith('^')) return h.length > 1 ? { block: h.slice(1) } : undefined
  return { heading: h }
}

function fileCite(path: string, hash: string): Cite {
  if (/\.pdf$/i.test(path)) {
    const a = /(^|&)page=\d+(&|$)/.test(hash) ? parsePdfAnchor(`x.pdf#${hash}`) : null
    return { kind: 'pdf', path, ...(a ? { page: a.page } : {}), ...(a?.rect ? { rect: a.rect } : {}) }
  }
  if (/\.md$/i.test(path)) {
    const anchor = noteAnchorOf(decode(hash))
    return { kind: 'note', path, ...(anchor ? { anchor } : {}) }
  }
  return { kind: 'file', path }
}

/** [字](href) 的 href 指的是什么；label 是链接的字（找不到时说） */
export function citeOf(href: string, ctx: CiteCtx, label = ''): Cite | CiteMiss {
  const url = href.trim().replace(/^<(.*)>$/, '$1')
  if (/^https?:\/\//i.test(url)) return { kind: 'web', url }
  const chat = /^canvas-notes:\/\/chat\?key=([^&\s]+)&msg=(\d+)$/.exec(url)
  if (chat) return { kind: 'chat', key: decode(chat[1]!), msg: Number(chat[2]) }
  const hashAt = url.indexOf('#')
  let path = hashAt === -1 ? url : url.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : url.slice(hashAt + 1)
  if (/^file:\/\//i.test(path)) path = decode(path.replace(/^file:\/\/(localhost)?/i, ''))
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return { kind: 'missing', label: label || url }
  if (path.startsWith('/') || path.startsWith('~')) {
    const p = decode(path)
    const root = ctx.root.replace(/\/+$/, '')
    if (!root || !p.startsWith(root + '/')) return { kind: 'outside', path: p }
    path = p.slice(root.length + 1)
  }
  if (!path) return { kind: 'missing', label: label || url }
  const file = findFile(path, ctx)
  return file ? fileCite(file, hash) : { kind: 'missing', label: label || decode(path) }
}

/** [[双链]] 中间那截（名字#标题|别名）指的是什么：按名字（不带 .md）或路径找，PDF 写全名 */
export function citeOfWiki(inner: string, ctx: CiteCtx): Cite | CiteMiss {
  const bar = inner.indexOf('|')
  const target = (bar === -1 ? inner : inner.slice(0, bar)).trim()
  const hashAt = target.indexOf('#')
  const name = (hashAt === -1 ? target : target.slice(0, hashAt)).trim()
  const hash = hashAt === -1 ? '' : target.slice(hashAt + 1)
  if (!name) return { kind: 'missing', label: inner }
  const low = name.toLowerCase()
  const hit =
    ctx.files.find((f) => f.toLowerCase() === low || f.toLowerCase() === low + '.md') ??
    ctx.files.find((f) => /\.md$/i.test(f) && baseName(f).slice(0, -3).toLowerCase() === low) ??
    ctx.files.find((f) => baseName(f).toLowerCase() === low)
  if (!hit) return { kind: 'missing', label: name }
  // 双链里的 #第4页 / #page=4 不认成页码，PDF 照 parsePdfAnchor 认 page=
  return fileCite(hit, hash)
}

/** 引用到的那几行（1 起，含首尾）；标题：标题那一行到它下面第一段末尾；块：^id 所在的那一段 */
export function anchorLines(text: string, anchor: CiteAnchor): { from: number; to: number } | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const n = lines.length
  const blank = (i: number) => !lines[i] || !lines[i]!.trim()
  if ('line' in anchor) {
    if (anchor.line > n) return null
    return { from: anchor.line, to: Math.min(anchor.end, n) }
  }
  /** 第 i 行（0 起）所在那一段的起止（0 起） */
  const para = (i: number) => {
    let a = i
    let b = i
    while (a > 0 && !blank(a - 1)) a--
    while (b < n - 1 && !blank(b + 1)) b++
    return { a, b }
  }
  if ('block' in anchor) {
    const re = new RegExp(`(^|\\s)\\^${anchor.block.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
    const i = lines.findIndex((l) => re.test(l))
    if (i === -1) return null
    const p = para(i)
    return { from: p.a + 1, to: p.b + 1 }
  }
  const want = anchor.heading.replace(/\s+/g, ' ').trim().toLowerCase()
  const i = lines.findIndex((l) => {
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(l)
    return !!m && m[1]!.replace(/\s+/g, ' ').trim().toLowerCase() === want
  })
  if (i === -1) return null
  let j = i + 1
  while (j < n && blank(j)) j++
  if (j >= n || /^#{1,6}\s/.test(lines[j]!)) return { from: i + 1, to: i + 1 }
  return { from: i + 1, to: para(j).b + 1 }
}
