/**
 * 清理没用到的附件（2026-11-25 用户：「这里加一个一键清理没有用到的图片的按钮」）：附件/ 里每个文件到底有没有用，宁可少清不可误清。
 * 每个附件三种结果：used（库里哪个文字文件提到它，by 是哪几个）、unused（能清）、unsure（没有谁提到，但拿不准，why 写为什么，不清）。
 *
 * 认「用着」：库里所有文字文件都读（md 文档、白板（卡片正文、位置行）、PDF 和网页的配对笔记、数据库 .base 和 ```base 块、记录笔记、剪藏、
 * 读 PDF 的完整对话、MeetCaption 上课记录（录音、字幕、关键画面）、画布今日的 .canvas-tasks/、软件自己 .canvas-notes/ 里的 JSON、HTML、附件/ 里的文字文件），
 * 认里面的 md 链接和图片（相对路径、URL 编码、#page=、"标题"、尖括号）、[[双链]] / ![[嵌入]]（带不带扩展名、|尺寸、#页）、HTML 的 src / href
 * （带不带引号）、属性里的封面和图标、任何一段带扩展名的路径；写坏了的链接按名字认（format 的 fileRefs / refHits，NFC / NFD 一样认）。
 * 链着它所在的文件夹也算用着。5 MB 以上的文字文件不解析，按文件名（原样和 URL 编码）在里面找，找到就算用着。
 *
 * 拿不准、不清（why）：iPad 手写（附件/手写/）、网页里下载的（附件/下载/）、首页封面（附件/封面/）、所在文件夹归一个 PDF / 网页 / 视频（截图）、
 * 所在文件夹和库里哪个文件同名但不是它的笔记、像 MeetCaption 关键画面的（画面-HH.MM.SS.jpg）、1 分钟内刚加且还没提交的、Git 不管的（清了在软件里放不回来）。
 * 归一篇还在的笔记（附件/<笔记>/）但文中没用到的算没用到：粘了图又删掉那一行留下的就是这种，用户要清的正是它。
 * 不算附件、不列（@cn/format 的 isAppFile）：. 开头的（.DS_Store、附件/.obsidian/ 里的）、笔记旁边软件写的白板笔迹 附件/<白板>/笔迹.ink
 * （没有哪篇链着它，以前按「归一篇还在的白板、文中没用到」算成没用到，一清就把手写挪进了废纸篓）。读来找引用时照样都读。
 */
import * as git from '@cn/git'
import { RECYCLE_DIR } from '@cn/atomic'
import { ATTACHMENTS_DIR, attachOwner, decodeNote, type FileRef, fileNameIndex, fileRefs, isAppFile, refHits } from '@cn/format'
import { ipcMain, shell } from 'electron'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { AttachUse, UnsureWhy } from '../shared/attach'
import { COVER_DIR } from '../shared/home'
import { commitPendingUnder, commitTouched, testTrash } from './folder-ops'
import { putAttachments } from './note-attach'
import type { Vault } from './vault'

/** 不进去读的文件夹 */
const SKIP = new Set(['.git', 'node_modules', '.trash', '.DS_Store'])
/** 读来找引用的文字文件 */
const TEXT = /\.(md|markdown|mdx|txt|json|jsonl|canvas|base|ya?ml|html?|svg|xml|csv|tsv|css|js|mjs|ts|tex|org|opml|excalidraw|drawio|ipynb|rtf|vtt|srt)$/i
/** 比这大的文字文件不解析，按名字找 */
export const MAX_TEXT = 5 * 1024 * 1024
/** 这么久以内新加、还没提交的不清：可能是刚粘进来、引用它的那篇还没存（别的程序、AI 正在写）。提交过的（撤回、放回回来的）不算 */
export const RECENT_MS = 60_000
const FRAME = /^画面-\d{2}\.\d{2}\.\d{2}\.jpg$/i
const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/'))
const baseOf = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const stemOf = (p: string) => baseOf(p).replace(/\.[^.]+$/, '')
const nfc = (s: string) => s.normalize('NFC')

interface Walked {
  path: string
  bytes: number
  mtimeMs: number
  birthtimeMs: number
}

async function walk(root: string): Promise<Walked[]> {
  const out: Walked[] = []
  const go = async (dir: string) => {
    let ents
    try {
      ents = await readdir(dir ? join(root, dir) : root, { withFileTypes: true })
    } catch (e) {
      // 扫的时候文件夹刚被挪走
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return
      throw e
    }
    for (const e of ents) {
      if (SKIP.has(e.name)) continue
      const rel = dir ? `${dir}/${e.name}` : e.name
      // 崩溃残留的回收处：是没换上去的旧版，不算谁在用
      if (rel === RECYCLE_DIR) continue
      if (e.isDirectory()) await go(rel)
      else if (e.isFile()) {
        const st = await stat(join(root, rel)).catch((err: NodeJS.ErrnoException) => (err.code === 'ENOENT' ? null : Promise.reject(err)))
        if (st) out.push({ path: rel, bytes: st.size, mtimeMs: st.mtimeMs, birthtimeMs: st.birthtimeMs })
      }
    }
  }
  await go('')
  return out
}

/** 每个文字文件认到的引用：按修改时间和大小缓存（库里的文件变了树就重算一次，没变的不再读） */
const refCache = new Map<string, { mtimeMs: number; bytes: number; refs: FileRef[] }>()

async function refsOf(root: string, f: Walked): Promise<FileRef[]> {
  const key = join(root, f.path)
  const hit = refCache.get(key)
  if (hit && hit.mtimeMs === f.mtimeMs && hit.bytes === f.bytes) return hit.refs
  let buf: Buffer
  try {
    buf = await readFile(key)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
  const text = /\.(md|markdown|mdx)$/i.test(f.path) ? decodeNote(buf).text : buf.toString('utf8')
  const refs = fileRefs(text, f.path)
  refCache.set(key, { mtimeMs: f.mtimeMs, bytes: f.bytes, refs })
  return refs
}

/** Git 不管的（.gitignore 里的）：清了在「最近删掉的」里放不回来 */
async function ignoredOf(root: string, paths: string[]): Promise<Set<string> | null> {
  const out = new Set<string>()
  for (let i = 0; i < paths.length; i += 200) {
    const part = paths.slice(i, i + 200)
    try {
      const r = await git.git(root, ['check-ignore', '--', ...part])
      // 一行一个；名字里有引号、换行这类的 git 加引号转义（core.quotepath=false 时中文不转）
      for (const l of r.split('\n')) if (l) out.add(l.startsWith('"') ? (JSON.parse(l) as string) : l)
    } catch (e) {
      if (!(e instanceof git.GitError)) throw e
      // 退出码 1、什么都没写：这一批都不是 Git 不管的
      if (!e.stderr.trim()) continue
      if (/not a git repository/i.test(e.stderr)) return null
      throw e
    }
  }
  return out
}

/**
 * 附件/ 里每个附件（isAppFile 的不算）用没用：库里的相对路径 → 结果。now 给测试用
 */
export async function attachUsage(root: string, now = Date.now()): Promise<Record<string, AttachUse>> {
  const all = await walk(root)
  const atts = all.filter((f) => f.path.startsWith(ATTACHMENTS_DIR + '/') && !isAppFile(f.path))
  const out: Record<string, AttachUse> = {}
  if (!atts.length) return out
  const attSet = new Set(atts.map((f) => f.path))
  const byName = fileNameIndex(attSet)
  const by = new Map<string, string[]>()
  const usedBy = (p: string, f: string) => {
    const l = by.get(p)
    if (!l) by.set(p, [f])
    else if (!l.includes(f)) l.push(f)
  }
  /** 文中链着的文件夹（附件/<某处>/ 整个被链着：里面的都算用着） */
  const dirRefs = new Map<string, string>()
  const big: Walked[] = []
  for (const f of all) {
    if (!TEXT.test(f.path)) continue
    if (f.bytes > MAX_TEXT) {
      big.push(f)
      continue
    }
    const refs = await refsOf(root, f)
    for (const p of refHits(refs, attSet, byName)) if (p !== f.path) usedBy(p, f.path)
    for (const r of refs) for (const c of r.cands) if (c.startsWith(ATTACHMENTS_DIR + '/') && !dirRefs.has(nfc(c).replace(/\/+$/, ''))) dirRefs.set(nfc(c).replace(/\/+$/, ''), f.path)
  }
  const fileSet = new Set(all.map((f) => f.path))
  const isMd = (n: string) => fileSet.has(n)
  // 用户自己的文件（附件/ 和 . 开头的文件夹以外）：去掉扩展名的名字 → 那个文件（附件/手写/<文档名>/ 这种按名字归的）
  const stems = new Map<string, string>()
  for (const f of all) if (!f.path.startsWith(ATTACHMENTS_DIR + '/') && !f.path.split('/').some((s) => s.startsWith('.')) && !stems.has(stemOf(f.path))) stems.set(stemOf(f.path), f.path)
  const left: Walked[] = []
  for (const f of atts) {
    const users = by.get(f.path)
    if (users) {
      out[f.path] = { state: 'used', by: users.slice(0, 5), n: users.length, bytes: f.bytes }
      continue
    }
    // 它在的文件夹被链着
    const segs = nfc(f.path).split('/')
    let dirUser: string | undefined
    for (let n = segs.length - 1; n > 1 && !dirUser; n--) dirUser = dirRefs.get(segs.slice(0, n).join('/'))
    if (dirUser) {
      out[f.path] = { state: 'used', by: [dirUser], n: 1, bytes: f.bytes }
      continue
    }
    left.push(f)
  }
  // 大文字文件：按文件名找（原样、URL 编码两种）
  for (const b of big) {
    if (!left.length) break
    const buf = await readFile(join(root, b.path)).catch((e: NodeJS.ErrnoException) => (e.code === 'ENOENT' ? null : Promise.reject(e)))
    if (!buf) continue
    for (const f of left) {
      if (out[f.path]) continue
      const name = baseOf(f.path)
      if ([name, nfc(name), name.normalize('NFD'), encodeURIComponent(nfc(name)), encodeURI(nfc(name))].some((s) => buf.includes(s))) out[f.path] = { state: 'used', by: [b.path], n: 1, bytes: f.bytes }
    }
  }
  const rest = left.filter((f) => !out[f.path])
  const ignored = rest.length ? await ignoredOf(root, rest.map((f) => f.path)) : new Set<string>()
  const fresh = ignored ? await freshOf(root, rest.filter((f) => Math.max(f.mtimeMs, f.birthtimeMs || 0) > now - RECENT_MS).map((f) => f.path)) : new Set<string>()
  for (const f of rest) {
    const why = unsureWhy(f, { fresh, ignored, isMd, stems })
    out[f.path] = why ? { state: 'unsure', why, bytes: f.bytes } : { state: 'unused', bytes: f.bytes }
  }
  return out
}

/** 刚改过的这些里还没提交的（新粘进来的、改过的）：撤回、放回刚写回来的已经在 Git 里，不算 */
async function freshOf(root: string, paths: string[]): Promise<Set<string>> {
  if (!paths.length) return new Set()
  return new Set(git.parseStatus(await git.git(root, [...git.STATUS_ARGS, '--', ...paths])).map((s) => s.path))
}

function unsureWhy(f: Walked, o: { fresh: Set<string>; ignored: Set<string> | null; isMd: (n: string) => boolean; stems: Map<string, string> }): UnsureWhy | null {
  const p = f.path
  const under = (d: string) => p.startsWith(d + '/')
  if (under(`${ATTACHMENTS_DIR}/手写`)) return { k: 'hand' }
  if (under(`${ATTACHMENTS_DIR}/下载`)) return { k: 'download' }
  if (under(COVER_DIR)) return { k: 'cover' }
  if (FRAME.test(baseOf(p))) return { k: 'frame' }
  if (o.ignored === null) return { k: 'nogit' }
  if (o.fresh.has(p)) return { k: 'recent' }
  if (o.ignored.has(p)) return { k: 'ignored' }
  const note = attachOwner(p, o.isMd)
  if (!note) {
    // 附件/<PDF 路径>/、附件/<网页>/：PDF、网页的截图（讲解卡、问答可能还要）
    const owner = attachOwner(p, (n) => o.isMd(n.replace(/\.md$/i, '')))
    if (owner) return { k: 'owner', name: owner.replace(/\.md$/i, '') }
    const parent = dirOf(p)
    if (parent !== ATTACHMENTS_DIR) {
      const same = o.stems.get(baseOf(parent))
      if (same) return { k: 'stem', name: same }
    }
  }
  return null
}

/**
 * 清理：这些附件移到废纸篓、一次提交「清理没用到的附件 N 个」（底栏撤回 = 反向提交，「最近删掉的」里能放回原处）。
 * 移之前再查一遍：这会儿又有人用了的、拿不准的不动。返回那次提交、移了几个、没动的几个
 */
export async function cleanAttachments(v: Vault, pathsArg: unknown, put: (abs: string) => Promise<void>): Promise<{ commit: string | null; n: number; kept: number }> {
  if (!Array.isArray(pathsArg) || !pathsArg.length || pathsArg.some((p) => typeof p !== 'string' || !p.startsWith(ATTACHMENTS_DIR + '/') || p.split('/').includes('..'))) throw new Error('要清理的不对')
  const want = [...new Set(pathsArg as string[])]
  const use = await attachUsage(v.root)
  const go = want.filter((p) => use[p]?.state === 'unused')
  if (!go.length) return { commit: null, n: 0, kept: want.length }
  const goes = new Set(go)
  // 还没提交的（刚粘进来没提交的图）先提交一次：放回时才有那一版
  await commitPendingUnder(v.root, (p) => goes.has(p))
  const byDir = new Map<string, string[]>()
  for (const p of go) byDir.set(dirOf(p), [...(byDir.get(dirOf(p)) ?? []), p])
  for (const [dir, list] of byDir) await putAttachments(v, list, put, dir === ATTACHMENTS_DIR ? undefined : dir)
  const commit = await commitTouched(v.root, (p) => goes.has(p), `清理没用到的附件 ${go.length} 个`)
  return { commit, n: go.length, kept: want.length - go.length }
}

/** trashed：每移走一个说一声（库里的相对路径；正在答的 AI 那一轮不把它算成 AI 删的） */
export function registerAttachClean(getVault: () => Vault, changed: () => void, trashed: (rel: string) => void = () => {}) {
  ipcMain.handle('attach:clean', async (_e, paths: unknown) => {
    // 测试把「废纸篓」换成临时文件夹，不往用户真的废纸篓里放东西
    const dir = process.env.CN_TRASH_DIR
    const toTrash = dir ? testTrash(dir) : (abs: string) => shell.trashItem(abs)
    const v = getVault()
    const put = (abs: string) => {
      if (abs.startsWith(v.root + '/')) trashed(abs.slice(v.root.length + 1))
      return toTrash(abs)
    }
    try {
      return await cleanAttachments(v, paths, put)
    } finally {
      changed()
    }
  })
}
