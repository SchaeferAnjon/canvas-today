/**
 * AI 在库里动手的那几样（2026-11-19：全能模式关着也能做）：新建笔记、新建文件夹、改名、挪动、删到废纸篓。
 * 全走软件自己的库操作（和文件树右键一样）：改名、挪动时 [[双链]]、相对链接、附件文件夹、置顶、左栏跟着改；删笔记连同只有它在用的附件。
 * 不自己提交：返回这一步碰过的路径，这一轮结束和 AI 别的改动一起提交一次（agent/index.ts），用户一键撤回。
 * 动手前先把要碰的文件上用户没提交的字单独提交（和 AI 改字一样），AI 那次提交里只有 AI 的改动，撤回才不带走用户的字。
 * 名字冲突、路径出了库、目标不存在都报一句说得清的话，AI 照着换个做法或者告诉用户。
 */
import * as git from '@cn/git'
import { ATTACHMENTS_DIR, attachmentDir, decodeNote, isAppFile } from '@cn/format'
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { safeName } from '../../shared/file-name'
import { checkFolderName } from '../../shared/folder-home'
import { LEFT_FILE } from '../../shared/left'
import { PINS_FILE } from '../../shared/sidebar'
import { commitPendingUnder, countFiles, fixedFolder, GITKEEP, moveManyNow, planMoveMany, planRelocate, relocateNow } from '../folder-ops'
import { relookAll } from '../left'
import { folderAttachments, noteAttachments, putAttachments, trashNoteWith } from '../note-attach'
import { repin, repinAll } from '../pins'
import type { Vault } from '../vault'
import { atomicWrite } from '@cn/atomic'

export interface OpsDeps {
  /** 真挪进废纸篓（测试换成临时文件夹） */
  put(abs: string): Promise<void>
  /** 删笔记前留一份的地方（软件设置目录 trash-undo/；AI 那次的撤回走 Git） */
  stage: string
  /** 一个文件挪了、改了名（读 PDF 的本机进度、AI 对话跟过去） */
  moved?(from: string, to: string): void
  /** 查过了、马上要删这篇 / 这个文件夹：开着的标签先关（编辑器接着存字会把删掉的建回来）。查不过（固定的文件夹、没有这篇）不调 */
  beforeTrash?(rel: string): Promise<void>
}

export interface Relocated {
  from: string
  to: string
  folder: boolean
  /** 链接跟着改了的笔记（新路径） */
  relinked: string[]
  /** 要提交的路径（旧的、新的、改了链接的、置顶、左栏） */
  touched: string[]
  /** 跟着这篇挪的数据库记录文件夹（挂在它下面的，task-5yp97） */
  with?: { from: string; to: string }[]
}

const SKIP = new Set(['.git', 'node_modules', '.trash', '.obsidian'])
const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const join2 = (dir: string, name: string) => (dir ? `${dir}/${name}` : name)
const baseOf = (p: string) => p.slice(p.lastIndexOf('/') + 1)
// 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
const where = (folder: string) => `「${folder || '库的最外层'}」`

async function kind(v: Vault, rel: string): Promise<'dir' | 'file' | null> {
  try {
    const st = await stat(v.abs(rel))
    return st.isDirectory() ? 'dir' : 'file'
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || (e as NodeJS.ErrnoException).code === 'ENOTDIR') return null
    throw e
  }
}

/**
 * AI 给的路径换成库里的相对路径：去掉开头的库路径、./、末尾的 /；出了库（..、/ 或 ~ 开头）说清楚。
 * empty：可以是空的（库的最外层）
 */
export function relPath(v: Vault, p: unknown, what: string, empty = false): string {
  if (p === undefined || p === null) {
    if (empty) return ''
    // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
    throw new Error(`缺参数 ${what}`)
  }
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (typeof p !== 'string') throw new Error(`参数 ${what} 要是字符串`)
  let s = p.trim().replace(/\\/g, '/')
  if (s === v.root || s === v.root + '/') s = ''
  else if (s.startsWith(v.root + '/')) s = s.slice(v.root.length + 1)
  s = s.replace(/^(\.\/)+/, '').replace(/\/+$/, '')
  if (s === '.' || s === '') {
    if (empty) return ''
    // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
    throw new Error(`缺参数 ${what}`)
  }
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (s.startsWith('/') || s.startsWith('~') || s.split('/').some((x) => x === '..')) throw new Error(`「${p}」在库外：只能动库里的笔记和文件夹（写相对库的路径，比如「课程/线代」）`)
  v.abs(s)
  return s
}

/** 一个已有的文件夹（空的是库的最外层） */
async function folderOf(v: Vault, p: unknown, what: string): Promise<string> {
  const f = relPath(v, p, what, true)
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (f && (await kind(v, f)) !== 'dir') throw new Error(`没有「${f}」这个文件夹。要先建就用 folder_create`)
  return f
}

/** 要动的那一样：文件夹，或者一篇笔记（没写 .md 也认） */
async function target(v: Vault, p: unknown): Promise<{ rel: string; dir: boolean }> {
  const rel = relPath(v, p, 'path')
  const k = await kind(v, rel)
  if (k === 'dir') return { rel, dir: true }
  if (k === 'file') return { rel, dir: false }
  if (!/\.md$/i.test(rel) && (await kind(v, rel + '.md')) === 'file') return { rel: rel + '.md', dir: false }
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  throw new Error(`没有「${rel}」。先用 notes_list 看看库里有哪些`)
}

/** 现在没提交、落在这几处的路径（这一步碰过的；删掉的、新建的都在） */
async function statusPaths(root: string, inside: (p: string) => boolean): Promise<string[]> {
  return (await git.status(root)).filter((s) => inside(s.path)).map((s) => s.path)
}

/** 库里写着这几个字的 md（改名前先提交它们上面用户没提交的字） */
async function mdWith(v: Vault, needle: string): Promise<Set<string>> {
  const out = new Set<string>()
  const walk = async (dir: string) => {
    for (const e of await readdir(dir ? v.abs(dir) : v.root, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue
      const rel = join2(dir, e.name)
      if (e.isDirectory()) await walk(rel)
      else if (e.isFile() && /\.md$/i.test(e.name) && decodeNote(await readFile(v.abs(rel))).text.includes(needle)) out.add(rel)
    }
  }
  await walk('')
  return out
}

/** 新建一篇：放进已有的文件夹；正文开头没有「# 标题」（也不是 frontmatter）就补上，和软件里新建的一样 */
export async function createNote(v: Vault, folderArg: unknown, titleArg: unknown, textArg: unknown): Promise<{ path: string; touched: string[] }> {
  const folder = await folderOf(v, folderArg, 'folder')
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (typeof titleArg !== 'string' || !titleArg.trim()) throw new Error('缺参数 title')
  const title = titleArg.trim().replace(/\.md$/i, '')
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (title.includes('/')) throw new Error('标题里不能有 /：要放进文件夹就写在 folder 里')
  const name = safeName(title)
  const rel = join2(folder, `${name}.md`)
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (await kind(v, rel)) throw new Error(`${where(folder)}里已经有一篇叫「${name}」了（${rel}）。换个名字，或者用 note_write 改写它`)
  const text = typeof textArg === 'string' ? textArg : ''
  const body = /^(# |---\n)/.test(text.trimStart()) ? text.replace(/\n*$/, '\n') : `# ${name}\n\n${text.trim() ? text.trim() + '\n' : ''}`
  const path = await v.create(folder, name, body)
  return { path, touched: [path] }
}

/** 新建文件夹：放一个看不见的 .gitkeep（Git 才记得住空文件夹，和文件树里新建一样） */
export async function makeFolder(v: Vault, parentArg: unknown, nameArg: unknown): Promise<{ path: string; touched: string[] }> {
  const parent = await folderOf(v, parentArg, 'parent')
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (typeof nameArg !== 'string' || !nameArg.trim()) throw new Error('缺参数 name')
  const name = nameArg.trim()
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (name.includes('/')) throw new Error('名字里不能有 /：要建在别的文件夹里就写在 parent 里')
  const bad = checkFolderName(name)
  if (bad) throw new Error(bad)
  const f = join2(parent, name)
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (await kind(v, f)) throw new Error(`${where(parent)}里已经有「${name}」了`)
  await mkdir(v.abs(f), { recursive: true })
  await atomicWrite(v.abs(`${f}/${GITKEEP}`), '')
  return { path: f, touched: [`${f}/${GITKEEP}`] }
}

/** 改名：一篇笔记（库里的 [[旧名]] 换成新名，开头「# 旧名」跟着改，附件文件夹跟过去）或一个文件夹（写着它路径的链接、置顶、左栏跟着改） */
export async function renamePath(v: Vault, deps: OpsDeps, pathArg: unknown, nameArg: unknown): Promise<Relocated> {
  const { rel, dir } = await target(v, pathArg)
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (typeof nameArg !== 'string' || !nameArg.trim()) throw new Error('缺参数 name')
  const asked = nameArg.trim().replace(/\.md$/i, '')
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (asked.includes('/')) throw new Error('新名字里不能有 /：要挪到别的文件夹用 note_move')
  const parent = parentOf(rel)
  if (dir) {
    // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
    if (fixedFolder(rel)) throw new Error(`「${rel}」是固定的文件夹，不改名`)
    const bad = checkFolderName(asked)
    if (bad) throw new Error(bad)
    const to = join2(parent, asked)
    // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
    if (to === rel) throw new Error('名字没变')
    // 只改大小写（ecp → ECP）在 Mac 上是同一个文件夹，不算重名
    // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
    if (to.toLowerCase() !== rel.toLowerCase() && (await kind(v, to))) throw new Error(`${where(parent)}里已经有「${asked}」了`)
    const plan = await planRelocate(v, rel, to)
    await commitPendingUnder(v.root, plan.touches)
    const relinked = await relocateNow(v, plan, (f, t) => {
      v.markMoved(f, t)
      deps.moved?.(f, t)
    })
    const touched = await statusPaths(v.root, (p) => plan.inFolder(p) || relinked.includes(p) || p === PINS_FILE || p === LEFT_FILE)
    return { from: rel, to, folder: true, relinked, touched }
  }
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (!/\.md$/i.test(rel)) throw new Error(`「${rel}」不是笔记：只改笔记和文件夹的名字`)
  const name = safeName(asked)
  const to = join2(parent, `${name}.md`)
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (to === rel) throw new Error('名字没变')
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (to.toLowerCase() !== rel.toLowerCase() && (await kind(v, to))) throw new Error(`${where(parent)}里已经有一篇叫「${name}」了（${to}）`)
  const old = baseOf(rel).replace(/\.md$/i, '')
  // 写着它名字的（[[旧名]]、[字](旧名.md)）：改名时链接跟着改，先把它们上面没提交的字提交掉
  const linking = await mdWith(v, old)
  const att = attachmentDir(rel) + '/'
  const touches = (p: string) => p === rel || p.startsWith(att) || linking.has(p) || p === PINS_FILE
  await commitPendingUnder(v.root, touches)
  // 第一行是「# 旧名」就跟着改（和左栏、目录树里改名一样）
  const cur = await v.read(rel)
  if (!cur.readOnly && cur.text.startsWith(`# ${old}\n`)) {
    const w = await v.write(rel, `# ${name}\n` + cur.text.slice(old.length + 3), cur.text)
    // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
    if (!w.ok) throw new Error('这篇刚被改过，再试一次')
  }
  const got = await v.rename(rel, name)
  await repin(v, rel, got)
  deps.moved?.(rel, got)
  const newAtt = attachmentDir(got) + '/'
  const touched = await statusPaths(v.root, (p) => touches(p) || p === got || p.startsWith(newAtt))
  return { from: rel, to: got, folder: false, relinked: [...linking].filter((p) => p !== rel), touched }
}

/** 挪进另一个文件夹（空的是库的最外层）：一篇笔记连它的附件，或一个文件夹连里面的；库里指向它们的相对链接、置顶、左栏跟着改 */
export async function movePath(v: Vault, deps: OpsDeps, pathArg: unknown, folderArg: unknown): Promise<Relocated> {
  const { rel, dir } = await target(v, pathArg)
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (!dir && !/\.md$/i.test(rel)) throw new Error(`「${rel}」不是笔记：只挪笔记和文件夹（PDF、HTML 在文件树里挪）`)
  const folder = await folderOf(v, folderArg, 'folder')
  const base = baseOf(rel)
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (parentOf(rel) === folder) throw new Error(`「${base}」已经在${where(folder)}里了`)
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (dir && (folder === rel || folder.startsWith(rel + '/'))) throw new Error(`不能把「${base}」挪进它自己里面`)
  const dest = join2(folder, base)
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (await kind(v, dest)) throw new Error(`${where(folder)}里已经有「${base.replace(/\.md$/i, '')}」了（${dest}）`)
  const plan = await planMoveMany(v, [rel], folder)
  await commitPendingUnder(v.root, plan.touches)
  const linked = [...plan.candidates]
  const { moves, touched: inside } = await moveManyNow(v, plan, (f, t) => {
    v.markMoved(f, t)
    deps.moved?.(f, t)
  })
  const to = moves[0]?.to ?? dest
  const touched = await statusPaths(v.root, inside)
  const carried = moves.filter((m) => m.with).map(({ from, to }) => ({ from, to }))
  return { from: rel, to, folder: dir, relinked: linked.filter((p) => touched.includes(p)), touched, ...(carried.length ? { with: carried } : {}) }
}

/** 删到废纸篓：一篇笔记连同只有它在用的附件（别的笔记也在用的留着），或一个文件夹整个连同里面笔记的附件；置顶、左栏跟着拿掉 */
export async function trashPath(v: Vault, deps: OpsDeps, pathArg: unknown): Promise<{ path: string; folder: boolean; files: number; images: number; kept: number; touched: string[] }> {
  const { rel, dir } = await target(v, pathArg)
  if (dir) {
    // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
    if (fixedFolder(rel)) throw new Error(`「${rel}」是固定的文件夹，不能删`)
    const files = await countFiles(v, rel)
    // 里面笔记的附件一起（和文件树删文件夹同一套：folderAttachments，外面的笔记也在用的留下）
    const att = await folderAttachments(v, rel)
    const goes = new Set(att.go)
    const inside = (p: string) => p === rel || p.startsWith(rel + '/') || goes.has(p) || p === PINS_FILE || p === LEFT_FILE
    await deps.beforeTrash?.(rel)
    await commitPendingUnder(v.root, inside)
    await deps.put(v.abs(rel))
    await putAttachments(v, att.go, deps.put, `${ATTACHMENTS_DIR}/${rel}`)
    await repinAll(v, (p) => (p === rel || p.startsWith(rel + '/') ? null : undefined))
    await relookAll(v, (p) => (p === rel || p.startsWith(rel + '/') ? null : undefined))
    return { path: rel, folder: true, files, images: att.go.length, kept: att.kept, touched: await statusPaths(v.root, inside) }
  }
  // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
  if (!/\.md$/i.test(rel)) throw new Error(`「${rel}」不是笔记：只删笔记和文件夹（PDF、HTML 在文件树里删）`)
  const own = attachmentDir(rel) + '/'
  const mine = new Set((await noteAttachments(v, rel, false)).items.filter((i) => i.mine).map((i) => i.path))
  const inside = (p: string) => p === rel || p.startsWith(own) || mine.has(p) || p === PINS_FILE
  await deps.beforeTrash?.(rel)
  await commitPendingUnder(v.root, inside)
  const r = await trashNoteWith(v, rel, true, deps.stage, deps.put)
  return { path: rel, folder: false, files: 1, images: r.images, kept: r.kept, touched: await statusPaths(v.root, inside) }
}

/** 库里的文件夹（不进 . 开头的、附件/），给 notes_list 列出来 */
export async function listFolders(v: Vault): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string) => {
    for (const e of await readdir(dir ? v.abs(dir) : v.root, { withFileTypes: true })) {
      const rel = join2(dir, e.name)
      // 不翻：回给 AI 的工具结果（附件是磁盘上的文件夹名）
      if (!e.isDirectory() || isAppFile(rel) || SKIP.has(e.name) || (!dir && e.name === '附件')) continue
      out.push(rel)
      await walk(rel)
    }
  }
  await walk('')
  return out.sort()
}
