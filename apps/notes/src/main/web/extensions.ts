/**
 * Chrome 插件：从 Chrome 导入已装的插件（拷一份到 <userData>/web/extensions/<id>/），加载进内置浏览器的登录分区。
 * chrome.action 弹窗、tabs、windows、contextMenus 这些 Electron 没有的接口用 electron-chrome-extensions（MIT）补上。
 */
import { BrowserWindow, session as electronSession, type Session, type WebContents } from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { mkdirSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExtensionInfo, ImportExtensionsResult } from '../../shared/web-api'
import { copyExtension, listChromeExtensions, localizedName, readManifest } from './chrome-data'
import { hasAction, missingApis, verdictOf } from './compat'
import { atomicWriteSync } from '@cn/atomic'

interface Record_ {
  id: string
  name: string
  version: string
  enabled: boolean
  from?: string
}

export interface TabHooks {
  /** 开一个网页标签，开好后给它的 webContents */
  openTab(url: string, background: boolean): Promise<WebContents>
  selectTab(wc: WebContents): void
  closeTab(wc: WebContents): void
  window(): BrowserWindow | null
}

export class Extensions {
  private records: Record_[]
  /** 加载失败的原因 */
  private errors = new Map<string, string>()
  /** 我们的 id → Electron 加载后给的 id（manifest 里有 key 时两者一样） */
  private loadedIds = new Map<string, string>()
  readonly crx: ElectronChromeExtensions

  constructor(
    private root: string,
    private ses: Session,
    hooks: TabHooks,
  ) {
    mkdirSync(root, { recursive: true })
    try {
      this.records = JSON.parse(readFileSync(this.listFile, 'utf8')) as Record_[]
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      this.records = []
    }
    this.crx = new ElectronChromeExtensions({
      session: ses,
      createTab: async (details) => {
        const win = hooks.window()
        if (!win) throw new Error('没有窗口')
        const wc = await hooks.openTab(details.url ?? 'about:blank', details.active === false)
        return [wc, win]
      },
      selectTab: (wc) => hooks.selectTab(wc),
      removeTab: (wc) => hooks.closeTab(wc),
      createWindow: async (details) => {
        const win = hooks.window()
        if (!win) throw new Error('没有窗口')
        const urls = typeof details.url === 'string' ? [details.url] : (details.url ?? [])
        for (const u of urls) await hooks.openTab(u, false)
        return win
      },
    } as ConstructorParameters<typeof ElectronChromeExtensions>[0])
    // 工具栏上插件图标走 crx:// 协议，在界面所在的默认分区里处理
    ElectronChromeExtensions.handleCRXProtocol(electronSession.defaultSession)
    this.crx.on('browser-action-popup-created', (popup: PopupView) => void fitPopup(popup))
  }

  private get listFile() {
    return join(this.root, '..', 'extensions.json')
  }

  private save() {
    atomicWriteSync(this.listFile, JSON.stringify(this.records, null, 2))
  }

  private dirOf(id: string) {
    if (!/^[a-p]{32}$/.test(id) && !/^[\w-]{1,64}$/.test(id)) throw new Error('插件 id 不对')
    return join(this.root, id)
  }

  /** 启动时把开着的插件都加载一遍（Electron 不记得上次加载过什么） */
  async loadAll(): Promise<void> {
    for (const r of this.records) if (r.enabled) await this.load(r.id)
  }

  private async load(id: string) {
    this.errors.delete(id)
    try {
      const ext = await this.ses.extensions.loadExtension(this.dirOf(id), { allowFileAccess: false })
      this.loadedIds.set(id, ext.id)
    } catch (e) {
      this.errors.set(id, String((e as Error).message ?? e))
    }
  }

  private unload(id: string) {
    const loaded = this.loadedIds.get(id)
    if (loaded && this.ses.extensions.getExtension(loaded)) this.ses.extensions.removeExtension(loaded)
    this.loadedIds.delete(id)
  }

  async list(): Promise<ExtensionInfo[]> {
    const out: ExtensionInfo[] = []
    for (const r of this.records) {
      let missing: string[] = []
      let action = false
      try {
        const m = await readManifest(this.dirOf(r.id))
        missing = missingApis(m)
        action = hasAction(m)
      } catch {
        this.errors.set(r.id, '插件文件夹不见了，移除后重新导入')
      }
      const error = this.errors.get(r.id)
      const runtimeId = this.loadedIds.get(r.id)
      out.push({
        id: r.id,
        ...(runtimeId ? { runtimeId } : {}),
        name: r.name,
        version: r.version,
        enabled: r.enabled,
        missing,
        verdict: error ? 'unlikely' : verdictOf(missing),
        hasAction: action,
        ...(error ? { error } : {}),
        ...(r.from ? { from: r.from } : {}),
      })
    }
    return out
  }

  /** 从 Chrome 某个用户导入：拷过来、记下、在 Chrome 里开着的就加载。已经导过的换成新版本 */
  async importFrom(profileId: string, profileName: string): Promise<ImportExtensionsResult> {
    const found = await listChromeExtensions(profileId)
    const result: ImportExtensionsResult = { imported: [], skipped: [] }
    for (const ext of found) {
      try {
        this.unload(ext.id)
        await copyExtension(ext.dir, this.dirOf(ext.id))
        // 拷过来的文件夹里没有 Chrome 的签名校验需要的东西也能加载；Chrome 写的 _metadata 留着无妨
        const name = (await localizedName(this.dirOf(ext.id), ext.manifest)) || ext.name
        const rec: Record_ = { id: ext.id, name, version: ext.version, enabled: !ext.disabledInChrome, from: profileName }
        const i = this.records.findIndex((r) => r.id === ext.id)
        if (i === -1) this.records.push(rec)
        else this.records[i] = { ...rec, enabled: this.records[i]!.enabled }
        if (this.records.find((r) => r.id === ext.id)!.enabled) await this.load(ext.id)
      } catch (e) {
        result.skipped.push({ id: ext.id, name: ext.name, reason: String((e as Error).message ?? e) })
      }
    }
    this.save()
    const all = await this.list()
    result.imported = all.filter((x) => found.some((f) => f.id === x.id))
    return result
  }

  async setEnabled(id: string, enabled: boolean): Promise<ExtensionInfo[]> {
    const r = this.records.find((x) => x.id === id)
    if (!r) throw new Error('没有这个插件')
    r.enabled = enabled
    this.save()
    if (enabled) await this.load(id)
    else {
      this.unload(id)
      this.errors.delete(id)
    }
    return this.list()
  }

  async remove(id: string): Promise<ExtensionInfo[]> {
    const dir = this.dirOf(id)
    this.unload(id)
    this.records = this.records.filter((x) => x.id !== id)
    this.errors.delete(id)
    this.save()
    await rm(dir, { recursive: true, force: true })
    return this.list()
  }

  /** 网页 webContents 当成插件眼里的一个标签 */
  addTab(wc: WebContents, win: BrowserWindow) {
    this.crx.addTab(wc, win)
  }

  selectTab(wc: WebContents) {
    this.crx.selectTab(wc)
  }
}

/** electron-chrome-extensions 的弹窗（只用到这几样） */
interface PopupView {
  browserWindow?: BrowserWindow
  whenReady(): Promise<void>
  isDestroyed(): boolean
  setSize(size: { width?: number; height?: number }): void
  updatePosition(): void
}

/**
 * 弹窗载入后按内容定大小。库在 Electron 45 上先把弹窗缩到 25×25 再等「内容尺寸变了」的通知，
 * 内容没变就等不到，弹窗一直是个小方块；这里载完量一次内容，再贴着按钮摆好。
 */
async function fitPopup(popup: PopupView) {
  await popup.whenReady()
  const wc = popup.browserWindow?.webContents
  if (!wc || wc.isDestroyed() || popup.isDestroyed()) return
  const size = (await wc
    .executeJavaScript('({ width: Math.ceil(document.documentElement.scrollWidth), height: Math.ceil(document.documentElement.scrollHeight) })')
    .catch(() => null)) as { width: number; height: number } | null
  if (!size || popup.isDestroyed()) return
  popup.setSize(size)
  popup.updatePosition()
}
