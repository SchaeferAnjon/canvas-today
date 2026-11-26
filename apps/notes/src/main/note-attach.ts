/**
 * 一篇笔记的附件（见 shared/attach.ts）：列出来、删笔记时连同只有它在用的图一起移到废纸篓、撤回。
 * 撤回靠删之前在软件设置目录 trash-undo/<号>/ 里留的一份（废纸篓里的东西没法按路径拿回来）；软件下次启动时清掉。
 */
import { ATTACHMENTS_DIR, attachmentDir, decodeNote, imageRefs, isNoteSideFile, pickEmbed } from '@cn/format'
import * as git from '@cn/git'
import { ipcMain, shell } from 'electron'
import { mkdir, readdir, readFile, rename, rm, rmdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FileEntry } from '../shared/files'
import type { AttachItem, NoteAttachments, TrashResult } from '../shared/attach'
import { COVER_DIR } from '../shared/home'
import { attachUsers, listEntries } from './files'
import { pinNote, readPins, repin } from './pins'
import { PINS_FILE } from '../shared/sidebar'
import type { Vault } from './vault'
import { atomicCopy, atomicWrite } from '@cn/atomic'

function needNote(note: unknown): string {
  if (typeof note !== 'string' || !/\.md$/i.test(note) || note.startsWith('/') || note.split('/').some((s) => !s || s === '..')) throw new Error(`笔记不对：${String(note)}`)
  return note
}

/** 文件夹里所有文件（不算 . 开头的），库里的路径；没有这个文件夹是空的 */
async function filesUnder(v: Vault, dir: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (d: string) => {
    let ents
    try {
      ents = await readdir(v.abs(d), { withFileTypes: true })
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' || (e as NodeJS.ErrnoException).code === 'ENOTDIR') return
      throw e
    }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue
      if (e.isDirectory()) await walk(`${d}/${e.name}`)
      else if (e.isFile()) out.push(`${d}/${e.name}`)
    }
  }
  await walk(dir)
  return out
}

const sizeOf = (v: Vault, p: string) => stat(v.abs(p)).then((s) => (s.isFile() ? s.size : null), () => null)

/** 这个文件在 附件/<笔记>/ 里更深一层、归另一篇还在的笔记（「冰岛旅行.md」的文件夹里套着「冰岛旅行/ttravel.md」的） */
async function ownedDeeper(v: Vault, note: string, p: string): Promise<boolean> {
  const segs = p.slice(attachmentDir(note).length + 1).split('/').slice(0, -1)
  const base = note.replace(/\.md$/i, '')
  for (let n = segs.length; n > 0; n--) if (await stat(v.abs(`${base}/${segs.slice(0, n).join('/')}.md`)).then((s) => s.isFile(), () => false)) return true
  return false
}

/** files：listEntries 的结果（一次删好几篇时传进来，不每篇列一遍库） */
export async function noteAttachments(v: Vault, noteArg: unknown, shared: boolean, files?: FileEntry[]): Promise<NoteAttachments> {
  const note = needNote(noteArg)
  const text = decodeNote(await readFile(v.abs(note))).text
  const dir = attachmentDir(note)
  const inDir = (p: string) => p.startsWith(dir + '/')
  // 跟着这篇走的：自己文件夹里的，和放在 附件/ 别处、文中用到的（首页和文件夹的封面不算）
  const goesWith = (p: string) => inDir(p) || (p.startsWith(ATTACHMENTS_DIR + '/') && !p.startsWith(COVER_DIR + '/'))
  const items: AttachItem[] = []
  const seen = new Set<string>()
  let list = files
  const all = async () => (list ??= await listEntries(v.root))
  const refs: { path: string; where: string | null; offset: number | null }[] = imageRefs(text, note)
  // ![[图.png]]（导进来的、Obsidian 写法）：照显示时的找法定到哪个文件
  if (text.includes('![[')) {
    const paths = (await all()).filter((f) => f.kind !== 'dir').map((f) => f.path)
    for (const m of text.matchAll(/!\[\[([^\]|#\n]+)/g)) {
      const p = pickEmbed(paths, note, m[1]!.trim())
      if (p) refs.push({ path: p, where: null, offset: m.index! })
    }
  }
  for (const r of refs) {
    const bytes = await sizeOf(v, r.path)
    if (bytes === null || seen.has(r.path)) continue
    seen.add(r.path)
    items.push({ path: r.path, bytes, where: r.where, offset: r.offset, own: inDir(r.path), mine: goesWith(r.path) })
  }
  const own = (await filesUnder(v, dir)).sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
  for (const p of own) {
    if (seen.has(p) || (await ownedDeeper(v, note, p))) continue
    items.push({ path: p, bytes: (await sizeOf(v, p)) ?? 0, where: null, offset: null, own: true, mine: true })
  }
  if (shared && items.some((i) => i.mine)) {
    // 别的谁在用（别的笔记、读 PDF 的完整对话）：和文件树「附件」筛选同一套算法（files.ts attachUsers）
    const mine = new Set(items.filter((i) => i.mine).map((i) => i.path))
    for (const u of await attachUsers(v.root, await all())) {
      if (u.note === note) continue
      for (const p of u.uses) if (mine.has(p)) (items.find((i) => i.path === p)!.sharedWith ??= []).push(u.note)
    }
  }
  const dirExists = (await stat(v.abs(dir)).catch(() => null))?.isDirectory() ?? false
  return { dir, dirExists, items, bytes: items.reduce((s, i) => s + i.bytes, 0) }
}

/** 删掉以后空了的文件夹一层层往上收掉（到 附件/ 为止） */
async function pruneEmpty(v: Vault, dir: string) {
  for (let d = dir; d.includes('/'); d = dirname(d)) {
    try {
      const left = (await readdir(v.abs(d))).filter((n) => n !== '.DS_Store')
      if (left.length) return
      await rm(join(v.abs(d), '.DS_Store'), { force: true })
      await rmdir(v.abs(d))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw e
    }
  }
}

/**
 * 删一个文件夹时跟着走的附件：附件/<文件夹>/ 里的，加上文件夹里每篇文中用到、放在 附件/ 别处的；
 * 文件夹外面的笔记（和读 PDF 的完整对话）也在用的留下，首页和文件夹的封面不算。go 是要移走的，kept 是留下的几个
 */
export async function folderAttachments(v: Vault, folder: string): Promise<{ go: string[]; kept: number }> {
  const files = await listEntries(v.root)
  const under = (p: string) => p.startsWith(folder + '/')
  const own = `${ATTACHMENTS_DIR}/${folder}/`
  const cand = new Set(files.filter((f) => f.kind !== 'dir' && f.path.startsWith(own)).map((f) => f.path))
  // 白板笔迹（附件/<白板>/笔迹.ink）不在 listEntries 里（不算附件），但跟着它的白板走
  for (const p of await filesUnder(v, own.slice(0, -1))) if (isNoteSideFile(p)) cand.add(p)
  for (const f of files) {
    if (f.kind !== 'md' || !under(f.path)) continue
    for (const i of (await noteAttachments(v, f.path, false, files)).items) if (i.mine) cand.add(i.path)
  }
  if (!cand.size) return { go: [], kept: 0 }
  const used = new Set<string>()
  for (const u of await attachUsers(v.root, files)) if (!under(u.note)) for (const p of u.uses) if (cand.has(p)) used.add(p)
  const go = [...cand].filter((p) => !used.has(p) && !p.startsWith(COVER_DIR + '/')).sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
  return { go, kept: cand.size - go.length }
}

/**
 * 附件移到废纸篓：dir（附件/<文件夹>）里的全都要移时整个文件夹一起移（访达废纸篓里是一个文件夹，不是一堆散图），
 * 别的一个个移；移完空了的文件夹一层层收掉
 */
export async function putAttachments(v: Vault, paths: string[], put: (abs: string) => Promise<void>, dir?: string) {
  let left = paths
  if (dir) {
    const goes = new Set(paths)
    const inDir = await filesUnder(v, dir)
    if (inDir.length && inDir.every((p) => goes.has(p))) {
      await put(v.abs(dir))
      left = paths.filter((p) => !p.startsWith(dir + '/'))
      await pruneEmpty(v, dirname(dir))
    }
  }
  for (const p of left) await put(v.abs(p))
  for (const d of new Set(left.map((p) => dirname(p)))) await pruneEmpty(v, d)
}

/** files：移走的（这篇和跟着它走的图），当场提交用 */
export async function trashNoteWith(v: Vault, noteArg: unknown, withImages: unknown, stageRoot: string, put: (abs: string) => Promise<void>): Promise<TrashResult & { files: string[] }> {
  const note = needNote(noteArg)
  const a = withImages === true ? await noteAttachments(v, note, true) : null
  const images = a ? a.items.filter((i) => i.mine && !i.sharedWith?.length).map((i) => i.path) : []
  const kept = a ? a.items.filter((i) => i.mine && i.sharedWith?.length).length : 0
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const stage = join(stageRoot, id)
  const files = [note, ...images]
  for (const f of files) {
    await mkdir(dirname(join(stage, f)), { recursive: true })
    await atomicCopy(v.abs(f), join(stage, f))
  }
  const pinned = (await readPins(v)).includes(note)
  await atomicWrite(join(stage, '.删掉的.json'), JSON.stringify({ files, pinned }))
  for (const f of files) await put(v.abs(f))
  // 删空了的附件文件夹一层层收掉（自己的、别处的都一样，到 附件/ 为止）
  for (const d of new Set(images.map((p) => dirname(p)))) await pruneEmpty(v, d)
  await repin(v, note, null)
  return { id, images: images.length, kept, files }
}

/** 返回放回来的文件（原处已经有同名的、没放的不算） */
export async function undoTrash(v: Vault, id: unknown, stageRoot: string): Promise<string[]> {
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) throw new Error('撤回的号不对')
  const stage = join(stageRoot, id)
  let saved: { files: string[]; pinned: boolean }
  try {
    saved = JSON.parse(await readFile(join(stage, '.删掉的.json'), 'utf8'))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('撤回不了了：留的那份已经清掉（软件重开过）。去访达的废纸篓里找')
    throw e
  }
  const back: string[] = []
  for (const f of saved.files) {
    const to = v.abs(f)
    await mkdir(dirname(to), { recursive: true })
    // 原子拷：文件一出现就是完整的（看着库的监视、开着的标签不会读到拷了一半的空文件）；那里已经又有了一篇就不盖
    try {
      await atomicCopy(join(stage, f), to, { exclusive: true })
      back.push(f)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
  }
  if (saved.pinned) await pinNote(v, saved.files[0]!, true)
  await rm(stage, { recursive: true, force: true })
  return back
}

/** trashed：每移走一个文件说一声（库里的相对路径；正在答的 AI 那一轮不把它算成 AI 删的） */
export function registerNoteAttach(getVault: () => Vault, userData: string, changed: () => void, trashed: (rel: string) => void = () => {}) {
  const stageRoot = join(userData, 'trash-undo')
  // 上次开着时留的撤回用的那份：重开以后用不上了
  void rm(stageRoot, { recursive: true, force: true })
  // 测试把「废纸篓」换成临时文件夹，不往用户真的废纸篓里放东西
  const put = async (abs: string) => {
    const root = getVault().root
    if (abs.startsWith(root + '/')) trashed(abs.slice(root.length + 1))
    const dir = process.env.CN_TRASH_DIR
    if (dir) await rename(abs, join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${abs.split('/').pop()}`))
    else await shell.trashItem(abs)
  }
  ipcMain.handle('attach:of', (_e, note: unknown, shared: unknown) => noteAttachments(getVault(), note, shared === true))
  ipcMain.handle('attach:trash-note', async (_e, note: unknown, withImages: unknown) => {
    try {
      // 删之前把这篇（和它的图）没提交的改动先提交：确认框说「Git 里也留着这一版」，就得真留着刚打的字
      const v = getVault()
      const p = needNote(note)
      const dir = attachmentDir(p) + '/'
      // 连图一起删时：这些图没提交的也先提交（「Git 里也留着这一版」）
      const with_ = withImages === true ? new Set((await noteAttachments(v, p, false)).items.filter((i) => i.mine).map((i) => i.path)) : new Set<string>()
      const pending = (await git.status(v.root)).filter((s) => s.path === p || s.path.startsWith(dir) || with_.has(s.path) || s.path === PINS_FILE)
      if (pending.length) await git.commitPaths(v.root, pending.map((s) => s.path), git.describeChanges(pending))
      const { files, ...r } = await trashNoteWith(v, note, withImages, stageRoot, put)
      // 当场一次提交：笔记和跟着它走的图在同一次里（同删文件夹、PDF），不挂在工作区里等别的提交顺带进去（task-1df7j 那种）
      const gone = new Set(files)
      const done = (await git.status(v.root)).filter((s) => gone.has(s.path) || s.path === PINS_FILE).map((s) => s.path)
      if (done.length) await git.commitPaths(v.root, done, `移到废纸篓：${p}${r.images ? `（连同 ${r.images} 张图）` : ''}`)
      return r
    } finally {
      changed()
    }
  })
  ipcMain.handle('attach:undo', async (_e, id: unknown) => {
    try {
      // 放回来也当场一次提交（删的那次已经提交了，放回来的不留在工作区里）
      const v = getVault()
      const back = new Set(await undoTrash(v, id, stageRoot))
      const st = (await git.status(v.root)).filter((s) => back.has(s.path) || s.path === PINS_FILE).map((s) => s.path)
      const note = [...back].find((f) => /\.md$/i.test(f))
      if (st.length && note) await git.commitPaths(v.root, st, `撤回删除：${note}${back.size > 1 ? `（连同 ${back.size - 1} 张图）` : ''}`)
    } finally {
      changed()
    }
  })
}
