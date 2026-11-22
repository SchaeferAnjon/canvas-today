/**
 * 检查更新（照 MeetCaption 的 src/main/updater.js）：electron-updater 查 GitHub Release 的 latest-mac.yml。
 * 启动 30 秒后查一次，之后每 6 小时一次；有新版在后台下载，下好了告诉界面（「重启更新」），用户点了才重启；不点，下次退出时自动装上。
 * Mac 上新版要和装着的版本用同一张 Developer ID 证书签名，Squirrel.Mac 才肯换（发布包在本机用 scripts/release.mjs 打）。
 * Mac 上 electron-updater 下完 zip 就报 update-downloaded，这时 Squirrel 还没取包、没验签：等 Electron 自己的 autoUpdater
 * 也报 update-downloaded（验过签、解好包）才算 ready；验签失败、装不进去就是 error。
 */
import { EventEmitter } from 'node:events'
import type { UpdateState } from '../shared/api'

const FIRST_CHECK_MS = 30_000
const EVERY_MS = 6 * 3600_000

/** electron-updater 的 autoUpdater 里用到的那部分（测试时换成假的） */
export interface UpdaterEngine extends EventEmitter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  logger: unknown
  setFeedURL(opts: { provider: 'generic'; url: string }): void
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface UpdaterOptions {
  /** 这个包能不能更新：正式发布的包才行；开发版、本机打的包、端到端测试不更新 */
  supported: boolean
  /** 设置里的「自动检查更新」 */
  enabled(): boolean
  /** 测试用：指向本机的更新服务器（generic），不给就用打包时写进去的 GitHub */
  feedUrl?: string
  engine?: UpdaterEngine
  /** Mac 上 Electron 自己的 autoUpdater（Squirrel） */
  native?: EventEmitter | null
  /** 是不是从「应用程序」文件夹打开的（别处打开的可能装不上） */
  inApps: boolean
  version: string
  /** 上次查到「已是最新」的时间（存在设置里），重开软件后也显示 */
  checkedAt?: number
}

export class Updater extends EventEmitter {
  private state: UpdateState
  private timer: NodeJS.Timeout | null = null
  private readonly engine: UpdaterEngine | null

  constructor(private readonly o: UpdaterOptions) {
    super()
    if (o.supported && !o.engine) throw new Error('检查更新：没拿到 electron-updater')
    this.engine = o.supported ? o.engine! : null
    this.state = { phase: this.engine ? 'idle' : 'off', current: o.version, version: '', percent: 0, error: '', checkedAt: o.checkedAt ?? 0, inApps: o.inApps }
    const au = this.engine
    if (!au) return
    au.autoDownload = true
    au.autoInstallOnAppQuit = true
    au.allowPrerelease = false
    au.logger = { info: () => {}, warn: (m: unknown) => console.warn('[update]', m), error: (m: unknown) => console.error('[update]', m), debug: () => {} }
    if (o.feedUrl) au.setFeedURL({ provider: 'generic', url: o.feedUrl })
    au.on('checking-for-update', () => this.set({ phase: 'checking', error: '' }))
    au.on('update-available', (info: { version: string }) => this.set({ phase: 'downloading', version: info.version, percent: 0 }))
    au.on('update-not-available', () => this.set({ phase: 'latest', checkedAt: Date.now() }))
    au.on('download-progress', (p: { percent?: number }) => this.set({ phase: 'downloading', percent: Math.floor(p.percent ?? 0) }))
    let staged = false
    let pending: Partial<UpdateState> | null = null
    o.native?.on('update-downloaded', () => {
      staged = true
      if (pending) this.set({ phase: 'ready', ...pending })
    })
    au.on('update-downloaded', (info: { version: string }) => {
      const done = { version: info.version, percent: 100, checkedAt: Date.now() }
      if (!o.native || staged) this.set({ phase: 'ready', ...done })
      else ((pending = done), this.set({ phase: 'downloading', ...done }))
    })
    au.on('before-quit-for-update', () => this.emit('quitting'))
    au.on('error', (e: unknown) => {
      // 下好以后再出的错（比如又查了一次没网）不盖掉「已下载」
      if (this.state.phase === 'ready') return
      this.set({ phase: 'error', error: String((e as Error)?.message ?? e).split('\n')[0]!, checkedAt: Date.now() })
    })
  }

  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch }
    this.emit('state', this.state)
  }

  status(): UpdateState {
    return this.state
  }

  start() {
    if (!this.engine) return
    if (this.timer) clearTimeout(this.timer)
    const loop = () => {
      if (this.o.enabled() && !['checking', 'downloading', 'ready'].includes(this.state.phase)) this.check().catch(() => undefined)
      this.timer = setTimeout(loop, EVERY_MS)
    }
    this.timer = setTimeout(loop, FIRST_CHECK_MS)
  }

  /** 查一次（设置里的「检查更新」也走这里）；出错时 state 是 error，同样的错误也抛出去 */
  async check(): Promise<UpdateState> {
    if (!this.engine || ['checking', 'downloading', 'ready'].includes(this.state.phase)) return this.state
    await this.engine.checkForUpdates()
    return this.state
  }

  /** 已下载好的新版：退出、装上、重新打开 */
  install(): boolean {
    if (!this.engine || this.state.phase !== 'ready') return false
    this.engine.quitAndInstall(true, true)
    return true
  }
}
