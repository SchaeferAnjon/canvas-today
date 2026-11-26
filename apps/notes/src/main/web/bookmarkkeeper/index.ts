/**
 * 新网页标签跑 BookmarkKeeper 自己的新标签页（主进程这半）：
 * - cn-ext://bookmarkkeeper/ 原样提供插件的文件（从哪来见 source.ts），/_favicon/ 给网站小图标（Chrome 的 favicon 接口）；
 * - 插件页面调的 chrome.* 由网页预加载（preload/ext-page.ts）转到这里：
 *   bookmarks → 内置浏览器的书签表（bookmark-tree.ts），tabs → 网页标签（界面报上来的），storage → 插件自己的存储文件，
 *   runtime.sendNativeMessage → 快捷书签仓库（quick-store.ts，iCloud 里 QuickLinks/ 的 BKCore 格式），
 *   跨域的 fetch（失效链接检测、AI 整理）→ 主进程替它发；
 * - 只有我们窗口里、正开着 cn-ext:// 页面的网页能调这些。
 */
import { codiconSvg } from '@cn/design/codicon-svg'
import { app, type BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, net, type Session, type WebContents } from 'electron'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { EXT_ORIGIN, EXT_SCHEME, isExtUrl, NEWTAB_URL, type NewTabInfo, type TabMirror } from '../../../shared/bookmarkkeeper'
import { type ExtTheme, sanitizeExtTheme } from '../../../shared/ext-theme'
import { chromeRoot } from '../chrome-data'
import { ChromeFavicons, type Icon, iconLinks, iconOk, NotedIcons } from '../favicon-source'
import type { Bookmarks } from '../library'
import { BookmarkTree } from './bookmark-tree'
import { ICLOUD_CONTAINER, machineIdFrom, QuickBridge } from './quick-store'
import { findSource, type Source } from './source'
import { E2E } from '../../test-mode'
import { atomicWriteSync } from '@cn/atomic'

interface Deps {
  ses: Session
  bookmarks: Bookmarks
  window(): BrowserWindow | null
  /** 我们窗口里所有开着的网页 */
  webviews(): WebContents[]
  isOurWebview(wc: WebContents): boolean
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
}

/** 网站没有图标时给的地球（Codicons globe，中性灰），不用首字母图标 */
const GLOBE = codiconSvg('globe', { size: 64, color: '#8E8E93' })

let deps: Deps
let source: Source | null = null
let tree: BookmarkTree
let quick: QuickBridge
let tabs: TabMirror[] = []
/** 网页标签 id（字符串）↔ 给插件看的数字 id */
const tabNums = new Map<string, number>()
let nextTabNum = 1
const storageFile = () => join(app.getPath('userData'), 'web', 'bookmarkkeeper', 'storage.json')
type Storage = { local: Record<string, unknown>; sync: Record<string, unknown> }
let storage: Storage | null = null
const aborts = new Map<string, AbortController>()
/** 网页报上来的网站图标：网站 → 图标网址（存在 userData/web/icons.json，重开软件还在） */
let notedIcons: NotedIcons | null = null
const noted = () => (notedIcons ??= new NotedIcons(join(app.getPath('userData'), 'web', 'icons.json')))
/** Chrome 自己的图标库；测试实例没指定假的 Chrome（CN_CHROME_ROOT）时不读，不碰真的 Chrome */
const chromeIcons = new ChromeFavicons(() => (process.env.CN_E2E === '1' && !process.env.CN_CHROME_ROOT ? null : chromeRoot()))
const iconCache = new Map<string, Promise<Icon | null>>()

const sendApp = (channel: string, ...args: unknown[]) => deps.window()?.webContents.send(channel, ...args)

/** 发给每个开着插件页面的网页 */
function broadcast(ev: Record<string, unknown>, except?: WebContents) {
  for (const wc of deps.webviews()) if (wc !== except && isExtUrl(wc.getURL())) wc.send('ext:event', ev)
}

/** 书签变了（不管是插件改的、星星改的还是导入的）：插件页面跟着刷新 */
export function notifyBookmarksChanged() {
  if (deps) broadcast({ type: 'bookmarks' })
}

/** 插件页面才能调：我们窗口里的网页，当前页面是 cn-ext:// */
function check(e: IpcMainInvokeEvent | IpcMainEvent): WebContents {
  if (!deps.isOurWebview(e.sender) || !isExtUrl(e.senderFrame?.url)) throw new Error('只有书签管家的页面能调')
  return e.sender
}

// ---------------------------------------------------------------- 文件

function serveFile(url: URL): Response | Promise<Response> {
  if (url.pathname === '/_favicon/' || url.pathname === '/_favicon') return favicon(url.searchParams.get('pageUrl') ?? '')
  if (!source) return new Response('没找到 BookmarkKeeper', { status: 404 })
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '')
  const abs = join(source.dir, rel)
  if (rel.startsWith('..') || !abs.startsWith(source.dir + sep)) return new Response('不认识的文件', { status: 404 })
  const type = MIME[extname(abs).toLowerCase()]
  if (!type) return new Response('不认识的文件', { status: 404 })
  return net.fetch(pathToFileURL(abs).toString()).then(
    async (r) => (r.ok ? new Response(await r.arrayBuffer(), { headers: { 'content-type': type, 'cache-control': 'no-cache' } }) : new Response('没有这个文件', { status: 404 })),
    () => new Response('没有这个文件', { status: 404 }),
  )
}

/** Chrome 的 _favicon 接口：网页报过的图标 → Chrome 的图标库 → 网页里写的图标 → 网站的 /favicon.ico → 地球（顺序和为什么见 favicon-source.ts） */
function favicon(pageUrl: string): Promise<Response> {
  let origin = ''
  let host = ''
  try {
    const u = new URL(pageUrl)
    if (u.protocol === 'http:' || u.protocol === 'https:') ({ origin, host } = u)
  } catch {
    // 不是网址：给地球
  }
  const globe = () => new Response(GLOBE, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=3600' } })
  if (!origin) return Promise.resolve(globe())
  let p = iconCache.get(origin)
  if (!p) {
    p = loadIcon(pageUrl, origin, host)
    iconCache.set(origin, p)
  }
  return p.then((icon) => (icon ? new Response(new Uint8Array(icon.body), { headers: { 'content-type': icon.type, 'cache-control': 'max-age=3600' } }) : globe()))
}

async function loadIcon(pageUrl: string, origin: string, host: string): Promise<Icon | null> {
  const n = noted().get(host)
  const fromPage = n ? await fetchIcon(n) : null
  if (fromPage) return fromPage
  const fromChrome = await chromeIcons.lookup(pageUrl).catch((e: Error) => (console.warn('[favicon] Chrome 的图标库读不了', e.message), null))
  if (fromChrome) return fromChrome
  for (const page of [...new Set([pageUrl, origin + '/'])]) {
    for (const link of iconLinks(await fetchHtml(page), page)) {
      const icon = await fetchIcon(link)
      if (icon) return icon
    }
  }
  return fetchIcon(origin + '/favicon.ico')
}

/** 取一张图标并验过（画不出来的、其实是网页的都不算），5 秒没回就算了 */
async function fetchIcon(url: string): Promise<Icon | null> {
  if (url.startsWith('data:image/')) {
    const m = /^data:(image\/[\w+.-]+)(;base64)?,(.*)$/s.exec(url)
    if (!m) return null
    const body = m[2] ? Buffer.from(m[3]!, 'base64') : Buffer.from(decodeURIComponent(m[3]!))
    const type = iconOk(body, m[1]!)
    return type ? { body, type } : null
  }
  try {
    const res = await deps.ses.fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const body = Buffer.from(await res.arrayBuffer())
    const type = iconOk(body, res.headers.get('content-type') ?? '')
    return type ? { body, type } : null
  } catch {
    // 网络不通、超时：试下一处
    return null
  }
}

/** 网页的 HTML（只要前 256 KB，找 <link rel=icon>）；不是网页、取不到都是空 */
async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await deps.ses.fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return ''
    return Buffer.from(await res.arrayBuffer()).subarray(0, 256 * 1024).toString('utf8')
  } catch {
    return ''
  }
}

/** webview 的 page-favicon-updated 报上来的（右栏开过的网站，图标比 /favicon.ico 准），记进 icons.json */
export function noteIcon(pageUrl: string, icons: string[]) {
  try {
    const { host, origin } = new URL(pageUrl)
    const icon = icons.find((i) => /^(https?:|data:image\/)/.test(i))
    if (host && icon && noted().set(host, icon)) iconCache.delete(origin)
  } catch {
    // 不是网址
  }
}

// ---------------------------------------------------------------- storage

function store() {
  if (storage) return storage
  try {
    const raw = JSON.parse(readFileSync(storageFile(), 'utf8')) as Partial<Storage> | null
    storage = { local: raw?.local ?? {}, sync: raw?.sync ?? {} }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    storage = { local: {}, sync: {} }
  }
  return storage
}

function saveStore() {
  const f = storageFile()
  mkdirSync(join(f, '..'), { recursive: true })
  atomicWriteSync(f, JSON.stringify(storage))
}

const area = (a: unknown) => {
  if (a !== 'local' && a !== 'sync') throw new Error('只有 storage.local 和 storage.sync')
  return store()[a]
}

function storageGet(a: unknown, keys: unknown): Record<string, unknown> {
  const data = area(a)
  if (keys === null || keys === undefined) return structuredClone(data)
  const pick = (ks: string[], defaults: Record<string, unknown> = {}) =>
    Object.fromEntries(ks.flatMap((k) => (k in data ? [[k, structuredClone(data[k])]] : k in defaults ? [[k, defaults[k]]] : [])))
  if (typeof keys === 'string') return pick([keys])
  if (Array.isArray(keys)) return pick(keys.map(String))
  if (typeof keys === 'object') return pick(Object.keys(keys), keys as Record<string, unknown>)
  throw new Error('storage.get 的参数不对')
}

function storageChange(a: 'local' | 'sync', patch: Record<string, unknown>, removed: string[]) {
  const data = store()[a]
  const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {}
  for (const [k, v] of Object.entries(patch)) {
    changes[k] = { ...(k in data ? { oldValue: data[k] } : {}), newValue: v }
    data[k] = v
  }
  for (const k of removed) {
    if (!(k in data)) continue
    changes[k] = { oldValue: data[k] }
    delete data[k]
  }
  if (!Object.keys(changes).length) return
  saveStore()
  // 改的那个页面自己也要收到（和 Chrome 一样）
  broadcast({ type: 'storage', area: a, changes })
}

/** 「⋯ › 稍后再看」：放进 BookmarkKeeper 自己的「Saved for later」（storage.local 的 deferred，和它的新标签页同一份） */
export function laterHas(url: string): boolean {
  const list = store().local.deferred
  return Array.isArray(list) && list.some((x: { url?: unknown; dismissed?: unknown; completed?: unknown }) => x?.url === url && !x.dismissed && !x.completed)
}

/** BookmarkKeeper 的 deferred 里一条（newtab/app.js 的 saveTabForLater 写的样子） */
interface Deferred {
  id: string
  url: string
  title: string
  savedAt: string
  completed: boolean
  dismissed: boolean
}

export function laterToggle(page: { url: string; title: string }): boolean {
  const cur = store().local.deferred
  const list = Array.isArray(cur) ? (structuredClone(cur) as Deferred[]) : []
  const has = laterHas(page.url)
  if (has) for (const x of list) if (x.url === page.url && !x.dismissed && !x.completed) x.dismissed = true
  if (!has) list.push({ id: Date.now().toString(), url: page.url, title: page.title, savedAt: new Date().toISOString(), completed: false, dismissed: false })
  storageChange('local', { deferred: list }, [])
  return !has
}

// ---------------------------------------------------------------- tabs

const tabNum = (id: string) => {
  let n = tabNums.get(id)
  if (n === undefined) tabNums.set(id, (n = nextTabNum++))
  return n
}
const tabByNum = (n: unknown) => tabs.find((t) => tabNum(t.id) === Number(n))

/**
 * 插件眼里的网址：它自己的页面按 Chrome 里的样子报（新标签页是 chrome://newtab/，别的是 chrome-extension://），
 * 这样它的「打开的标签」不把自己列进去、认得出多开的新标签页
 */
function urlForExt(u: string): string {
  if (u === NEWTAB_URL) return 'chrome://newtab/'
  return isExtUrl(u) ? 'chrome-extension://bookmarkkeeper' + u.slice(EXT_ORIGIN.length) : u
}

function tabInfo(t: TabMirror, i: number) {
  return { id: tabNum(t.id), index: i, windowId: 1, url: urlForExt(t.url), title: t.title || t.url, active: t.active, highlighted: t.active, pinned: false, status: 'complete', incognito: false, discarded: false, autoDiscardable: true, groupId: -1 }
}

function tabsCall(method: string, args: unknown[], sender: WebContents): unknown {
  const all = () => tabs.map(tabInfo)
  switch (method) {
    case 'query':
      return all()
    case 'get': {
      const i = tabs.findIndex((t) => tabNum(t.id) === Number(args[0]))
      if (i === -1) throw new Error(`No tab with id: ${args[0]}`)
      return tabInfo(tabs[i]!, i)
    }
    case 'getCurrent': {
      const i = tabs.findIndex((t) => t.wcId === sender.id)
      return i === -1 ? undefined : tabInfo(tabs[i]!, i)
    }
    case 'create': {
      const p = (args[0] ?? {}) as { url?: unknown; active?: unknown }
      const url = typeof p.url === 'string' ? p.url : NEWTAB_URL
      if (!/^https?:/.test(url) && !isExtUrl(url)) throw new Error('只能开网页')
      sendApp('web:open-tab', { url, background: p.active === false })
      return { id: -1, index: tabs.length, windowId: 1, url, title: '', active: p.active !== false, pinned: false }
    }
    case 'update': {
      const [a, b] = args
      const t = typeof a === 'number' ? tabByNum(a) : tabs.find((x) => x.wcId === sender.id)
      const p = ((typeof a === 'number' ? b : a) ?? {}) as { active?: unknown; url?: unknown }
      if (!t) throw new Error(`No tab with id: ${a}`)
      if (typeof p.url === 'string') {
        if (!/^https?:/.test(p.url) && !isExtUrl(p.url)) throw new Error('只能开网页')
        sendApp('web:tab-command', { type: 'navigate', tabId: t.id, url: p.url })
      }
      if (p.active === true) sendApp('web:tab-command', { type: 'select', tabId: t.id })
      return tabInfo(t, tabs.indexOf(t))
    }
    case 'remove': {
      const ids = Array.isArray(args[0]) ? args[0] : [args[0]]
      for (const n of ids) {
        const t = tabByNum(n)
        if (t) sendApp('web:tab-command', { type: 'close', tabId: t.id })
      }
      return undefined
    }
    default:
      throw new Error(`chrome.tabs.${method} 还没有`)
  }
}

// ---------------------------------------------------------------- fetch

interface FetchReq {
  id: string
  url: string
  method: string
  headers: [string, string][]
  body?: string
  redirect?: RequestRedirect
  credentials?: RequestCredentials
}

const MAX_BODY = 20 * 1024 * 1024

/** 插件页面的跨域请求（Chrome 里插件有 host_permissions 就不受跨域限制）：主进程用内置浏览器的分区发 */
async function proxyFetch(req: FetchReq) {
  if (!req || typeof req.id !== 'string' || typeof req.url !== 'string' || !/^https?:\/\//.test(req.url) || typeof req.method !== 'string') throw new Error('请求参数不对')
  const ac = new AbortController()
  aborts.set(req.id, ac)
  const timer = setTimeout(() => ac.abort(), 120_000)
  try {
    const res = await deps.ses.fetch(req.url, {
      method: req.method,
      headers: Array.isArray(req.headers) ? req.headers.filter((h) => Array.isArray(h) && typeof h[0] === 'string' && typeof h[1] === 'string') : [],
      ...(typeof req.body === 'string' ? { body: Buffer.from(req.body, 'base64') } : {}),
      redirect: req.redirect ?? 'follow',
      credentials: req.credentials ?? 'omit',
      signal: ac.signal,
    })
    const body = req.method === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer())
    if (body.length > MAX_BODY) throw new Error('回来的内容太大')
    return { status: res.status, statusText: res.statusText, url: res.url, headers: [...res.headers], body: body.toString('base64') }
  } catch (e) {
    return { error: ac.signal.aborted ? 'abort' : String((e as Error).message ?? e) }
  } finally {
    clearTimeout(timer)
    aborts.delete(req.id)
  }
}

// ---------------------------------------------------------------- 起来

/** 这台 Mac 的标识（和 BKCore 一样从硬件 UUID 算）；拿不到就用一个记在本机的随机标识 */
function machineId(): Promise<string> {
  return new Promise((resolve) => {
    execFile('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { timeout: 5000 }, (err, out) => {
      const id = err ? null : machineIdFrom(out)
      if (id) return resolve(id)
      console.warn('读不到硬件 UUID，快捷书签用本机记的随机标识', err?.message)
      const f = join(app.getPath('userData'), 'web', 'bookmarkkeeper', 'machine-id')
      try {
        resolve(readFileSync(f, 'utf8').trim())
      } catch {
        const made = 'mac-' + randomBytes(6).toString('hex')
        mkdirSync(join(f, '..'), { recursive: true })
        atomicWriteSync(f, made)
        resolve(made)
      }
    })
  })
}

export async function setupBookmarkKeeper(d: Deps): Promise<void> {
  deps = d
  // 退出时删掉 Chrome 图标库的临时拷贝
  app.on('will-quit', () => void chromeIcons.dispose())
  const dir = join(app.getPath('userData'), 'web')
  source = findSource({
    env: process.env.CN_BOOKMARKKEEPER_DIR,
    // 打包后在 Contents/Resources/bookmarkkeeper（electron-builder.cjs 的 extraResources）
    bundled: app.isPackaged ? join(process.resourcesPath, 'bookmarkkeeper') : join(__dirname, '../../resources/bookmarkkeeper'),
  })
  if (!source) console.warn('没找到 BookmarkKeeper：新网页标签显示一句说明')
  tree = new BookmarkTree(d.bookmarks, join(dir, 'folders.json'), notifyBookmarksChanged)
  const writer = `${await machineId()}-canvasnotes`
  quick = new QuickBridge({
    // 测试用 CN_ICLOUD_CONTAINER 指向临时目录；测试模式没给就放在测试实例自己的数据目录里，绝不碰真的 iCloud
    container: process.env.CN_ICLOUD_CONTAINER || (E2E ? join(app.getPath('userData'), 'icloud-test') : ICLOUD_CONTAINER),
    localDir: join(dir, 'bookmarkkeeper', 'QuickLinks'),
    writer: () => writer,
  })

  d.ses.protocol.handle(EXT_SCHEME, (req) => {
    const url = new URL(req.url)
    if (url.host !== new URL(EXT_ORIGIN).host) return new Response('不认识的地址', { status: 404 })
    return serveFile(url)
  })

  ipcMain.handle('web:newtab', (): NewTabInfo => (source ? { url: NEWTAB_URL, from: source.from, dir: source.dir, version: source.version, quickLinks: quick.where() } : { url: null }))
  ipcMain.on('web:tabs', (e, list: unknown) => {
    if (e.sender.id !== d.window()?.webContents.id || !Array.isArray(list)) return
    tabs = list.filter((t): t is TabMirror => !!t && typeof t.id === 'string' && typeof t.url === 'string')
  })

  // 界面报来当前主题的颜色：记下（新开的插件页一起来就用），并转给开着的插件页（shared/ext-theme.ts）
  let theme: ExtTheme | null = null
  ipcMain.on('web:ext-theme', (e, x: unknown) => {
    if (e.sender.id !== d.window()?.webContents.id) return
    theme = sanitizeExtTheme(x)
    if (theme) for (const wc of d.webviews()) if (!wc.isDestroyed() && isExtUrl(wc.getURL())) wc.send('ext:theme', theme)
  })

  // 预加载同步要 manifest（chrome.runtime.getManifest 是同步的）和主题
  ipcMain.on('ext:init', (e) => {
    try {
      check(e)
      e.returnValue = { manifest: JSON.parse(readFileSync(join(source!.dir, 'manifest.json'), 'utf8')), theme }
    } catch (err) {
      e.returnValue = { error: String((err as Error).message) }
    }
  })

  ipcMain.handle('ext:call', (e, ns: unknown, method: unknown, args: unknown) => {
    const wc = check(e)
    if (typeof ns !== 'string' || typeof method !== 'string' || !Array.isArray(args)) throw new Error('参数不对')
    switch (ns) {
      case 'bookmarks': {
        const a = args as [never, never]
        switch (method) {
          case 'getTree':
            return tree.getTree()
          case 'getSubTree':
            return tree.getSubTree(a[0])
          case 'getChildren':
            return tree.getChildren(a[0])
          case 'get':
            return tree.get(a[0])
          case 'getRecent':
            return tree.getRecent(a[0])
          case 'search':
            return tree.search(a[0])
          case 'create':
            return tree.create(a[0] ?? {})
          case 'update':
            return tree.update(a[0], a[1] ?? {})
          case 'move':
            return tree.move(a[0], a[1] ?? {})
          case 'remove':
            return tree.remove(a[0])
          case 'removeTree':
            return tree.removeTree(a[0])
        }
        throw new Error(`chrome.bookmarks.${method} 还没有`)
      }
      case 'storage': {
        const [ar, x] = args
        if (method === 'get') return storageGet(ar, x)
        area(ar)
        if (method === 'set') {
          if (!x || typeof x !== 'object') throw new Error('storage.set 的参数不对')
          return storageChange(ar as 'local', x as Record<string, unknown>, [])
        }
        if (method === 'remove') return storageChange(ar as 'local', {}, (Array.isArray(x) ? x : [x]).map(String))
        if (method === 'clear') return storageChange(ar as 'local', {}, Object.keys(area(ar)))
        throw new Error(`chrome.storage.${method} 还没有`)
      }
      case 'tabs':
        return tabsCall(method, args, wc)
      case 'windows':
        // 只有一个窗口；update 就是把右栏的网页亮出来
        if (method === 'update') sendApp('web:tab-command', { type: 'show' })
        return { id: 1, focused: true, type: 'normal', state: 'normal', incognito: false, alwaysOnTop: false }
      case 'runtime':
        if (method === 'sendMessage') {
          broadcast({ type: 'message', message: args[0] }, wc)
          return undefined
        }
        if (method === 'sendNativeMessage') return quick.handle(args[1])
        throw new Error(`chrome.runtime.${method} 还没有`)
    }
    throw new Error(`chrome.${ns} 还没有`)
  })

  ipcMain.handle('ext:fetch', (e, req: FetchReq) => {
    check(e)
    return proxyFetch(req)
  })
  ipcMain.on('ext:fetch-abort', (_e, id: unknown) => {
    if (typeof id === 'string') aborts.get(id)?.abort()
  })
}
