/**
 * 库里的全部文件（⌘O 按名字跳、左栏「全部文件」目录树用）：md、PDF、HTML、附件/ 里的图和文件夹。
 * 纯计算（按名字筛、排序、拼成树）放这里，界面和单元测试都用。
 */
import { CATEGORIES, CATEGORY_GROUPS, CATEGORY_NAMES, type CategoryGroup, categoryRank, isCategory } from './categories'
import { INBOX } from './layout'
import type { AttachUse } from './attach'

/** img：附件/ 里的图片；att：附件/ 里别的文件（附件文件夹在树里看得到，CN-104、four-items 1a） */
export type FileKind = 'md' | 'pdf' | 'html' | 'img' | 'att' | 'dir'

export interface FileEntry {
  /** 相对库根目录，用 / 分隔 */
  path: string
  kind: FileKind
  mtimeMs: number
  /** 建文件的时间（目录树「按创建时间」排） */
  ctimeMs?: number
  /** PDF 问到第几页（旁边笔记的属性「进度」：问过的最大页码 / 一共几页） */
  progress?: { asked: number; pages: number }
  /** HTML（做好的可视化）属于第几讲：<head> 里 <meta name="第几讲">，目录树里排在那一讲后面 */
  lecture?: number
  /**
   * PDF、HTML 旁边那篇读 PDF 笔记（「<名字> 笔记.md」，一个 PDF 一篇，2026-11-20）和里面问了几问（主问题 + 旁支问题）：
   * 目录树里笔记挂在 PDF 下面，写「笔记」（task-m552v；以前是合成一行）
   */
  /** sent：这篇笔记里问过的都送进 Anki 了（目录树那一行数字后面一个绿勾，task-tz7y3） */
  note?: { path: string; asks: number; sent?: boolean }
  /** 附件（img、att）：多大，字节 */
  bytes?: number
  /** HTML（可视化）：嵌着、链着它的那篇读 PDF 笔记（目录树里挂到那篇下面，task-m552v） */
  vizOf?: string
  /**
   * 梦游分支上还没收下的可视化（task-m552v）：报告里那一条的身份。库里还没有这个文件，界面按报告补进来：
   * 目录树里挂在它的笔记下面、淡着写「没收下」，点了开报告里那一条；不算篇数
   */
  dream?: string
  /**
   * 文件夹是某个数据库（```base）的记录文件夹（task-5yp97，用户看图定「藏之后」）：几条记录；owner 是同一个文件夹里用它的那一篇
   * （好几篇按名字取最前的）。有 owner 的在目录树里挂到那篇下面；不管挂没挂，「移到」的去处里都不列它（挪进去就成了一条记录）
   */
  base?: { records: number; owner?: string }
  /**
   * 名字叫「待办」的笔记（task-pd1d1）：设置 › 文件「文件树里显示待办」没开时记上，目录树、文件夹首页的文件列表不画、篇数不算；
   * ⌘O 照样找得到（只有 buildTree 看它）
   */
  hidden?: boolean
}

/** 设置里没开「文件树里显示待办」时：名字叫「待办」的笔记记上 hidden；没有要藏的原样还回去 */
export function hideTodos(files: FileEntry[]): FileEntry[] {
  if (!files.some((f) => f.kind === 'md' && fileName(f.path) === '待办.md')) return files
  return files.map((f) => (f.kind === 'md' && fileName(f.path) === '待办.md' ? { ...f, hidden: true } : f))
}

/** 数据库的记录文件夹（「移到」不列它和它里面的） */
export const isBaseFolder = (f: FileEntry) => f.kind === 'dir' && !!f.base

/**
 * 记录文件夹挂在哪一篇下面：用它的那几篇（users）里和它在同一个文件夹里的、按名字排最前的那篇（插数据库时就建在那篇旁边）；
 * 没有就不挂（那篇挪走了、删了，它照普通文件夹画）。目录树画（markBases）和挪那篇时它跟着走（main/folder-ops）都照这一条
 */
export function baseOwner(folder: string, users: readonly string[]): string | undefined {
  const parent = folderOfPath(folder)
  return users.filter((p) => folderOfPath(p) === parent).sort((a, b) => collator.compare(a, b))[0]
}

/** 给记录文件夹记上几条记录、用它的那篇（files 是 listEntries 列出来的，texts 是库里每篇 md 的全文） */
export function markBases(files: FileEntry[], texts: ReadonlyMap<string, string>, foldersOf: (text: string) => string[]): FileEntry[] {
  const users = new Map<string, string[]>()
  for (const [path, text] of texts) {
    if (!text.includes('```base')) continue
    for (const f of foldersOf(text)) users.set(f, [...(users.get(f) ?? []), path])
  }
  if (!users.size) return files
  const here = new Set(files.map((f) => f.path))
  const records = new Map<string, number>()
  for (const f of files) {
    if (f.kind !== 'md') continue
    const d = folderOfPath(f.path)
    if (users.has(d)) records.set(d, (records.get(d) ?? 0) + 1)
  }
  return files.map((f) => {
    // 最外层固定的分类（收件箱、课程……）当数据源也照旧是分类：不挂到哪篇下面，「移到」照样列
    if (f.kind !== 'dir' || !users.has(f.path) || fixedFolder(f.path)) return f
    const owner = baseOwner(f.path, users.get(f.path)!.filter((p) => here.has(p)))
    return { ...f, base: { records: records.get(f.path) ?? 0, ...(owner ? { owner } : {}) } }
  })
}

/** 附件/ 里的文件：图片、别的附件 */
export const isAttachKind = (k: FileKind) => k === 'img' || k === 'att'

/**
 * 「附件」筛选（CN-104）：每篇笔记用到哪些附件、没有谁在用的附件。
 * 读 PDF 的完整对话（.canvas-notes/对话/）用的图挂在那份 PDF 的笔记下面；PDF 或它的笔记不在了的放 convos（「完整对话在用的附件」一组）
 */
export interface AttachIndex {
  notes: { note: string; items: { path: string; bytes: number }[] }[]
  /** convo：用它的那份完整对话（双击打开） */
  convos: { path: string; bytes: number; convo: string }[]
  orphans: { path: string; bytes: number }[]
  /** 附件 → 文中链着它的笔记（含读 PDF 的完整对话、PDF 旁边那篇配对笔记）；只是放在某篇的附件文件夹里、文中没用到的不算。文件树写「被 N 篇用」「没用到」 */
  refs: Record<string, string[]>
  /** 附件 → 到底用没用（清理用，全库所有文字文件都查、宁可少清，main/attach-usage.ts）：「只看没用到的」「清理 N 个」按它数 */
  usage: Record<string, AttachUse>
}

export interface CnFilesApi {
  all(): Promise<FileEntry[]>
  /** 选了「附件」筛选、或树里展开了 附件/ 时读（要读全库的笔记） */
  attachments(): Promise<AttachIndex>
}


export const fileName = (p: string) => p.split('/').pop() ?? p
export const folderOfPath = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

/** 「进度: 5/10」→ { asked: 5, pages: 10 } */
export function parseProgress(v: string | undefined): FileEntry['progress'] {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(v ?? '')
  return m ? { asked: Number(m[1]), pages: Number(m[2]) } : undefined
}

export const progressDone = (p: FileEntry['progress']) => !!p && p.pages > 0 && p.asked >= p.pages

/**
 * ⌘O 的筛法（像 Obsidian 的 Quick Switcher）：名字里连着有这几个字的最前（开头就是的更前），
 * 再是按顺序都出现的，再是字都出现的（不管顺序）；空格分开的几段都要有。同一档里名字短的、新改的在前。
 */
export function matchFiles<T extends { path: string; mtimeMs: number }>(files: T[], q: string, limit = 50): { items: T[]; more: number } {
  const parts = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!parts.length) return { items: files.slice(0, limit), more: Math.max(0, files.length - limit) }
  const scored: { f: T; s: number }[] = []
  for (const f of files) {
    const name = fileName(f.path).toLowerCase()
    const full = f.path.toLowerCase()
    let s = 0
    for (const p of parts) {
      let one: number
      if (name.startsWith(p)) one = 4
      else if (name.includes(p)) one = 3
      else if (inOrder(name, p)) one = 2
      else if ([...p].every((ch) => name.includes(ch))) one = 1
      else if (full.includes(p)) one = 0.5
      else {
        s = -1
        break
      }
      s += one
    }
    if (s > 0) scored.push({ f, s })
  }
  scored.sort((a, b) => b.s - a.s || fileName(a.f.path).length - fileName(b.f.path).length || b.f.mtimeMs - a.f.mtimeMs)
  return { items: scored.slice(0, limit).map((x) => x.f), more: Math.max(0, scored.length - limit) }
}

function inOrder(name: string, p: string): boolean {
  let i = 0
  for (const ch of p) {
    i = name.indexOf(ch, i)
    if (i === -1) return false
    i += ch.length
  }
  return true
}

/** 目录树的一个节点 */
export interface TreeNode {
  path: string
  name: string
  kind: FileKind
  entry?: FileEntry
  children: TreeNode[]
  /** 里面（含子文件夹）有几个文件（筛过类型以后的）；文件是 1 */
  count: number
  /** 排序用的时间：文件是它的修改 / 创建时间，文件夹是里面最新的那个 */
  time: number
  /** 置顶了（笔记写在置顶.json 里，文件夹写成「写作/」） */
  pinned?: boolean
  /**
   * 挂在别的文件下面的（task-m552v）：note 是 PDF 下面的那篇读 PDF 笔记，viz 是笔记下面它嵌着的可视化；
   * sub 是白板下面它的导图、子白板（属性 所属白板 / 所属笔记，task-wuv05），照常算篇数。
   * 挂着的笔记写 label「笔记」（悬停看全名）、asks 问了几问；筛类型时只因为下面有符合的才留着的 PDF 是 shell（自己不算篇数）
   */
  hung?: 'note' | 'viz' | 'sub'
  label?: string
  asks?: { n: number; sent?: boolean }
  shell?: boolean
}

const KIND_ORDER: Record<FileKind, number> = { dir: 0, pdf: 1, md: 2, html: 3, img: 4, att: 5 }
/** 顶层分类按这个先后（shared/categories.ts 的顺序），别的文件夹按名字排在后面 */
export const TOP_ORDER: readonly string[] = CATEGORY_NAMES

/** 「第3讲 xx」「第 12 讲」这种按数字排，不按字 */
const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })

/** 目录树的六种排法（照 Obsidian 的排序菜单）：修改时间、创建时间、名字，各有正反 */
export type TreeSort = 'mtime-desc' | 'mtime-asc' | 'ctime-desc' | 'ctime-asc' | 'name-asc' | 'name-desc'
export const TREE_SORTS: { id: TreeSort; label: string; hint: string }[] = [
  { id: 'mtime-desc', label: '修改时间', hint: '新的在前' },
  { id: 'mtime-asc', label: '修改时间', hint: '旧的在前' },
  { id: 'ctime-desc', label: '创建时间', hint: '新的在前' },
  { id: 'ctime-asc', label: '创建时间', hint: '旧的在前' },
  { id: 'name-asc', label: '名字', hint: 'A → Z' },
  { id: 'name-desc', label: '名字', hint: 'Z → A' },
]
export const isTreeSort = (v: unknown): v is TreeSort => TREE_SORTS.some((s) => s.id === v)

export interface TreeOpts {
  sort: TreeSort
  /** 文件夹排在前面 */
  foldersFirst: boolean
  /** 置顶的排在最前 */
  pinsFirst: boolean
  /** 置顶了的路径（文件夹带 /） */
  pins: ReadonlySet<string>
  /** 类型筛选：只留这些文件；留不下文件的文件夹也不画。不给 = 全部（空文件夹也画） */
  keep?: (f: FileEntry) => boolean
  /**
   * 目录树（task-m552v）：PDF › 笔记 › 可视化一层挂一层。不给（文件夹首页「里面有什么」）照旧：PDF 和它的笔记算一个，笔记不单独列
   */
  hang?: boolean
  /** 用预设的分类（task-wniqx）：关掉时最外层的分类不再排在前面，和别的文件夹一起按名字排 */
  cats?: boolean
  /** 挂在别的笔记下面的子文件 → 那一篇（同一个文件夹里，白板下的导图、子白板，task-wuv05）；只在 hang 时用 */
  subOf?: ReadonlyMap<string, string>
}
export const DEFAULT_TREE_OPTS: TreeOpts = { sort: 'name-asc', foldersFirst: true, pinsFirst: true, pins: new Set() }

/**
 * 拼成树：文件夹在前（可关）；置顶的在最前（可关）；按名字排时课程文件夹里同一讲的课件、笔记、可视化挨着（数字按大小），
 * 顶层按 课程 / 项目 / 生活 / 写作 / 素材 / 收件箱 排；按时间排时文件夹算里面最新的那个。
 * 文件夹本身不在列表里也会补出来（不筛类型时空文件夹也画）。每个节点记着里面有几个文件。
 */
export function buildTree(files: FileEntry[], opts: Partial<TreeOpts> = {}): TreeNode[] {
  const o = { ...DEFAULT_TREE_OPTS, ...opts }
  const byTime = !o.sort.startsWith('name')
  const ctime = o.sort.startsWith('ctime')
  const root: TreeNode = { path: '', name: '', kind: 'dir', children: [], count: 0, time: 0 }
  const dirs = new Map<string, TreeNode>([['', root]])
  // PDF › 笔记 › 可视化（task-m552v）：同一个文件夹里，笔记挂在它的 PDF（或读的 HTML）下面，可视化挂在嵌着它的笔记下面。
  // 筛类型时 PDF、HTML 跟着自己的笔记走：笔记留着，它的 PDF 也留着（只是个壳，不算篇数）
  const here = new Map(files.map((f) => [f.path, f]))
  const kept = (f: FileEntry) => !o.keep || o.keep(f)
  const hostOf = new Map<string, FileEntry>()
  if (o.hang) for (const f of files) if (f.note && (f.kind === 'pdf' || f.kind === 'html') && here.has(f.note.path) && folderOfPath(f.note.path) === folderOfPath(f.path)) hostOf.set(f.note.path, f)
  const shells = new Set(o.keep ? [...hostOf].filter(([note, src]) => !kept(src) && kept(here.get(note)!)).map(([, src]) => src.path) : [])
  // 不挂的（文件夹首页）：PDF（HTML）在的时候它旁边那篇笔记不单独列（合成 PDF 那一个）；PDF 被筛掉时笔记照旧单独一个
  const merged = o.hang ? new Set<string>() : new Set(files.flatMap((f) => (f.note && (f.kind === 'pdf' || f.kind === 'html') && kept(f) ? [f.note.path] : [])))
  const dirOf = (path: string): TreeNode => {
    const hit = dirs.get(path)
    if (hit) return hit
    const parent = dirOf(folderOfPath(path))
    const node: TreeNode = { path, name: fileName(path), kind: 'dir', children: [], count: 0, time: 0 }
    parent.children.push(node)
    dirs.set(path, node)
    return node
  }
  for (const f of files) {
    if (f.kind === 'dir') {
      if (o.keep) continue
      const d = dirOf(f.path)
      d.entry = f
      continue
    }
    const shell = shells.has(f.path)
    if (!kept(f) && !shell) continue
    if (f.hidden || merged.has(f.path) || (f.dream && !o.hang)) continue
    const time = ctime ? (f.ctimeMs ?? f.mtimeMs) : f.mtimeMs
    dirOf(folderOfPath(f.path)).children.push({ path: f.path, name: fileName(f.path), kind: f.kind, entry: f, children: [], count: f.dream ? 0 : 1, time, ...(shell ? { shell: true } : {}) })
  }
  // 挂起来：先把可视化挂到笔记下面，再把笔记（连着它的可视化）挂到 PDF 下面
  const hang = (child: string, parent: string, role: 'note' | 'viz') => {
    const d = dirs.get(folderOfPath(child))
    if (!d || folderOfPath(parent) !== folderOfPath(child)) return
    const c = d.children.find((x) => x.path === child && x.kind !== 'dir')
    const p = d.children.find((x) => x.path === parent && x.kind !== 'dir')
    if (!c || !p) return
    d.children = d.children.filter((x) => x !== c)
    c.hung = role
    p.children.push(c)
  }
  if (o.hang) for (const f of files) if (f.kind === 'html' && f.vizOf) hang(f.path, f.vizOf, 'viz')
  // 白板下的导图、子白板（task-wuv05）：父的可能已经挂到别人下面了（子白板的子白板），在这个文件夹里一层层找；不挂成环
  if (o.hang && o.subOf)
    for (const [child, parent] of o.subOf) {
      const d = dirs.get(folderOfPath(child))
      if (!d || folderOfPath(parent) !== folderOfPath(child)) continue
      const c = d.children.find((x) => x.path === child && x.kind !== 'dir')
      const find = (list: TreeNode[]): TreeNode | null => {
        for (const x of list) {
          if (x.kind === 'dir') continue
          if (x.path === parent) return x
          const hit = find(x.children)
          if (hit) return hit
        }
        return null
      }
      const p = c ? find(d.children.filter((x) => x !== c)) : null
      if (!c || !p) continue
      d.children = d.children.filter((x) => x !== c)
      c.hung = 'sub'
      p.children.push(c)
    }
  for (const [note, src] of hostOf) {
    hang(note, src.path, 'note')
    const n = dirs.get(folderOfPath(note))?.children.find((x) => x.path === src.path)?.children.find((x) => x.path === note)
    if (n) Object.assign(n, { label: '笔记', asks: { n: src.note!.asks, ...(src.note!.sent ? { sent: true } : {}) } })
  }
  if (o.keep) for (const f of files) if (f.kind === 'dir' && dirs.has(f.path)) dirs.get(f.path)!.entry = f
  // 数据库的记录文件夹挂到用它的那篇下面（task-5yp97「藏之后」）：那篇在同一个文件夹里、也在树里才挂
  for (const d of dirs.values()) {
    const owner = d.entry?.base?.owner
    if (!owner) continue
    const parent = dirs.get(folderOfPath(d.path))
    const note = parent?.children.find((c) => c.path === owner && c.kind !== 'dir')
    if (!parent || !note) continue
    parent.children = parent.children.filter((c) => c !== d)
    note.children.push(d)
  }
  const desc = o.sort.endsWith('desc')
  /**
   * 挂着东西的文件：数据库挂着的记录文件夹照样算进上面文件夹的篇数（藏起来不等于少了）；
   * PDF › 笔记 › 可视化 合起来算一篇（demo 里「study project 2」写 1；以前 PDF 和笔记是一行也算一个），只要里面有一样算数
   */
  const finishFile = (c: TreeNode) => {
    for (const d of c.children) {
      if (d.kind === 'dir') finish(d, false)
      else if (d.children.length) finishFile(d)
    }
    const own = c.shell || c.entry?.dream ? 0 : 1
    // 挂着的笔记、可视化和它合起来算一篇；白板下的导图、子白板是各自的一篇，照常加
    const merged = (d: TreeNode) => !!d.hung && d.hung !== 'sub'
    const hung = c.children.some((d) => merged(d) && d.count > 0) ? 1 : 0
    c.count = Math.max(own, hung) + c.children.reduce((s, d) => s + (merged(d) ? 0 : d.count), 0)
    c.children.sort((a, b) => (a.kind === 'dir') !== (b.kind === 'dir') ? (a.kind === 'dir' ? 1 : -1) : collator.compare(stem(a.name), stem(b.name)))
  }
  const finish = (n: TreeNode, top: boolean) => {
    for (const c of n.children) {
      c.pinned = o.pins.has(c.kind === 'dir' ? c.path + '/' : c.path)
      if (c.kind === 'dir') finish(c, false)
      else if (c.children.length) finishFile(c)
      else if (c.shell) c.count = 0
    }
    n.count = n.children.reduce((s, c) => s + c.count, 0)
    n.time = n.children.reduce((m, c) => Math.max(m, c.time), n.entry?.mtimeMs ?? 0)
    n.children.sort((a, b) => {
      if (o.pinsFirst && !!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      if (o.foldersFirst && (a.kind === 'dir') !== (b.kind === 'dir')) return a.kind === 'dir' ? -1 : 1
      if (byTime) {
        if (a.time !== b.time) return desc ? b.time - a.time : a.time - b.time
        return collator.compare(stem(a.name), stem(b.name))
      }
      if (desc) return collator.compare(stem(b.name), stem(a.name)) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
      if (a.kind === 'dir' && b.kind === 'dir' && top && o.cats !== false) {
        const ia = TOP_ORDER.indexOf(a.name)
        const ib = TOP_ORDER.indexOf(b.name)
        if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      }
      // 一门课里按讲次排，同一讲 课件 → 笔记 → 可视化；不是哪一讲的排在后面
      if (a.kind !== 'dir' && b.kind !== 'dir') {
        const la = lectureOfNode(a)
        const lb = lectureOfNode(b)
        if (la !== lb) return (la ?? Infinity) - (lb ?? Infinity)
        if (la !== undefined && a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
      }
      return collator.compare(stem(a.name), stem(b.name)) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    })
  }
  finish(root, true)
  return root.children
}

/** 树里找到某个文件夹那一枝（摘到活动栏的文件夹，左栏只画它自己的树） */
export function subtree(nodes: TreeNode[], folder: string): TreeNode[] {
  let list = nodes
  for (const seg of folder.split('/')) {
    const hit = list.find((n) => n.kind === 'dir' && n.name === seg)
    if (!hit) return []
    list = hit.children
  }
  return list
}

const stem = (name: string) => name.replace(/\.(md|pdf|html?)$/i, '')

/** 文件树最外层的一组：收件箱（没有组名）、读进来的、自己写的、不在分类里的 */
export interface TopGroup {
  /** 组名（收件箱那一组是空的，不画组头） */
  title: CategoryGroup | '不在分类里的'
  nodes: TreeNode[]
}

/**
 * 左栏找文件的框（task-4891y）：只留名字（不带 .md、.pdf）里有这几个字的（大小写不分）和一路上去的文件夹；
 * 名字命中的文件夹自己留着，里面不命中的不列。篇数改成命中的几篇。空的不筛，原样还回去
 */
export function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  const w = q.trim().toLowerCase()
  if (!w) return nodes
  const hit = (n: TreeNode) => stem(n.name).toLowerCase().includes(w)
  const walk = (ns: TreeNode[]): TreeNode[] =>
    ns.flatMap((n) => {
      const children = walk(n.children)
      if (!children.length && !hit(n)) return []
      const files = children.reduce((s, c) => s + c.count, 0)
      return [{ ...n, children, count: n.kind === 'dir' ? files : 1 + files }]
    })
  return walk(nodes)
}

/**
 * 文件树最外层按顶级分类分组（2026-11-18 方案 3「分两组」）：分类按分类表的先后，库里还没有这个文件夹的
 * 也画一行空的（all：没筛类型时）；别的文件夹和散文件收在最后一组「不在分类里的」，按原来的排法。空的组不出现。
 * presets 关着（task-wniqx「用预设的分类」）：不分组，收件箱在最前（all 时没有也画），别的照原来的排法（buildTree 给 cats: false，
 * 分类和自己的文件夹一起按名字排），一篇都没有的分类不画
 */
export function topGroups(nodes: TreeNode[], all: boolean, presets = true): TopGroup[] {
  if (!presets) {
    const inbox = nodes.find((n) => n.kind === 'dir' && n.name === INBOX) ?? (all ? { path: INBOX, name: INBOX, kind: 'dir' as const, children: [], count: 0, time: 0 } : null)
    const rest = nodes.filter((n) => !(n.kind === 'dir' && (n.name === INBOX || (isCategory(n.name) && !n.count))))
    return [{ title: '' as const, nodes: inbox ? [inbox, ...rest] : rest }].filter((g) => g.nodes.length)
  }
  const byName = new Map(nodes.filter((n) => n.kind === 'dir' && isCategory(n.name)).map((n) => [n.name, n]))
  const out: TopGroup[] = CATEGORY_GROUPS.map((g) => ({
    title: g,
    nodes: CATEGORIES.filter((c) => c.group === g)
      .map((c) => byName.get(c.name) ?? (all ? { path: c.name, name: c.name, kind: 'dir' as const, children: [], count: 0, time: 0 } : null))
      .filter((n): n is TreeNode => !!n)
      .sort((a, b) => categoryRank(a.name) - categoryRank(b.name)),
  }))
  out.push({ title: '不在分类里的', nodes: nodes.filter((n) => !(n.kind === 'dir' && isCategory(n.name))) })
  return out.filter((g) => g.nodes.length)
}

/** 第几讲：名字里的「第3讲」，HTML 还看它自己写的 */
function lectureOfNode(n: TreeNode): number | undefined {
  if (n.entry?.lecture !== undefined) return n.entry.lecture
  const m = /第\s*(\d+)\s*讲/.exec(n.name)
  return m ? Number(m[1]) : undefined
}

/** 一个文件夹里的课件问完了几份 / 一共几份（只算直接在里面的 PDF），没有 PDF 是 null */
export function folderProgress(node: TreeNode): { done: number; total: number } | null {
  const pdfs = node.children.filter((c) => c.kind === 'pdf')
  if (!pdfs.length) return null
  return { done: pdfs.filter((p) => progressDone(p.entry?.progress)).length, total: pdfs.length }
}

/** 梦游预览：还没收下的「归类和改名」先按改好以后的路径画；moved 是新路径 → 原路径，ghosts 是原来位置留的影子 */
export function previewFiles(files: FileEntry[], moves: { from: string; to: string }[]): { files: FileEntry[]; moved: Map<string, string>; ghosts: { from: string; to: string }[] } {
  const byFrom = new Map(moves.map((m) => [m.from, m]))
  const moved = new Map<string, string>()
  const out = files.map((f) => {
    const m = byFrom.get(f.path)
    if (!m) return f
    moved.set(m.to, m.from)
    return { ...f, path: m.to }
  })
  return { files: out, moved, ghosts: moves.filter((m) => moved.has(m.to)) }
}

/** 最外层这几个是软件自带的分类（附件放图），不改名、不挪、不删 */
export const fixedFolder = (folder: string) => !folder.includes('/') && (isCategory(folder) || folder === '附件')
