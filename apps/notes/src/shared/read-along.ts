/**
 * 长期一起看的网页和笔记（2026-11-21 用户选方向 A「配成一对」，又说「那个书桌的功能也很好，也可以加上」：方向 B「存成书桌」；
 * task-kbnc0）。纯数据和纯函数：主进程、界面、网页预加载都用，不依赖 Electron。
 *
 * - 配成一对：笔记属性 `read-along: <网址前缀>`。整本书是网站根（`https://zh.d2l.ai/`，这个网站下的每一页都算，换章也接得上），
 *   只这一页是那一页的网址（去掉 #…）。网页网址去掉 #… 以后以它开头，就是这本书。
 * - 读到哪：库里 `.canvas-notes/读到哪.json`，一本书（read-along 的值）一条：读到的网址、那段的开头一句和前后各 32 个字、
 *   滚动比例（找不到那段时按它停）、那段上面的小标题（「读到 2.1.4. 索引和切片」）、书名、时间。跟着 Git 走（不单独提交，
 *   跟着下一次自动提交），换一台 Mac 打开接着读。按书记、不按笔记记：笔记改名、挪走不用跟着改；书桌里的网页标签是这本书时用同一份。
 * - 书桌：库里 `.canvas-notes/书桌/<名字>.json`，一张一个文件：中间开着哪几篇、右栏哪几个网页、各读到哪、左栏和网页开没开。
 */
import { safeName } from './file-name'

export const READ_ALONG_KEY = 'read-along'
export const READ_POS_FILE = '.canvas-notes/读到哪.json'
export const DESK_DIR = '.canvas-notes/书桌'

/** 网页上那一段：开头一句（最多 80 字）和前后各 32 个字（找回这一段用，网页改了还能模糊找回） */
export interface ReadAnchor {
  text: string
  before: string
  after: string
}

/** 网页上读到的地方（网页预加载量出来的） */
export interface PagePos extends ReadAnchor {
  url: string
  /** 那一段所在的滚动区滚到了几成（0–1）：找不到那段时按它停在差不多的地方 */
  ratio: number
  /** 那段上面最近的小标题（「2.1.4. 索引和切片」）；没有小标题的网页没有 */
  head?: string
  /** 网页的标题（document.title） */
  title?: string
}

/** 读到哪.json 里的一条：一本书读到哪 */
export interface ReadPos extends PagePos {
  /** 书名（「动手学深度学习」） */
  book?: string
  /** 什么时候记的（ISO） */
  at: string
}

export type ReadPositions = Record<string, ReadPos>

const ANCHOR_MAX = 80
const CONTEXT = 32

/** 网址去掉 #… */
export function stripHash(url: string): string {
  const i = url.indexOf('#')
  return i === -1 ? url : url.slice(0, i)
}

/** 整本书：这个网址所在的网站根（https://zh.d2l.ai/） */
export function bookPrefix(url: string): string {
  return new URL(url).origin + '/'
}

/** 只这一页：这一页的网址（去掉 #…） */
export const pagePrefix = (url: string) => stripHash(url)

/** 配的是整本书（网站根）还是只这一页 */
export function isWholeBook(prefix: string): boolean {
  try {
    const u = new URL(prefix)
    return u.pathname === '/' && !u.search
  } catch {
    return false
  }
}

/** 这个网页算不算这本书（网址去掉 #… 以后以前缀开头） */
export function inBook(prefix: string, url: string): boolean {
  if (!prefix || !/^https?:\/\//.test(url)) return false
  return stripHash(url).startsWith(prefix)
}

/** 网址对上了哪几本配好对的书（几篇配了同一本时都算） */
export function booksOf(prefixes: Iterable<string>, url: string): string[] {
  return [...new Set(prefixes)].filter((p) => inBook(p, url))
}

/** 这个属性值能不能当配对的网址 */
export function isPairUrl(v: string | undefined | null): v is string {
  return !!v && /^https?:\/\/[^\s/]+\//.test(v)
}

/** 小标题里的杂物：Sphinx 的「¶」、锚点的「#」、多余的空白 */
export function cleanHead(s: string): string {
  return s
    .replace(/[¶#]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const SEPS = /\s+[—–|·｜]\s+|\s+-\s+/

/** 网页标题分成几截（「2.1. 数据操作 — 动手学深度学习 2.0.0 documentation」） */
function titleParts(title: string): string[] {
  return title
    .split(SEPS)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 书名：网页标题最后一截（网站名），去掉 Sphinx 的「 2.0.0 documentation」这种尾巴；只有一截时用网站的域名
 * （「2.1. 数据操作 — 动手学深度学习 2.0.0 documentation」→「动手学深度学习」）
 */
export function bookTitle(pageTitle: string | undefined, url: string): string {
  const parts = titleParts(pageTitle ?? '')
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return url
    }
  })()
  if (parts.length < 2) return host
  const last = parts[parts.length - 1]!
    .replace(/\s+documentation$/i, '')
    .replace(/\s+v?\d+(?:\.\d+)+$/i, '')
    .trim()
  return last || host
}

/** 这一页叫什么：网页标题第一截（「2.1. 数据操作」） */
export function pageHead(pageTitle: string | undefined, url: string): string {
  const parts = titleParts(pageTitle ?? '')
  if (parts[0]) return parts[0]
  try {
    const u = new URL(url)
    return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? u.hostname)
  } catch {
    return url
  }
}

/** 显示用的网址：不写 https://，域名后面的路径照写 */
export const shortUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

/** 读回来的一条（手改过、合并冲突过的也不报错）：不对的扔掉 */
function cleanPos(raw: unknown): ReadPos | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const url = str(r.url, 4000)
  if (!/^https?:\/\//.test(url)) return null
  const ratio = Number(r.ratio)
  const pos: ReadPos = {
    url,
    text: str(r.text, 400),
    before: str(r.before, 200),
    after: str(r.after, 200),
    ratio: Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0,
    at: str(r.at, 40),
  }
  const head = str(r.head, 200)
  if (head) pos.head = head
  const title = str(r.title, 300)
  if (title) pos.title = title
  const book = str(r.book, 200)
  if (book) pos.book = book
  return pos
}

export function normalizePositions(raw: unknown): ReadPositions {
  const out: ReadPositions = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isPairUrl(k)) continue
    const p = cleanPos(v)
    if (p) out[k] = p
  }
  return out
}

/** 写进文件的样子：按书的网址排好、两格缩进、最后一个换行（每次只动变了的那几行） */
export function positionsJson(m: ReadPositions): string {
  const sorted = Object.fromEntries(
    Object.keys(m)
      .sort()
      .map((k) => [k, m[k]]),
  )
  return JSON.stringify(sorted, null, 2) + '\n'
}

/** 两次读到的是不是同一处（时间不算；滚动比例差不到 0.5% 也算同一处），一样就不重写文件 */
export function samePos(a: PagePos | undefined, b: PagePos | undefined): boolean {
  if (!a || !b) return a === b
  return a.url === b.url && a.text === b.text && a.before === b.before && a.after === b.after && (a.head ?? '') === (b.head ?? '') && Math.abs(a.ratio - b.ratio) < 0.005
}

// ---------------------------------------------------------------- 书桌

/** 书桌里的一个网页标签 */
export interface DeskTab {
  url: string
  title: string
  /** 读到哪（不是配好对的书时记在书桌自己这里） */
  pos?: PagePos
  /** 配好对的那本书（read-along 的值）：读到哪用 读到哪.json 那一份，书桌里不另记 */
  book?: string
}

export interface Desk {
  name: string
  /** 中间开着的几篇（库里的路径，按标签的先后） */
  notes: string[]
  /** 中间在前面的那篇 */
  active?: string
  web: DeskTab[]
  /** 右栏在前面的是第几个网页 */
  webActive?: number
  /** 样子：左栏开没开、右栏网页开没开、中间栏收没收（右栏几栏、多宽是这台 Mac 自己的布局，不记） */
  layout?: { left: boolean; web: boolean; center?: boolean }
  /** 开着时自动记下改动：读到哪、多开的标签 */
  auto: boolean
  /** 上次存（自动记下也算），ISO 时间 */
  saved: string
}

/** 这张书桌存在哪个文件 */
export const deskFile = (name: string) => `${DESK_DIR}/${safeName(name)}.json`

/** 书桌文件的名字（去掉文件夹和 .json） */
export const deskNameOfFile = (file: string) => file.slice(file.lastIndexOf('/') + 1).replace(/\.json$/i, '')

const isNotePath = (p: unknown): p is string => typeof p === 'string' && /\.md$/i.test(p) && !p.startsWith('/') && !p.split('/').includes('..')

function cleanPagePos(raw: unknown): PagePos | undefined {
  const p = cleanPos({ ...(raw as object), at: '' })
  if (!p) return undefined
  const { at: _at, book: _book, ...rest } = p
  return rest
}

export function normalizeDesk(raw: unknown, fallbackName: string): Desk {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const notes = Array.isArray(r.notes) ? [...new Set(r.notes.filter(isNotePath))] : []
  const web: DeskTab[] = []
  for (const t of Array.isArray(r.web) ? r.web : []) {
    if (!t || typeof t !== 'object') continue
    const x = t as Record<string, unknown>
    const url = str(x.url, 4000)
    if (!/^https?:\/\//.test(url)) continue
    const tab: DeskTab = { url, title: str(x.title, 300) }
    const pos = cleanPagePos(x.pos)
    if (pos) tab.pos = pos
    if (isPairUrl(x.book as string)) tab.book = x.book as string
    web.push(tab)
  }
  const d: Desk = { name: str(r.name, 80).trim() || fallbackName, notes, web, auto: r.auto !== false, saved: str(r.saved, 40) }
  if (isNotePath(r.active) && notes.includes(r.active)) d.active = r.active
  const wa = Number(r.webActive)
  if (Number.isInteger(wa) && wa >= 0 && wa < web.length) d.webActive = wa
  if (r.layout && typeof r.layout === 'object') {
    const l = r.layout as Record<string, unknown>
    d.layout = { left: l.left !== false, web: l.web !== false, ...(l.center === false ? { center: false } : {}) }
  }
  return d
}

/** 写进文件的样子（两格缩进、最后一个换行） */
export const deskJson = (d: Desk) => JSON.stringify(d, null, 2) + '\n'

/** 两张书桌除了「上次存」以外是不是一样（一样就不重写，免得 Git 里多出假改动） */
export function sameDesk(a: Desk, b: Desk): boolean {
  return deskJson({ ...a, saved: '' }) === deskJson({ ...b, saved: '' })
}

/** 「1 篇笔记 · 1 个网页」 */
export const deskSummary = (d: Pick<Desk, 'notes' | 'web'>) => `${d.notes.length} 篇笔记 · ${d.web.length} 个网页`

/** 笔记改名、挪走（map 给新路径，null 是删了、undefined 是没动）：书桌里的路径跟着换；没变返回 null */
export function remapDesk(d: Desk, map: (p: string) => string | null | undefined): Desk | null {
  let changed = false
  const notes = d.notes.flatMap((p) => {
    const to = map(p)
    if (to === undefined) return [p]
    changed = true
    return to === null ? [] : [to]
  })
  if (!changed) return null
  const active = d.active ? map(d.active) : undefined
  const next: Desk = { ...d, notes: [...new Set(notes)] }
  if (d.active) {
    const a = active === undefined ? d.active : active
    if (a && next.notes.includes(a)) next.active = a
    else delete next.active
  }
  return next
}

/** 书桌、读到哪在界面上要的几个口（preload/read-along.ts 交出来，挂在 window.cnRead） */
export interface CnReadApi {
  positions(): Promise<ReadPositions>
  /** 记一本书读到哪；一样的不写 */
  setPosition(book: string, pos: ReadPos): Promise<void>
  desks(): Promise<{ file: string; desk: Desk }[]>
  /** 存一张书桌：file 给了是改那一张（自动记下、更新），没给是新存一张（名字重了加「 2」）；返回存在哪个文件 */
  saveDesk(desk: Desk, file?: string): Promise<string>
  /** 改名：文件跟着改名；返回新文件 */
  renameDesk(file: string, name: string): Promise<string>
  /** 删掉一张，返回删之前的原文（撤回时原样放回） */
  removeDesk(file: string): Promise<string>
  /** 撤回删掉：原文放回那个文件 */
  restoreDesk(file: string, text: string): Promise<void>
}
