/**
 * 读 Chrome 用户资料里的书签、历史和已装的插件。只读：数据库和插件都先拷一份出来再读，Chrome 那边一个字节不动。
 * flattenBookmarks、historyRowsToEntries 的写法来自用户自己在 Dispatch IDE 里的实现（patches/browser-import-chrome.patch，MIT）。
 */
import { copyFile, cp, mkdtemp, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultChromeRoot } from '@cn/web-session'

/** Chrome 的用户数据目录；测试时用 CN_CHROME_ROOT 指向一个假的 */
export const chromeRoot = () => process.env.CN_CHROME_ROOT ?? defaultChromeRoot()

export interface ChromeBookmark {
  title: string
  url: string
  /** 「书签栏 / 工作」 */
  folder: string
}

export interface ChromeHistoryRow {
  url: string
  title: string | null
  visit_count: number | bigint
  last_visit_time: number | bigint
}

export interface ChromeHistoryEntry {
  url: string
  title: string
  visits: number
  lastVisit: number
}

interface BookmarkNode {
  type?: string
  name?: string
  url?: string
  children?: BookmarkNode[]
}

/** Chrome 的根文件夹换成中文名（和中文 Chrome 里显示的一样） */
export const ROOT_NAMES: Record<string, string> = { bookmark_bar: '书签栏', other: '其他书签', synced: '移动设备书签' }

/** Bookmarks 文件里所有 http(s) 书签和它所在的文件夹，同一个网址只留一个，顺序和 Chrome 一样 */
export function flattenBookmarks(file: unknown): ChromeBookmark[] {
  const roots = (file as { roots?: Record<string, BookmarkNode> } | undefined)?.roots
  if (!roots || typeof roots !== 'object') return []
  const out: ChromeBookmark[] = []
  const seen = new Set<string>()
  const walk = (node: BookmarkNode, folder: string, depth: number) => {
    if (depth > 64 || !node || typeof node !== 'object') return
    if (node.type === 'url' && typeof node.url === 'string') {
      if (/^https?:\/\//i.test(node.url) && !seen.has(node.url)) {
        seen.add(node.url)
        out.push({ title: typeof node.name === 'string' && node.name ? node.name : node.url, url: node.url, folder })
      }
      return
    }
    if (!Array.isArray(node.children)) return
    for (const child of node.children) {
      const sub = child?.type === 'folder' ? `${folder} / ${String(child.name ?? '').replace(/\s*\/\s*/g, '／')}` : folder
      walk(child, sub, depth + 1)
    }
  }
  for (const key of ['bookmark_bar', 'other', 'synced']) {
    const root = roots[key]
    if (root) walk(root, ROOT_NAMES[key]!, 0)
  }
  return out
}

const EPOCH_OFFSET_S = 11644473600

export function historyRowsToEntries(rows: readonly ChromeHistoryRow[], max: number): ChromeHistoryEntry[] {
  const out: ChromeHistoryEntry[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (out.length >= max) break
    if (typeof row.url !== 'string' || !/^https?:\/\//i.test(row.url) || seen.has(row.url)) continue
    seen.add(row.url)
    const t = BigInt(row.last_visit_time)
    out.push({
      url: row.url,
      title: row.title ?? '',
      visits: Number(row.visit_count) || 0,
      lastVisit: t > 0n ? Math.round((Number(t / 1000n) / 1000 - EPOCH_OFFSET_S) * 1000) : 0,
    })
  }
  return out
}

function profileDir(profileId: string): string {
  if (!/^[\w .-]+$/.test(profileId) || profileId.includes('..')) throw new Error('Chrome 用户名不对')
  return join(chromeRoot(), profileId)
}

export async function readChromeBookmarks(profileId: string): Promise<ChromeBookmark[]> {
  try {
    return flattenBookmarks(JSON.parse(await readFile(join(profileDir(profileId), 'Bookmarks'), 'utf8')))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new Error('Chrome 的书签文件读不了')
  }
}

export const MAX_HISTORY = 5000

export async function readChromeHistory(profileId: string): Promise<ChromeHistoryEntry[]> {
  const db = join(profileDir(profileId), 'History')
  try {
    await stat(db)
  } catch {
    return []
  }
  // Chrome 开着时库是锁着的：拷一份出来读
  const work = await mkdtemp(join(tmpdir(), 'cn-chrome-history-'))
  try {
    const copy = join(work, 'History')
    await copyFile(db, copy)
    for (const suffix of ['-wal', '-journal']) await copyFile(db + suffix, copy + suffix).catch(() => undefined)
    const { DatabaseSync } = await import('node:sqlite')
    const sql = new DatabaseSync(copy, { readOnly: true })
    try {
      const stmt = sql.prepare(
        `SELECT url, title, visit_count, last_visit_time FROM urls WHERE hidden = 0 AND (url LIKE 'http://%' OR url LIKE 'https://%') ORDER BY last_visit_time DESC LIMIT ${MAX_HISTORY * 2}`,
      )
      stmt.setReadBigInts(true)
      return historyRowsToEntries(stmt.all() as unknown as ChromeHistoryRow[], MAX_HISTORY)
    } finally {
      sql.close()
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

// ---------- 插件 ----------

export interface ChromeExtension {
  id: string
  version: string
  /** 解压好的插件文件夹（Chrome 那边的，只读） */
  dir: string
  manifest: Manifest
  name: string
  /** Chrome 里是关着的 */
  disabledInChrome: boolean
}

export interface Manifest {
  name?: string
  version?: string
  manifest_version?: number
  default_locale?: string
  permissions?: unknown[]
  optional_permissions?: unknown[]
  action?: unknown
  browser_action?: unknown
  page_action?: unknown
  theme?: unknown
  app?: unknown
  side_panel?: unknown
  chrome_url_overrides?: unknown
  [k: string]: unknown
}

/** 版本号按数字比：1.10 比 1.9 新 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[._]/).map((x) => Number(x) || 0)
  const pb = b.split(/[._]/).map((x) => Number(x) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** 插件名字常是 __MSG_appName__，要到 _locales 里查；先中文，再插件默认语言，再英文 */
export async function localizedName(dir: string, manifest: Manifest): Promise<string> {
  const raw = typeof manifest.name === 'string' ? manifest.name : ''
  const m = /^__MSG_(.+)__$/.exec(raw)
  if (!m) return raw
  for (const loc of ['zh_CN', manifest.default_locale, 'en', 'en_US']) {
    if (!loc) continue
    try {
      const messages = JSON.parse(stripBom(await readFile(join(dir, '_locales', loc, 'messages.json'), 'utf8'))) as Record<string, { message?: string }>
      const hit = Object.entries(messages).find(([k]) => k.toLowerCase() === m[1]!.toLowerCase())
      if (hit?.[1].message) return hit[1].message
    } catch {
      // 这个语言没有，换下一个
    }
  }
  return raw
}

const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)

export async function readManifest(dir: string): Promise<Manifest> {
  return JSON.parse(stripBom(await readFile(join(dir, 'manifest.json'), 'utf8'))) as Manifest
}

/** Chrome 某个用户装的插件：每个插件取最新的版本文件夹；主题和老式应用不算 */
export async function listChromeExtensions(profileId: string): Promise<ChromeExtension[]> {
  const base = join(profileDir(profileId), 'Extensions')
  let ids: string[]
  try {
    ids = await readdir(base)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
  const disabled = await disabledInChrome(profileId)
  const out: ChromeExtension[] = []
  for (const id of ids) {
    if (!/^[a-p]{32}$/.test(id)) continue
    let versions: string[]
    try {
      versions = (await readdir(join(base, id))).filter((v) => !v.startsWith('.'))
    } catch {
      continue
    }
    const version = versions.sort(compareVersions).pop()
    if (!version) continue
    const dir = join(base, id, version)
    let manifest: Manifest
    try {
      manifest = await readManifest(dir)
    } catch {
      continue
    }
    if (manifest.theme || manifest.app) continue
    out.push({ id, version: String(manifest.version ?? version), dir, manifest, name: (await localizedName(dir, manifest)) || id, disabledInChrome: disabled.has(id) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}

/** Preferences 里 state 为 0、或有 disable_reasons 的是在 Chrome 里关着的 */
async function disabledInChrome(profileId: string): Promise<Set<string>> {
  const out = new Set<string>()
  for (const f of ['Secure Preferences', 'Preferences']) {
    try {
      const prefs = JSON.parse(await readFile(join(profileDir(profileId), f), 'utf8')) as { extensions?: { settings?: Record<string, { state?: number; disable_reasons?: unknown }> } }
      for (const [id, s] of Object.entries(prefs.extensions?.settings ?? {})) {
        const reasons = s.disable_reasons
        if (s.state === 0 || (Array.isArray(reasons) ? reasons.length > 0 : typeof reasons === 'number' && reasons > 0)) out.add(id)
      }
    } catch {
      // 没有这个文件或读不懂：当作都开着
    }
  }
  return out
}

/** 把插件文件夹拷到 dest（先拷到旁边再换名，拷一半不会留下坏的） */
export async function copyExtension(src: string, dest: string): Promise<void> {
  const tmp = `${dest}.copying-${process.pid}`
  await rm(tmp, { recursive: true, force: true })
  await cp(src, tmp, { recursive: true, dereference: false, errorOnExist: false })
  await rm(dest, { recursive: true, force: true })
  await rename(tmp, dest)
}
