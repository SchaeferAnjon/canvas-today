/**
 * 对比标签（CN-48 方向 A）：历史里一次提交、梦游的一条改动、可能重复的两篇，在中间栏开一个像 GitHub / VS Code 那样的对比。
 * 这里是两边都用的类型和纯函数：改了什么的一句人话（侧栏只写这一句，CN-63）、unified diff 的 -U0 片段。主进程、界面、测试都用。
 */

/** 对比的是什么 */
export type DiffSource =
  /** 一次提交改的所有文件（focus：侧栏点的那个文件，打开时滚到它；hide：不列软件自己的设置文件，历史 ⋯ 里的开关，CN-116） */
  | { kind: 'commit'; hash: string; focus?: string; hide?: boolean }
  /** 那次提交时这个文件的样子（右键「看这一版」：只读，文件挪走、删了也能看） */
  | { kind: 'version'; hash: string; path: string }
  /** 梦游报告里的一条：main 上的和梦游改后的 */
  | { kind: 'dream'; id: string; focus?: string }
  /** 可能重复的两篇：两个文件并排 */
  | { kind: 'pair'; a: string; b: string }
  /** 还没提交的改动：上次提交的和现在磁盘上的（历史最上面「还没提交的改动」那一行） */
  | { kind: 'working'; focus?: string }
  /** AI 命令「先给你看」：照命令改好的样子，还没写进文件（界面里的 renderer/commands/proposals.ts，收下才写，task-9womr） */
  | { kind: 'proposal'; id: string }

export type DiffFileKind = 'md' | 'html' | 'image' | 'text' | 'binary'

export interface DiffEntry {
  path: string
  /** 挪动时的旧路径 */
  from?: string
  status: 'new' | 'changed' | 'moved' | 'deleted'
  kind: DiffFileKind
  /** 改之前、改之后的全文；图片是 data: 地址；没有（新建 / 删掉）是 null；二进制文件两边都是 null */
  before: string | null
  after: string | null
  /** 字节数（删掉的是删之前的） */
  size: number
  added: number
  removed: number
  /** 改了什么的一句人话 */
  summary: string
  /** 这句人话是要提醒的（AI 命令先给你看里少了整节、命令没说要删）：红字 */
  warn?: boolean
  /** 现在库里这个路径上还有这个文件（「打开这篇」能不能点） */
  exists: boolean
  /**
   * 梦游的一条（task-m552v「打开「文件名」」不再灰掉）：现在库里这篇在哪。和 path 一样是原处；
   * 后来收下的归类把它挪走了是挪去的地方；还没收下的挪动是原来那份；只在梦游分支上的新文件是 null（branch 为 true）
   */
  now?: string | null
  /** 只在梦游分支上（还没收下的新文件）：「打开「x.html」· 梦游分支上的」开的是梦游分支上那份 */
  branch?: boolean
}

export interface DiffResult {
  /** 标签条右端的一句：「今天 20:58 · 可视化：高维准正交」 */
  note: string
  /** 两列的抬头：「改之前 · 1889a52」「这次提交后 · 1782e1d」 */
  left: string
  right: string
  files: DiffEntry[]
  /** 右边那一版的提交号（梦游是这一条最后一次提交，历史是那次提交）：HTML 收下后的样子按它读（cn-file://rev/…） */
  rev?: string
}

/** 新文件、大文件只露一行（「新文件 · 18 KB · 预览 · 看源码」），源码默认收起：别把上万行全铺开 */
export const BIG_LINES = 400

const IMAGE = /\.(png|jpe?g|gif|webp|svg|heic|bmp)$/i

export function fileKindOf(path: string): DiffFileKind {
  if (/\.md$/i.test(path)) return 'md'
  if (/\.html?$/i.test(path)) return 'html'
  if (IMAGE.test(path)) return 'image'
  if (/\.(txt|json|css|js|ts|csv|ya?ml|xml|vtt|srt)$/i.test(path)) return 'text'
  return 'binary'
}

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const baseName = (p: string) => p.split('/').pop() ?? p
/** 文件在哪个文件夹；最外层写库名（CN-106，库名由调的人给，没给时写「最外层」） */
const dirName = (p: string, vault = '最外层') => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : vault)
const clip = (s: string, n = 24) => {
  const t = s.trim().replace(/\s+/g, ' ')
  return Array.from(t).length > n ? Array.from(t).slice(0, n).join('') + '…' : t
}

/** git diff -U0 的一个片段：从第几行起删了哪些、加了哪些（行号从 1 起） */
export interface Hunk {
  oldStart: number
  newStart: number
  del: string[]
  add: string[]
}

/** 拆 git diff -U0 的输出：路径（新路径）→ 片段 */
export function parseHunks(out: string): Map<string, Hunk[]> {
  const files = new Map<string, Hunk[]>()
  let cur: Hunk[] | null = null
  let h: Hunk | null = null
  const unq = (s: string) => s.replace(/^"|"$/g, '')
  for (const line of out.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
      cur = []
      h = null
      files.set(unq(m?.[2] ?? ''), cur)
      continue
    }
    if (!cur) continue
    if (line.startsWith('rename to ')) {
      // 挪动：以新路径为准
      const key = [...files.entries()].find(([, v]) => v === cur)?.[0]
      if (key !== undefined) files.delete(key)
      files.set(unq(line.slice('rename to '.length)), cur)
      continue
    }
    const hm = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hm) {
      h = { oldStart: Number(hm[1]), newStart: Number(hm[2]), del: [], add: [] }
      cur.push(h)
      continue
    }
    if (!h || line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) h.add.push(line.slice(1))
    else if (line.startsWith('-')) h.del.push(line.slice(1))
  }
  return files
}

const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/

/** 第 n 行（从 1 起）往上最近的标题 */
function headingAt(lines: string[], n: number): string | null {
  for (let i = Math.min(n, lines.length) - 1; i >= 0; i--) {
    const m = HEADING.exec(lines[i]!)
    if (m) return m[1]!.trim()
  }
  return null
}

const LINK = /\[\[([^\]|#\n]+)[^\]]*\]\]|\[([^\]\n]+)\]\([^)\s]+\)/

/**
 * 改了什么的一句人话（历史里不是梦游做的那些按 diff 拼）：
 * 新建 / 删了 / 挪到；只加了一行写出那一行（末尾的写「末尾加了一行」）；加了链接；加了 N 行；改了「某标题」那段；删了「某标题」那段
 */
/** vault：库名（挪到最外层时写它，CN-106） */
export function summarize(e: Pick<DiffEntry, 'path' | 'from' | 'status' | 'kind' | 'size'>, hunks: Hunk[], after: string | null, vault?: string): string {
  const name = baseName(e.path)
  if (e.status === 'new') return e.kind === 'md' ? `新建「${name.replace(/\.md$/i, '')}」` : e.kind === 'image' ? `新图片「${name}」` : `新建「${name}」· ${sizeText(e.size)}`
  if (e.status === 'deleted') return `删了「${name.replace(/\.md$/i, '')}」`
  const moved = e.status === 'moved' && e.from ? (dirName(e.from) === dirName(e.path) ? `改名「${baseName(e.from).replace(/\.md$/i, '')}」→「${name.replace(/\.md$/i, '')}」` : `从 ${dirName(e.from, vault)} 挪到 ${dirName(e.path, vault)}`) : ''
  if (e.kind !== 'md' && e.kind !== 'text') return moved || (e.kind === 'image' ? '换了一张图' : `改了 · ${sizeText(e.size)}`)
  const change = mdChange(hunks, after ?? '')
  return [moved, change].filter(Boolean).join('，') || '内容没变'
}

function mdChange(hunks: Hunk[], after: string): string {
  if (!hunks.length) return ''
  const lines = after.split('\n')
  const addOnly = hunks.every((h) => !h.del.length)
  const delOnly = hunks.every((h) => !h.add.length)
  const added = hunks.flatMap((h) => h.add).filter((l) => l.trim())
  const removed = hunks.flatMap((h) => h.del).filter((l) => l.trim())
  const sections = new Set(hunks.map((h) => headingAt(lines, Math.max(1, h.newStart))))
  const one = sections.size === 1 ? [...sections][0] : null
  if (addOnly) {
    const last = hunks[hunks.length - 1]!
    // 文末那一行（最后的空行不算）
    const lastLine = lines.length - (lines[lines.length - 1] === '' ? 1 : 0)
    const atEnd = last.newStart + last.add.length - 1 >= lastLine
    const where = atEnd ? '末尾' : one ? `「${clip(one)}」那段` : ''
    const link = added.map((l) => LINK.exec(l)).find(Boolean)
    if (link) return `${where}加了链接「${clip(link[1] ?? link[2] ?? '')}」`
    if (added.length === 1) return `${where}加了一行「${clip(added[0]!)}」`
    return `${where}加了${added.length}行`
  }
  if (delOnly) {
    const head = removed.map((l) => HEADING.exec(l)).find(Boolean)
    if (head) return `删了「${clip(head[1]!)}」那段`
    return `${one ? `「${clip(one)}」那段` : ''}删了${removed.length}行`
  }
  if (one) return `改了「${clip(one)}」那段`
  return `改了${hunks.length}处`
}

const titleOfPath = (p: string) => baseName(p).replace(/\.md$/i, '')
const H1 = /^#\s+(.+?)\s*$/m
const IMG_LINK = /!\[[^\]\n]*\]\(([^)\s]+)\)/g
const REL_LINK = /(?<!!)\[[^\]\n]*\]\(([^)\s]+)\)/g
const relOnly = (url: string) => !/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(url)
/** 一篇里的相对链接（图片的、别的），按出现的先后 */
const links = (t: string, re: RegExp) => [...t.matchAll(re)].map((m) => m[1]!).filter(relOnly)
const changed = (a: string[], b: string[]) => a.reduce((n, x, i) => n + (b[i] !== undefined && b[i] !== x ? 1 : 0), 0)

/**
 * 归类和改名挪的那篇（task-m552v 对照的文件条、左栏小卡里那一行）：挪到哪、改没改名、正文跟着改了什么。
 * 「挪到剪藏/旅行」「挪到剪藏/旅行，标题加「2」，2张图的地址跟着改」「挪到写作并改名，标题和1处链接跟着改」「改名「新名」，标题跟着改」
 */
export function moveSay(from: string, to: string, before: string | null, after: string | null, vault?: string): string {
  const was = titleOfPath(from)
  const now = titleOfPath(to)
  const moved = dirName(from, vault) !== dirName(to, vault)
  const renamed = was !== now
  const suffix = renamed && now.startsWith(was) ? now.slice(was.length).trim() : ''
  const head = moved ? `挪到${dirName(to, vault)}${renamed && !suffix ? '并改名' : ''}` : renamed && !suffix ? `改名「${now}」` : ''
  const parts = [head]
  if (suffix) parts.push(`标题加「${suffix}」`)
  if (before !== null && after !== null) {
    const title = !suffix && H1.exec(before)?.[1] !== H1.exec(after)?.[1]
    const imgs = changed(links(before, IMG_LINK), links(after, IMG_LINK))
    const other = changed(links(before, REL_LINK), links(after, REL_LINK))
    const what = [title ? '标题' : '', imgs ? `${imgs}张图的地址` : '', other ? `${other}处链接` : ''].filter(Boolean)
    if (what.length) parts.push(`${what.length > 1 ? what.slice(0, -1).join('、') + '和' + what[what.length - 1] : what[0]}跟着改`)
  }
  return parts.filter(Boolean).join('，') || '内容没变'
}

/** 改名时别的笔记里换了双链的那一篇：「「记下的时刻」那段的 [[极光]] 换成 [[极光 2]]」（第一处改的那一行往上最近的标题） */
export function relinkSay(oldName: string, newName: string, before: string, after: string): string {
  const a = before.split('\n')
  const lines = after.split('\n')
  let n = 0
  while (n < lines.length && lines[n] === a[n]) n++
  const where = n < lines.length ? headingAt(lines, n + 1) : null
  return `${where ? `「${clip(where)}」那段的 ` : ''}[[${oldName}]] 换成 [[${newName}]]`
}
