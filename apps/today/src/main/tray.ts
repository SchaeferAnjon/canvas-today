/**
 * 菜单栏：画布今日开着时常驻（设置里能关）。点图标弹一个小窗（第一批最简：今天几条、今天的那几条能勾、上面快速加一条、底下打开画布今日）；
 * 右键是系统菜单（打开画布今日、退出；新版下好了时最上面多「重启并更新到 x」）。测试模式里不建真的菜单栏图标（会出现在用户屏幕上），
 * 测试用 globalThis.ctTrayOpen() 建出小窗（照样不显示），再像人一样在里面点。
 */
import { app, BrowserWindow, Menu, nativeImage, screen, Tray } from 'electron'
import { join } from 'node:path'
import type { UpdateState } from '../shared/api'
import { type Lang, tr } from '../shared/i18n'
import { E2E } from './test-mode'
import { TRAY_1X, TRAY_2X } from './tray-icon'

const W = 320
const H = 420

export class MenuBar {
  private tray: Tray | null = null
  private win: BrowserWindow | null = null

  constructor(
    private h: {
      preload: string
      load: (w: BrowserWindow, page: 'tray') => void
      showMain: () => void
      lang: () => Lang
      bg: () => string
      update: () => UpdateState | null
      installUpdate: () => void
    },
  ) {
    if (E2E) (globalThis as unknown as { ctTrayOpen: () => number }).ctTrayOpen = () => this.window().webContents.id
  }

  set(on: boolean) {
    if (!on) {
      this.tray?.destroy()
      this.tray = null
      this.win?.destroy()
      this.win = null
      return
    }
    if (this.tray || E2E) return
    const img = nativeImage.createFromDataURL(TRAY_1X)
    img.addRepresentation({ scaleFactor: 2, dataURL: TRAY_2X })
    img.setTemplateImage(true)
    this.tray = new Tray(img)
    this.tray.setToolTip(tr(this.h.lang(), 'appName'))
    this.tray.on('click', () => this.toggle())
    this.tray.on('right-click', () => this.tray?.popUpContextMenu(this.menu()))
  }

  relabel() {
    this.tray?.setToolTip(tr(this.h.lang(), 'appName'))
  }

  /** 右键菜单；新版下好了时最上面多「重启并更新到 x」 */
  menu() {
    const lang = this.h.lang()
    const st = this.h.update()
    return Menu.buildFromTemplate([
      ...(st?.phase === 'ready' ? [{ label: tr(lang, 'mInstallUpdate', st.version), click: () => this.h.installUpdate() }, { type: 'separator' as const }] : []),
      { label: tr(lang, 'trayOpen'), click: () => this.h.showMain() },
      { type: 'separator' },
      { label: tr(lang, 'trayQuit'), click: () => app.quit() },
    ])
  }

  /** 小窗（还没建就建一个，不显示） */
  window(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    this.win = new BrowserWindow({
      width: W,
      height: H,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: 'Canvas Today menu bar',
      backgroundColor: this.h.bg(),
      roundedCorners: true,
      ...(E2E ? { x: -3000, y: 80 } : {}),
      webPreferences: { preload: this.h.preload, contextIsolation: true, sandbox: true, ...(E2E ? { backgroundThrottling: false } : {}) },
    })
    this.win.on('blur', () => {
      if (!E2E) this.win?.hide()
    })
    this.h.load(this.win, 'tray')
    return this.win
  }

  hide() {
    if (!E2E) this.win?.hide()
  }

  private toggle() {
    const w = this.window()
    if (w.isVisible()) return w.hide()
    const b = this.tray!.getBounds()
    const d = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea
    const x = Math.round(Math.min(Math.max(b.x + b.width / 2 - W / 2, d.x + 8), d.x + d.width - W - 8))
    w.setPosition(x, Math.round(b.y + b.height + 4))
    w.show()
    w.focus()
  }

  get webContentsId(): number | null {
    return this.win && !this.win.isDestroyed() ? this.win.webContents.id : null
  }
}

export const trayPreload = () => join(__dirname, '../preload/index.js')
