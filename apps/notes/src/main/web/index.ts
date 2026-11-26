/**
 * 内置浏览器在主进程这边的一切：多标签的新窗口和按键、书签、历史、Chrome 插件、整页剪藏、图片附件。
 * main/index.ts 只调这里的 setupWeb 和 attachWebview。
 */
import { app, type BrowserWindow, ipcMain, session, webContents as allWebContents, type WebContents } from 'electron'
import type { WebPrefs } from '../../shared/prefs'
import { setupDownloads } from './downloads'
import { join } from 'node:path'
import * as git from '@cn/git'
import type { ImageSource } from '../../shared/web-api'
import type { CommitInfo } from '../../shared/api'
import { INBOX, mdUrl } from '../../shared/layout'
import { imageMarkdown } from '../../shared/web-img'
import { listChromeProfiles } from '@cn/web-session'
import { localStamp, type Vault } from '../vault'
import { logActivity } from '../activity'
import { setActiveWeb } from '../agent/web'
import { faviconTone } from './favicon-tone'
import { forwardedKey } from '../commands'
import { download, saveImage, sniffImage } from './save-image'
import { chromeRoot, readChromeBookmarks, readChromeHistory } from './chrome-data'
import { noteIcon, notifyBookmarksChanged, setupBookmarkKeeper } from './bookmarkkeeper'
import { Extensions } from './extensions'
import { Bookmarks, History } from './library'
import { clipFileName, type ExtractedPage, extractPage, listenForExtracts, localizeImages, pageClipText } from './page-clip'
import { setupMediaHold } from './media-hold'

interface Deps {
  partition: string
  window(): BrowserWindow | null
  vault(): Vault | null
  /** 设置 › 网页和视频「下载放在」 */
  downloads(): WebPrefs['downloads']
  /** 设置 › 网页和视频「记下看过的网页」（左栏「最近」列它们） */
  keepRecent(): boolean
}

let deps: Deps
let bookmarks: Bookmarks
let history: History
/** 左栏「最近」里的网页：只记标题和网址，存在设置目录，不进库（2026-11-24） */
let recentWeb: History
let extensions: Extensions | null = null
/** 界面告诉我们的当前网页 */
let activeId: number | null = null
/** 等界面开好新标签：请求号 → 拿到 webContents 后 resolve */
let reqSeq = 0
const pendingTabs = new Map<number, (wc: WebContents) => void>()
/** 我们自己在告诉插件库换标签（它会回调 selectTab）：这时的回调不是插件要切，不转给界面 */
let quiet = false
function quietly(f: () => void) {
  quiet = true
  try {
    f()
  } finally {
    quiet = false
  }
}
/** 整页剪藏的提交号，撤回用 */
const clipCommits = new Map<string, string>()

const send = (channel: string, ...args: unknown[]) => deps.window()?.webContents.send(channel, ...args)

/** 网页 webContents：必须是我们窗口里的 webview */
function ourWebview(id: number): WebContents | null {
  const wc = allWebContents.fromId(id)
  const win = deps.window()
  if (!wc || wc.isDestroyed() || !win || wc.hostWebContents?.id !== win.webContents.id) return null
  return wc
}

/** 让界面开一个网页标签；reqId 让界面开好后告诉我们是哪个 webContents */
function openTab(url: string, background: boolean): Promise<WebContents> {
  const reqId = ++reqSeq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTabs.delete(reqId)
      reject(new Error('新标签没开成'))
    }, 15_000)
    pendingTabs.set(reqId, (wc) => {
      clearTimeout(timer)
      resolve(wc)
    })
    send('web:open-tab', { url, reqId, background })
  })
}

function needVault(): Vault {
  const v = deps.vault()
  if (!v) throw new Error('还没有打开库')
  return v
}

async function profileName(id: string): Promise<string> {
  return (await listChromeProfiles(chromeRoot())).find((p) => p.id === id)?.name ?? id
}

export async function setupWeb(d: Deps): Promise<void> {
  deps = d
  const dir = join(app.getPath('userData'), 'web')
  bookmarks = new Bookmarks(join(dir, 'bookmarks.json'), () => {
    send('web:bookmarks-changed')
    notifyBookmarksChanged()
  })
  history = new History(join(dir, 'history.json'))
  recentWeb = new History(join(dir, 'recent.json'), 300, () => {
    const w = deps.window()
    if (w && !w.isDestroyed()) w.webContents.send('web:recent-changed')
  })
  // 窗口都关了以后再存（before-quit 时网页还在，之后还会记，留下的定时器会在 Node 收尾时才跑）
  app.on('will-quit', () => {
    history.flush()
    recentWeb.flush()
  })
  listenForExtracts()
  setupMediaHold(isOurWebview)

  const ses = session.fromPartition(d.partition)
  // 右栏网页里的下载（设置 › 网页和视频「下载放在」）
  setupDownloads(ses, { window: d.window, vault: d.vault, mode: d.downloads })
  extensions = new Extensions(join(dir, 'extensions'), ses, {
    openTab,
    selectTab: (wc) => !quiet && send('web:tab-command', { type: 'select', webContentsId: wc.id }),
    closeTab: (wc) => send('web:tab-command', { type: 'close', webContentsId: wc.id }),
    window: d.window,
  })
  ipcMain.handle('web:bookmarks', () => bookmarks.all())
  ipcMain.handle('web:bookmark-add', (_e, b: { title: unknown; url: unknown; folder?: unknown }) => {
    if (typeof b?.url !== 'string' || typeof b.title !== 'string') throw new Error('书签参数不对')
    return bookmarks.add({ title: b.title, url: b.url, ...(typeof b.folder === 'string' ? { folder: b.folder } : {}) })
  })
  ipcMain.handle('web:bookmark-remove', (_e, id: unknown) => {
    if (typeof id !== 'string') throw new Error('书签参数不对')
    return bookmarks.remove(id)
  })
  ipcMain.handle('web:bookmarks-import', async (_e, profileId: unknown) => {
    if (typeof profileId !== 'string') throw new Error('参数不对')
    const items = await readChromeBookmarks(profileId)
    const added = bookmarks.merge(items)
    return { added, total: items.length }
  })
  ipcMain.handle('web:history', (_e, q: unknown, limit: unknown) => history.search(typeof q === 'string' ? q : '', Number(limit) || 50))
  ipcMain.handle('web:recent', () => recentWeb.search('', 300))
  ipcMain.handle('web:recent-remove', (_e, url: unknown) => {
    if (typeof url !== 'string') throw new Error('参数不对')
    recentWeb.remove(url)
  })
  ipcMain.handle('web:history-import', async (_e, profileId: unknown) => {
    if (typeof profileId !== 'string') throw new Error('参数不对')
    return { added: history.merge(await readChromeHistory(profileId)) }
  })
  ipcMain.handle('web:chrome-profiles', () => listChromeProfiles(chromeRoot()))

  ipcMain.handle('web:extensions', () => extensions!.list())
  ipcMain.handle('web:extensions-import', async (_e, profileId: unknown) => {
    if (typeof profileId !== 'string') throw new Error('参数不对')
    return extensions!.importFrom(profileId, await profileName(profileId))
  })
  ipcMain.handle('web:extension-enable', (_e, id: unknown, on: unknown) => {
    if (typeof id !== 'string' || typeof on !== 'boolean') throw new Error('参数不对')
    return extensions!.setEnabled(id, on)
  })
  ipcMain.handle('web:extension-remove', (_e, id: unknown) => {
    if (typeof id !== 'string') throw new Error('参数不对')
    return extensions!.remove(id)
  })

  ipcMain.handle('web:active', (_e, id: unknown) => {
    if (id === null) return void (activeId = null)
    if (typeof id !== 'number') throw new Error('参数不对')
    const wc = ourWebview(id)
    if (!wc) return
    activeId = id
    setActiveWeb(wc)
    quietly(() => extensions?.selectTab(wc))
  })
  ipcMain.on('web:tab-created', (_e, reqId: unknown, id: unknown) => {
    if (typeof reqId !== 'number' || typeof id !== 'number') return
    const wc = ourWebview(id)
    const done = pendingTabs.get(reqId)
    if (!wc || !done) return
    pendingTabs.delete(reqId)
    done(wc)
  })

  ipcMain.handle('web:save-image', async (_e, src: ImageSource, nameHint: unknown, opts: unknown) => {
    if (!src || (src.kind !== 'url' && src.kind !== 'bytes')) throw new Error('图片参数不对')
    if (src.kind === 'url' && typeof src.url !== 'string') throw new Error('图片参数不对')
    const o = (opts && typeof opts === 'object' ? opts : {}) as { note?: unknown; shot?: unknown }
    const note = typeof o.note === 'string' && /\.md$/i.test(o.note) && !o.note.split('/').includes('..') ? o.note : undefined
    return { path: await saveImage(needVault().root, ses, src, typeof nameHint === 'string' ? nameHint : undefined, { note, shot: o.shot === true }) }
  })

  // 网页里的图拖进 AI 输入框、右键「问 AI 这张图」（网页图拖进对话）：用网页那个会话取图（要登录才看得到的也行），
  // 和输入框里贴的图一样最大 20 MB；界面把不是 PNG、JPEG 的（SVG、WebP……）画成 PNG 再存进 pasted/
  ipcMain.handle('web:fetch-image', async (_e, url: unknown) => {
    if (typeof url !== 'string' || !/^(https?:|data:image\/)/i.test(url)) throw new Error('只能取网页上的图（http/https）')
    const { bytes, type } = await download(ses, url, 20 * 1024 * 1024)
    if (!bytes.byteLength) throw new Error('图片是空的')
    const kind = sniffImage(bytes)
    if (!kind && !type.startsWith('image/')) throw new Error('这不是图片')
    const mime = kind === 'svg' ? 'image/svg+xml' : kind === 'jpg' ? 'image/jpeg' : kind ? `image/${kind}` : type
    return { bytes, type: mime }
  })
  ipcMain.handle('web:favicon-tone', (_e, url: unknown) => faviconTone(ses, url))
  ipcMain.handle('web:clip-page', (_e, webUrl: unknown, folder: unknown, into: unknown) => clipCurrentPage(typeof webUrl === 'string' ? webUrl : null, { folder: folderArg(folder), into: noteArg(into) }))
  // 网页右键图「剪成卡片」（剪藏去处 2026-11-25「网页图片也能剪进收件箱」）：收件箱（或这个网站选的文件夹）新建一张卡片，
  // 图存进这张卡片的附件（用网页的登录分区取），写法同剪进文档的图：![图注](附件) + 来源一行回到那张图
  ipcMain.handle('web:clip-img', async (_e, c: unknown) => {
    const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
    const { src, alt, title, url } = o
    if (typeof src !== 'string' || !/^(https?:|data:image\/)/i.test(src) || typeof alt !== 'string' || typeof title !== 'string' || typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new Error('剪藏参数不对')
    const v = needVault()
    const folder = folderArg(o.folder) ?? INBOX
    const name = typeof o.name === 'string' ? o.name : undefined
    const head = `---\ncreated: ${localStamp(new Date())}\nsource: ${url}\n---\n`
    const card = { alt: alt.slice(0, 200), source: { title: title.slice(0, 300), url } }
    // 先建好卡片（图要存进它的附件文件夹，得先有路径），存好图再换成相对路径
    const first = `${head}![${card.alt.replace(/[\[\]\n]/g, ' ').trim()}](${mdUrl(src)})\n`
    const path = await v.create(folder, alt.trim().slice(0, 24) || '网页图片', first)
    // 存不下（下载失败、不是图）：同整页剪藏，留网上的地址，来源一行照写
    const saved = await saveImage(v.root, ses, { kind: 'url', url: src }, name ?? (alt || undefined), { note: path }).catch(() => null)
    const img = saved ? imageMarkdown(path, saved, card, '\n\n') : `${first.slice(head.length).trimEnd()}\n\n—— [${card.source.title.replace(/[\[\]\n]/g, ' ').trim()}](${mdUrl(url)})`
    await v.write(path, `${head}${img}\n`, first)
    await git.commitPaths(v.root, saved ? [path, saved] : [path], `剪藏：${alt.slice(0, 40) || title.slice(0, 40)}`)
    await logActivity(v.root, { t: Date.now(), kind: 'clip', path })
    send('files:changed')
    return path
  })
  ipcMain.handle('web:undo-clip', async (_e, path: unknown) => {
    const hash = typeof path === 'string' ? clipCommits.get(path) : undefined
    if (!hash) throw new Error('找不到这次剪藏的提交，撤回不了')
    await git.revert(needVault().root, hash)
    clipCommits.delete(path as string)
    send('files:changed')
  })

  await setupBookmarkKeeper({ ses, bookmarks, window: d.window, webviews: ourWebviews, isOurWebview })
  await extensions.loadAll()
}

/** 书签和历史（书签管家插件、BookmarkKeeper 新标签页用的是同一份） */
export function webLibrary(): { bookmarks: Bookmarks; history: History } {
  return { bookmarks, history }
}

/** 网页 webContents 是不是我们窗口里的 webview（插件只认它们发来的话） */
export function isOurWebview(wc: WebContents): boolean {
  return ourWebview(wc.id) !== null
}

/** 我们窗口里所有开着的网页 */
export function ourWebviews(): WebContents[] {
  const host = deps.window()?.webContents.id
  return allWebContents.getAllWebContents().filter((wc) => !wc.isDestroyed() && wc.hostWebContents?.id === host)
}

/** 要剪的网页：当前网页；给了网址而当前网页不是它时，找开着这个网址的标签 */
function pageToClip(webUrl: string | null): WebContents | null {
  const cur = activeId === null ? null : ourWebview(activeId)
  if (!webUrl || cur?.getURL() === webUrl) return cur
  const host = deps.window()?.webContents.id
  return allWebContents.getAllWebContents().find((wc) => !wc.isDestroyed() && wc.hostWebContents?.id === host && wc.getURL() === webUrl) ?? cur
}

/** 界面交来的文件夹（这个网站选的剪藏去处）：库里的相对路径，'' 是最外层；不给是 undefined（进收件箱） */
function folderArg(f: unknown): string | undefined {
  if (typeof f !== 'string') return undefined
  if (f) needVault().abs(f)
  return f
}

/** 界面交来的一篇（这个网站配对的那篇）：库里的 md 路径；不给是 undefined */
function noteArg(p: unknown): string | undefined {
  if (typeof p !== 'string' || !p) return undefined
  if (!/\.md$/i.test(p)) throw new Error('剪藏参数不对')
  needVault().abs(p)
  return p
}

/** 整页剪藏到哪（剪藏去处规则）：into 这个网站配对的那篇（写进它末尾），folder 选的文件夹，都不给进收件箱 */
export type PageDest = { folder?: string; into?: string }

/** 整页剪藏：照剪藏去处新建一篇或写进配对的那篇，单独一次提交（可撤回）；返回那篇的库内路径和那次提交 */
async function clipCurrentPage(webUrl: string | null, dest: PageDest): Promise<{ path: string; commit: CommitInfo | null }> {
  const wc = pageToClip(webUrl)
  if (!wc) throw new Error('右栏没有开着的网页')
  return clipPage(wc, dest)
}

/**
 * 把这个网页整页剪下来（引号按钮、⋯、右键、⌘K、AI 输入框 /剪藏这一页，AI 工具 web_clip 剪整页也走这里）：
 * 预加载里 Readability 抽正文、Turndown 转 md，网页里的图存进那篇的附件，单独一次提交。
 * 去处照剪藏去处规则（2026-11-25）：这个网站配对了一篇就写进那篇末尾（二级标题 + 来源一行 + 正文），选了文件夹新建在那里，都没有新建在收件箱
 */
export async function clipPage(wc: WebContents, dest: PageDest = {}): Promise<{ path: string; commit: CommitInfo | null }> {
  const v = needVault()
  if (!/^https?:/.test(wc.getURL())) throw new Error('只剪 http(s) 网页')
  const page = await extractPage(wc)
  if (!page.markdown.trim()) throw new Error('这个网页里没抽到正文')
  if (dest.into) return clipPageInto(v, wc, page, dest.into)
  const folder = dest.folder ?? INBOX
  const text = pageClipText(page, localStamp(new Date()))
  const path = await v.create(folder, clipFileName(page.title, page.url), text)
  // 网页里的图顺手存进这篇的附件文件夹（用网页的登录分区下，要登录才看得到的图也拿得到），正文改成相对路径；存不下的留网址
  const local = await localizeImages(text, path, (url) => saveImage(v.root, wc.session, { kind: 'url', url }, undefined, { note: path }))
  if (local.files.length) await v.write(path, local.text, text)
  const hash = await git.commitPaths(v.root, [path, ...local.files], `剪藏整页：${page.title.slice(0, 60) || page.url}`)
  if (hash) clipCommits.set(path, hash)
  await logActivity(v.root, { t: Date.now(), kind: 'clip', path })
  send('files:changed')
  return { path, commit: hash ? ((await git.log(v.root, 1, hash))[0] ?? null) : null }
}

/** 整页写进这个网站配对的那篇末尾：「## 网页标题」+ 来源一行 + 正文，图存进那篇的附件；开着的编辑器照外部改动合进来 */
async function clipPageInto(v: Vault, wc: WebContents, page: ExtractedPage, path: string): Promise<{ path: string; commit: CommitInfo | null }> {
  const article = pageClipText(page, '')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/^# /, '## ')
  const local = await localizeImages(article, path, (url) => saveImage(v.root, wc.session, { kind: 'url', url }, undefined, { note: path }))
  const cur = await v.read(path)
  const r = await v.write(path, cur.text.replace(/\n*$/, '\n\n') + local.text.trim() + '\n', cur.text)
  if (!r.ok) throw new Error('那篇刚被改了，再剪一次')
  const hash = await git.commitPaths(v.root, [path, ...local.files], `剪藏整页：${page.title.slice(0, 60) || page.url} → ${path.split('/').pop()!.replace(/\.md$/i, '')}`)
  if (hash) clipCommits.set(path, hash)
  await logActivity(v.root, { t: Date.now(), kind: 'clip', path })
  send('files:changed')
  return { path, commit: hash ? ((await git.log(v.root, 1, hash))[0] ?? null) : null }
}

/** 网页里焦点不在输入框、可编辑的地方（Esc 是不是网页表单自己的） */
const ESC_FREE = `(() => { let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; return !(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) })()`

/** will-attach-webview 之后：新窗口开成新标签、记历史、插件把它当成标签、网页焦点时的快捷键转给界面 */
export function attachWebview(wc: WebContents, win: BrowserWindow) {
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (/^https?:/.test(url)) send('web:open-tab', { url, background: disposition === 'background-tab' })
    return { action: 'deny' }
  })
  wc.on('did-navigate', (_e, url) => {
    history.visit(url, wc.getTitle())
    if (deps.keepRecent()) recentWeb.visit(url, wc.getTitle())
  })
  wc.on('page-title-updated', (_e, title) => {
    history.title(wc.getURL(), title)
    recentWeb.title(wc.getURL(), title)
  })
  // 网页自己拿到焦点（点进正文）：告诉界面是哪个网页，它所在的栏成当前栏（窗口不在前面时直接点进网页，界面收不到 blur）
  wc.on('focus', () => send('web:focused', wc.id))
  // 书签管家新标签页里的网站图标用右栏开过的网站报的图标
  wc.on('page-favicon-updated', (_e, icons) => noteIcon(wc.getURL(), icons))
  wc.on('before-input-event', (e, input) => {
    // Esc（没按别的键）：不在网页的输入框、表单里时告诉界面（占满着就回原样，shell/max.ts）；网页自己照样收到这一下
    if (input.type === 'keyDown' && input.key === 'Escape' && !input.isAutoRepeat && !input.meta && !input.control && !input.alt && !input.shift) {
      wc.executeJavaScript(ESC_FREE).then(
        (free) => free === true && send('app:key', 'esc'),
        () => undefined, // 网页正在换页、没载完：这一下不算
      )
      return
    }
    // 软件的快捷键（命令表里「软件里」的，task-spsmf）：网页有焦点时也转给界面，界面照样按一下；网页里自己的脚本接的（双语翻译、剪下选中的一段）不转
    const own = forwardedKey(input)
    if (!own) return
    e.preventDefault()
    send('app:key', own)
  })
  wc.once('destroyed', () => {
    if (activeId === wc.id) activeId = null
  })
  // 插件库会把新挂上的网页当成当前标签；插件眼里的当前标签要还是用户正在看的那个
  quietly(() => {
    extensions?.addTab(wc, win)
    const cur = activeId === null ? null : ourWebview(activeId)
    if (cur) extensions?.selectTab(cur)
  })
}
