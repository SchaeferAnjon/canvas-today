/**
 * 菜单栏：画布今日开着时常驻（设置里能关；主窗口关了也在）。图标旁边写今天还有几条（过期的也算，同左栏「今天」的数）。
 * 点图标弹一个小窗（画布今日特色第一条线）：今天、下一件（日历的日程或带钟点的待办，还有多久）、今天的待办能直接勾、点一条在画布今日里打开、
 * 底下「快速加一条」（弹全局小框，main/quick.ts）和「打开画布今日」。
 * 右键是系统菜单（快速加一条、打开画布今日、退出；新版下好了时最上面多「重启并更新到 x」）。测试模式里不建真的菜单栏图标（会出现在用户屏幕上），
 * 测试用 globalThis.ctTrayOpen() 建出小窗（照样不显示），再像人一样在里面点；图标旁边写的字用 globalThis.ctTrayTitle() 读。
 */
import { app, BrowserWindow, Menu, nativeImage, screen, Tray } from 'electron'
import { join } from 'node:path'
import type { UpdateState } from '../shared/api'
import { type Lang, tr } from '../shared/i18n'
import { accelOf } from '../shared/quick'
import { E2E } from './test-mode'
import { TRAY_1X, TRAY_2X } from './tray-icon'

const W = 320
const H = 420
/** 小窗跟着内容高矮（ct:fit），最矮、最高 */
const H_MIN = 180
const H_MAX = 560

export class MenuBar {
  private tray: Tray | null = null
  private win: BrowserWindow | null = null
  /** 图标旁边写的字（今天还有几条；0 条不写） */
  private title = ''
  private tip = ''

  constructor(
    private h: {
      preload: string
      load: (w: BrowserWindow, page: 'tray') => void
      showMain: () => void
      lang: () => Lang
      bg: () => string
      update: () => UpdateState | null
      installUpdate: () => void
      /** 弹全局快速加一条的小框；quickKey 是它的键（注册上了才写进菜单） */
      quick: () => void
      quickKey: () => string | null
    },
  ) {
    if (E2E) {
      const g = globalThis as unknown as { ctTrayOpen: () => number; ctTrayTitle: () => string }
      g.ctTrayOpen = () => this.window().webContents.id
      g.ctTrayTitle = () => this.title
    }
  }

  /** 今天还有几条：写在图标旁边（等宽数字，数变了图标不左右跳） */
  setCount(n: number) {
    const title = n > 0 ? String(n) : ''
    const tip = n > 0 ? `${tr(this.h.lang(), 'appName')} · ${tr(this.h.lang(), 'trayLeft', n)}` : tr(this.h.lang(), 'appName')
    if (title === this.title && tip === this.tip) return
    this.title = title
    this.tip = tip
    this.tray?.setTitle(title, { fontType: 'monospacedDigit' })
    this.tray?.setToolTip(tip)
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
    this.tray.setToolTip(this.tip || tr(this.h.lang(), 'appName'))
    this.tray.setTitle(this.title, { fontType: 'monospacedDigit' })
    this.tray.on('click', () => this.toggle())
    this.tray.on('right-click', () => this.tray?.popUpContextMenu(this.menu()))
  }

  relabel() {
    this.tip = ''
    this.tray?.setToolTip(tr(this.h.lang(), 'appName'))
  }

  /** 右键菜单；新版下好了时最上面多「重启并更新到 x」 */
  menu() {
    const lang = this.h.lang()
    const st = this.h.update()
    return Menu.buildFromTemplate([
      ...(st?.phase === 'ready' ? [{ label: tr(lang, 'mInstallUpdate', st.version), click: () => this.h.installUpdate() }, { type: 'separator' as const }] : []),
      { label: tr(lang, 'trayQuick'), accelerator: this.h.quickKey() ? accelOf(this.h.quickKey()!) : undefined, registerAccelerator: false, click: () => this.h.quick() },
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
      // 不激活画布今日（不把主窗口一起带到前面），同快速加一条的小框
      type: 'panel',
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

  /** 页面量好自己多高：小窗跟着变 */
  fit(h: number) {
    if (!this.win || this.win.isDestroyed()) return
    this.win.setContentSize(W, Math.max(H_MIN, Math.min(H_MAX, Math.ceil(h))))
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
