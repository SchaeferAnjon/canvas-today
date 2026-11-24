/**
 * 设置 › 软件家族的主进程这半（task-59o3v）。画布今日也用这一份（apps/today/src/main/index.ts 引进去，频道名一样，
 * 和它引画布笔记的 updater、appearance 一个做法）；读盘、问系统、联网的共用部分在 @cn/family/node（ParaRead 照抄那份）。
 * - 名单：软件带的那份合上次从总站读来的；有网时每天看一次 apps.us-cloud.uk/family.json（设置里能关）；
 * - 装没装：按身份号问系统，只认「应用程序」里的；设置窗口重新拿到焦点、点「装好了，再看一下」时再问；
 * - 联动开关：库里 .canvas-notes/联动.json，两个软件读同一份；那边拨了这边一秒内跟着变（family:links）；
 * - 打开、下载、去总站、PDF 换到 ParaRead 读。
 * 测试模式：装了哪些读 o.test.installedFile 那个文件（{ "canvas-today": "0.3.0" }，测试改了文件再点「再看一下」就像真装上了）；
 * 打开、下载、换到 ParaRead 只记下来（test-mode 换掉了 shell）；不联网，除非给了 o.test.url。
 */
import { HUB_URL, type Installed, linkOn } from '@cn/family'
import { parareadOpenUrl } from '@cn/format'
import { findInstalled, installedFromFile, loadList, readLinks, refreshList, watchLinks, writeLink } from '@cn/family/node'
import { app, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import type { FamilyState } from '../shared/family'

const record = (what: string) => {
  const g = globalThis as unknown as { cnScreen?: string[] }
  g.cnScreen?.push(what)
  console.log(`[测试模式] 没真的做：${what}`)
}

export interface FamilyHost {
  /** 现在的库（没打开是 null）：根目录、名字、库里的相对路径换成绝对路径（查过不出库） */
  vault(): { root: string; name: string; abs(rel: string): string } | null
  /** 给界面发消息（画布笔记只有主窗口；画布今日发给所有窗口） */
  send(channel: string, ...args: unknown[]): void
  /** 每天看一次总站的名单开着没有 */
  fetchOn(): boolean
  /** 测试模式：装了哪些从文件读、名单从哪个网址读（不给不联网）、另外算装了的（以前的测试用的开关） */
  test: { installedFile?: string; url?: string; extra?: Installed } | null
}

export function registerFamily(o: FamilyHost) {
  const cacheFile = join(app.getPath('userData'), 'family.json')
  let installed: Installed | null = null
  const detect = async (): Promise<Installed> => {
    if (o.test) installed = { ...o.test.extra, ...(o.test.installedFile ? installedFromFile(o.test.installedFile) : {}) }
    else installed = await findInstalled(loadList(cacheFile).list, app.getPath('home'))
    return installed
  }
  const known = async () => installed ?? detect()

  const state = async (): Promise<FamilyState> => {
    const v = o.vault()
    const { list, checkedAt } = loadList(cacheFile)
    return { list, checkedAt, installed: await known(), links: v ? readLinks(v.root) : {}, vault: v?.name ?? null, version: app.getVersion(), fetchOn: o.fetchOn() }
  }

  ipcMain.handle('family:get', () => state())
  ipcMain.handle('family:recheck', async () => {
    await detect()
    return state()
  })
  ipcMain.handle('family:setLink', (_e, id: unknown, on: unknown) => {
    if (typeof id !== 'string' || !/^[\w-]+$/.test(id) || typeof on !== 'boolean') throw new Error('联动开关的参数不对')
    const v = o.vault()
    if (!v) throw new Error('还没有打开库')
    const links = writeLink(v.root, id, on)
    // 联动.json 不是 md，库的监视不报它；底栏的「未提交」要知道它变了
    o.send('files:changed')
    return links
  })
  ipcMain.handle('family:open', async (_e, id: unknown): Promise<boolean> => {
    const hit = typeof id === 'string' ? (await known())[id] : undefined
    if (!hit) return false
    const err = await shell.openPath(hit.path)
    if (!err) return true
    // 挪走了、刚扔进废纸篓：再问一次，界面改回「下载」
    await detect()
    return false
  })
  ipcMain.handle('family:download', async (_e, id: unknown) => {
    const a = loadList(cacheFile).list.apps.find((x) => x.id === id)
    if (!a) throw new Error('名单里没有这个软件')
    await shell.openExternal(a.download)
  })
  ipcMain.handle('family:hub', () => shell.openExternal(HUB_URL))
  /**
   * 用装着的 ParaRead 打开库里这份 PDF（PDF「⋯ › 在ParaRead里读（双语）」、文件夹首页 ParaRead 组件「继续读」「读」）：
   * 走深链 pararead://open?file=<绝对路径>&page=<读到哪>&vault=<库>&back=<从哪个文件夹首页来>（写法在 @cn/format 的 pararead-link.ts，ParaRead 认同一份）
   */
  ipcMain.handle('family:readInParaRead', async (_e, rel: unknown, opt: unknown) => {
    const v = o.vault()
    if (!v || typeof rel !== 'string') throw new Error('PDF 的路径不对')
    const p = (opt && typeof opt === 'object' ? opt : {}) as { page?: unknown; back?: unknown; view?: unknown }
    const url = parareadOpenUrl({ file: v.abs(rel), ...(typeof p.page === 'number' ? { page: p.page } : {}), vault: v.root, ...(typeof p.back === 'string' ? { back: p.back } : {}), ...(p.view === 'bilingual' || p.view === 'original' ? { view: p.view } : {}) })
    const pr = (await known()).pararead
    if (!pr) throw new Error('这台Mac上没装ParaRead')
    if (o.test) return record(`用 ParaRead 打开 ${url}`)
    await new Promise<void>((resolve, reject) => execFile('/usr/bin/open', ['-a', pr.path, url], { timeout: 10_000 }, (err) => (err ? reject(new Error(`ParaRead 没打开：${err.message}`)) : resolve())))
  })

  // 联动开关：另一个软件（或 Git 拉下来）改了，这边跟着变
  let stop: (() => void) | null = null
  const watch = (root: string | null) => {
    stop?.()
    stop = root ? watchLinks(root, (links) => o.send('family:links', links)) : null
  }

  // 名单：打开 30 秒后看一次、之后每 6 小时看是不是该看了（一天一次）；关了不看
  const url = o.test ? o.test.url : undefined
  const tick = async () => {
    if (!o.fetchOn() || (o.test && !url)) return
    if (await refreshList(cacheFile, Date.now(), { url })) o.send('family:changed')
  }
  setTimeout(() => void tick(), o.test ? 500 : 30_000).unref()
  setInterval(() => void tick(), 6 * 3600_000).unref()

  return {
    /** 换了库：看新库里的联动开关 */
    watch,
    /** 装了哪些（问过就用问过的） */
    installed: known,
    /** 联动开关现在开着没有（没拨过照名单里的默认） */
    linkOn: (id: string) => {
      const v = o.vault()
      return linkOn(loadList(cacheFile).list, v ? readLinks(v.root) : {}, id)
    },
  }
}
