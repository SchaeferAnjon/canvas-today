/**
 * 库里的全部文件：md、PDF、HTML、附件/ 里的图和别的文件、文件夹（⌘O、目录树用）。PDF 带上问到第几页（旁边笔记的属性「进度」）。
 * 只读每篇笔记开头一小段找属性，几千个文件也快。附件/ 在树里看得到（four-items 1a、CN-104）。
 * 「附件」筛选要的「哪篇笔记用哪些附件」另外算（attachIndex，只在选了「附件」时读全库）。
 */
import { ipcMain } from 'electron'
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { ATTACHMENTS_DIR, attachmentDir, attachOwner, baseFoldersIn, CONVO_DIR, decodeNote, doubtItems, fileNameIndex, fileRefs, isAppFile, linkedPaths, notePathFor, parseReadingNote, prop, refHits } from '@cn/format'
import { type AttachIndex, type FileEntry, type FileKind, markBases, parseProgress } from '../shared/files'
import { attachUsage } from './attach-usage'
import type { Vault } from './vault'

const SKIP_DIRS = new Set(['node_modules'])
const IMAGE = /\.(png|jpe?g|gif|webp|svg|heic|bmp|avif)$/i

const kindOf = (name: string): FileKind | null => {
  const low = name.toLowerCase()
  if (low.endsWith('.md')) return 'md'
  if (low.endsWith('.pdf')) return 'pdf'
  if (low.endsWith('.html') || low.endsWith('.htm')) return 'html'
  return null
}

/** 文件开头 4 KB（frontmatter 在这里） */
async function head(abs: string): Promise<string> {
  const fh = await open(abs, 'r')
  try {
    const buf = Buffer.alloc(4096)
    const { bytesRead } = await fh.read(buf, 0, 4096, 0)
    return buf.subarray(0, bytesRead).toString('utf8')
  } finally {
    await fh.close()
  }
}

export async function listEntries(root: string): Promise<FileEntry[]> {
  const out: FileEntry[] = []
  const walk = async (dir: string) => {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, ent.name)
      const path = relative(root, abs).split(sep).join('/')
      // 不是笔记也不是附件的（软件自己的、隐藏的、白板笔迹 附件/<白板>/笔迹.ink）不列：@cn/format 的 isAppFile
      if (isAppFile(path)) continue
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue
        out.push({ path, kind: 'dir', mtimeMs: 0 })
        await walk(abs)
        continue
      }
      // 附件/ 里别的文件也列出来（图、附件）；md、PDF、HTML 照常能开
      const inAttach = path.startsWith(ATTACHMENTS_DIR + '/')
      const kind = ent.isFile() ? (kindOf(ent.name) ?? (inAttach ? (IMAGE.test(ent.name) ? 'img' : 'att') : null)) : null
      if (!kind) continue
      try {
        const st = await stat(abs)
        out.push({ path, kind, mtimeMs: st.mtimeMs, ctimeMs: st.birthtimeMs, ...(kind === 'img' || kind === 'att' ? { bytes: st.size } : {}) })
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      }
    }
  }
  await walk(root)
  const have = new Set(out.map((f) => f.path))
  // 送过 Anki 的（库里 .canvas-notes/anki.json，出卡 task-tz7y3）：一份 PDF 问过的都送了，树里那一行数字后面画个绿勾
  let sent: Record<string, unknown> = {}
  try {
    sent = (JSON.parse(await readFile(join(root, '.canvas-notes/anki.json'), 'utf8')) as { sent?: Record<string, unknown> }).sent ?? {}
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e
  }
  /** 笔记里嵌着、链着的可视化 → 那篇笔记（目录树里 HTML 挂到它下面，task-m552v） */
  const vizOf = new Map<string, string>()
  for (const f of out) {
    if (f.kind === 'html') {
      const m = /<meta\s+name="第几讲"\s+content="(\d+)"/.exec(await head(join(root, f.path)))
      if (m) f.lecture = Number(m[1])
    }
    if (f.kind !== 'pdf' && f.kind !== 'html') continue
    // 一个 PDF 一篇笔记：旁边那篇「<名字> 笔记.md」和里面问了几问（目录树里合成一行），PDF 还带问到第几页
    const note = notePathFor(f.path)
    if (!have.has(note)) continue
    const text = decodeNote(await readFile(join(root, note))).text
    const secs = parseReadingNote(text, note)
    for (const s of secs) if (s.viz && !vizOf.has(s.viz.path)) vizOf.set(s.viz.path, note)
    const items = secs.flatMap((s) => doubtItems(f.path, s))
    f.note = { path: note, asks: secs.reduce((n, s) => n + s.rounds, 0), ...(items.length && items.every((it) => sent[it.id]) ? { sent: true } : {}) }
    if (f.kind !== 'pdf') continue
    const p = parseProgress(prop(text.slice(0, 4096), '进度'))
    if (p) f.progress = p
  }
  for (const f of out) if (f.kind === 'html' && vizOf.has(f.path) && vizOf.get(f.path) !== f.note?.path) f.vizOf = vizOf.get(f.path)
  return out
}

/** 读 PDF 时记的完整对话（.canvas-notes/对话/ 里的 md，库里的路径）；没有这个文件夹是空的 */
async function convoNotes(root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (d: string) => {
    let ents
    try {
      ents = await readdir(join(root, d), { withFileTypes: true })
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' || (e as NodeJS.ErrnoException).code === 'ENOTDIR') return
      throw e
    }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue
      if (e.isDirectory()) await walk(`${d}/${e.name}`)
      else if (e.isFile() && /\.md$/i.test(e.name)) out.push(`${d}/${e.name}`)
    }
  }
  await walk(CONVO_DIR)
  return out
}

/** 一篇在用的附件：note 是库里的路径（完整对话的在 .canvas-notes/对话/ 下），uses 是它用到的库里的路径 */
export interface AttachUser {
  note: string
  uses: Set<string>
  /** uses 里文中真链着的（不算只是放在它附件文件夹里的） */
  refs: Set<string>
}

/**
 * 「这个附件谁在用」只在这里算：文件树「附件」筛选（哪篇在用、没有笔记的附件）和删笔记连图一起删（别的笔记也在用的留下）都用它。
 * 用的人：库里所有 md（listEntries 列出来的，附件/ 里的不算），加上读 PDF 时记的完整对话（.canvas-notes/对话/：
 * 以前的 PDF 笔记里「完整对话」还点得开，那里的截图删了对话就断图，task-1df7j）。
 * 一篇用的 = 它自己附件文件夹（附件/<笔记路径>/）里的（里面套着别的还在的笔记的附件文件夹时，那一层归那篇，attachOwner）
 * + 文中提到的（md 链接、[[嵌入]]、HTML 的 src、属性里的封面、白板卡片；写坏了的链接按名字认，宁可多认，format 的 fileRefs）。
 * files 是 listEntries 的结果
 */
export async function attachUsers(root: string, files: FileEntry[]): Promise<AttachUser[]> {
  const atts = files.filter((f) => f.kind !== 'dir' && f.path.startsWith(ATTACHMENTS_DIR + '/')).map((f) => f.path)
  const notes = files.filter((f) => f.kind === 'md' && !f.path.startsWith(ATTACHMENTS_DIR + '/')).map((f) => f.path)
  const noteSet = new Set(notes)
  const attSet = new Set(atts)
  const byName = fileNameIndex(atts)
  const ownerOf = new Map(atts.map((p) => [p, attachOwner(p, (n) => noteSet.has(n))]))
  const out: AttachUser[] = []
  for (const note of [...notes, ...(await convoNotes(root))]) {
    const text = decodeNote(await readFile(join(root, note))).text
    const refs = refHits(fileRefs(text, note), attSet, byName)
    // 链着的别的文件（PDF 之类）也记上：完整对话靠它找挂在哪份 PDF 的笔记下面（attachIndex）
    for (const p of linkedPaths(text, note)) refs.add(p)
    const uses = new Set([...atts.filter((p) => ownerOf.get(p) === note), ...refs])
    out.push({ note, uses, refs })
  }
  return out
}

const isConvo = (p: string) => p.startsWith(CONVO_DIR + '/')

/**
 * 「附件」筛选（CN-104）：每篇笔记用到的附件（attachUsers），和没有谁在用的附件。
 * 完整对话不进树：它用的图挂在那份 PDF 的笔记下面（对话开头「回到第 N 页」链着 PDF）；
 * PDF 或它的笔记不在了的单列一组（convos）。files 是 listEntries 的结果
 */
export async function attachIndex(root: string, files: FileEntry[]): Promise<AttachIndex> {
  const atts = files.filter((f) => f.kind !== 'dir' && f.path.startsWith(ATTACHMENTS_DIR + '/'))
  const byPath = new Map(atts.map((f) => [f.path, f]))
  /** PDF、HTML → 旁边那篇笔记 */
  const noteOf = new Map(files.flatMap((f) => (f.note ? [[f.path, f.note.path] as const] : [])))
  const used = new Set<string>()
  const mineOf = new Map<string, Set<string>>()
  /** 找不到挂处的图 → 用它的那份完整对话（双击打开它） */
  const convo = new Map<string, string>()
  const refs: Record<string, string[]> = {}
  const ref = (p: string, note: string) => {
    const l = (refs[p] ??= [])
    if (!l.includes(note)) l.push(note)
  }
  // PDF、网页旁边那篇配对笔记算用着它
  for (const [p, note] of noteOf) if (byPath.has(p)) ref(p, note)
  for (const u of await attachUsers(root, files)) {
    for (const p of u.refs) if (byPath.has(p)) ref(p, u.note)
    const mine = [...u.uses].filter((p) => byPath.has(p))
    if (!mine.length) continue
    for (const p of mine) used.add(p)
    const host = isConvo(u.note) ? [...u.uses].map((p) => noteOf.get(p)).find(Boolean) : u.note
    if (!host) {
      for (const p of mine) if (!convo.has(p)) convo.set(p, u.note)
      continue
    }
    const set = mineOf.get(host) ?? new Set<string>()
    for (const p of mine) set.add(p)
    mineOf.set(host, set)
  }
  const item = (p: string) => ({ path: p, bytes: byPath.get(p)!.bytes ?? 0 })
  const byName = (a: string, b: string) => a.localeCompare(b, 'zh-CN', { numeric: true })
  const notes: AttachIndex['notes'] = [...mineOf].map(([note, mine]) => {
    // 自己附件文件夹里的在前，文中用到的别处的在后
    const dir = attachmentDir(note) + '/'
    const own = (p: string) => (p.startsWith(dir) ? 0 : 1)
    return { note, items: [...mine].sort((a, b) => own(a) - own(b) || byName(a, b)).map(item) }
  })
  // 挂到了某篇笔记下面的不再单列
  const hung = new Set([...mineOf.values()].flatMap((s) => [...s]))
  const convos = [...convo.keys()].filter((p) => !hung.has(p)).sort(byName).map((p) => ({ ...item(p), convo: convo.get(p)! }))
  const orphans = atts.filter((f) => !used.has(f.path)).map((f) => ({ path: f.path, bytes: f.bytes ?? 0 }))
  return { notes, convos, orphans, refs, usage: await attachUsage(root) }
}

export function registerFiles(vault: () => Vault | null) {
  ipcMain.handle('files:all', async () => {
    const v = vault()
    if (!v) throw new Error('还没有打开库')
    // 数据库的记录文件夹记上几条、用它的那篇（目录树挂到那篇下面，「移到」不列它；task-5yp97）
    const [files, texts] = await Promise.all([listEntries(v.root), v.texts()])
    return markBases(files, texts, baseFoldersIn)
  })
  ipcMain.handle('files:attachments', async () => {
    const v = vault()
    if (!v) throw new Error('还没有打开库')
    return attachIndex(v.root, await listEntries(v.root))
  })
}
