/**
 * 全局快速加一条（画布今日特色第一条线，像滴答清单）：任何软件里按设置里那组键（默认 ⌥⇧T）弹一个小框，
 * 打一句话、下面一行实时写认出来的，回车写进库、小框收起、焦点还给原来的软件；Esc 关。主窗口关着也能用（软件常驻）。
 *
 * macOS 上要什么权限：都不要。
 * - 全局键用 Electron 的 globalShortcut（系统的 RegisterEventHotKey），不要「辅助功能」也不要「输入监控」；被别的软件占了时注册不上
 *   （register 返回 false），设置 › 一般里当场说，菜单栏小窗里也说一句。
 * - 小框是 type: 'panel' 的窗口（不激活画布今日自己，全屏的软件上面也弹得出来），收起时前台还是原来那个软件；
 *   万一画布今日被激活了（例如本来就在画布今日里），收起后用 open -b 把原来那个软件叫回前台。前台是谁用 lsappinfo 看，也不要权限。
 * - 以后「附上浏览器网页、选中的那封邮件」才要「自动化」权限，那一步没做（见交付页）。
 *
 * 测试模式（CT_E2E=1）：不注册真的全局键（不碰用户的键盘），globalThis.ctQuick.press() 当作按了那组键；
 * CT_TAKEN_KEYS=⌥⇧A,… 假装这几组被别的软件占了；窗口照样从不显示，ctQuick.isOpen() 是「弹出来了没有」，
 * ctQuick.front(名字) 假装弹之前前台是哪个软件，收起时要还焦点给谁记在 ctQuick.restored。
 */
import { app, BrowserWindow, globalShortcut, screen } from 'electron'
import { execFile } from 'node:child_process'
import { BRAND } from '../shared/brand'
import { accelOf } from '../shared/quick'
import { E2E } from './test-mode'

const W = 640
const H0 = 132

type Front = { name: string; bundle: string }

function run(cmd: string, args: string[], timeout = 1500): Promise<string> {
  return new Promise((resolve, reject) => execFile(cmd, args, { timeout }, (err, out) => (err ? reject(err) : resolve(out))))
}

/** 前台软件（lsappinfo 不要任何权限） */
async function frontApp(): Promise<Front | null> {
  const asn = (await run('lsappinfo', ['front'])).trim()
  if (!asn) return null
  const info = await run('lsappinfo', ['info', '-only', 'name', '-only', 'bundleid', asn])
  const name = /"LSDisplayName"="([^"]*)"/.exec(info)?.[1]
  const bundle = /"CFBundleIdentifier"="([^"]*)"/.exec(info)?.[1]
  return name && bundle ? { name, bundle } : null
}

const isMe = (f: Front | null) => !!f && (f.bundle === BRAND.appId || f.name === app.getName() || f.name === 'Electron')

export interface QuickHooks {
  preload: string
  load: (w: BrowserWindow, page: 'quick') => void
  bg: () => string
  /** 设置里的那组键（⌥⇧T 这种写法） */
  key: () => string
  /** 注册上了没有变了：菜单栏、设置跟着说 */
  changed: () => void
}

export class QuickPanel {
  private win: BrowserWindow | null = null
  private loaded: Promise<void> | null = null
  private prev: Front | null = null
  private shown = false
  private accel: string | null = null
  /** 现在想要的那组（设置里的）和注册上了没有 */
  wanted = ''
  registered = false
  /** 测试：假装前台是谁、还焦点给了谁 */
  private fakeFront: Front | null = null
  private restored: string[] = []

  constructor(private h: QuickHooks) {
    if (E2E)
      (globalThis as unknown as { ctQuick: unknown }).ctQuick = {
        press: () => this.show(),
        isOpen: () => this.shown,
        front: (name: string | null) => (this.fakeFront = name ? { name, bundle: `test.${name}` } : null),
        restored: () => this.restored,
        state: () => ({ wanted: this.wanted, registered: this.registered }),
        id: () => this.win?.webContents.id ?? null,
      }
  }

  /** 照设置注册那组键（设置里换了键也调它） */
  applyKey() {
    const want = this.h.key()
    if (want === this.wanted && (this.registered || E2E)) return
    if (this.accel && !E2E) globalShortcut.unregister(this.accel)
    this.wanted = want
    this.accel = accelOf(want)
    if (E2E) {
      const taken = (process.env.CT_TAKEN_KEYS ?? '').split(',').filter(Boolean)
      this.registered = !taken.includes(want)
    } else {
      try {
        this.registered = globalShortcut.register(this.accel, () => void this.show().catch((e) => console.error('快速加一条弹不出来', e)))
      } catch (e) {
        console.error('全局键注册出错', this.accel, e)
        this.registered = false
      }
      if (!this.registered) console.warn(`全局快捷键 ${want} 被别的软件占了，快速加一条只能从菜单栏打开`)
    }
    this.h.changed()
  }

  /** 先把小框建好、页面载好（软件起来几秒后），第一次按键时马上出来 */
  warm() {
    this.window()
  }

  private window(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const w = new BrowserWindow({
      width: W,
      height: H0,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      // 不激活画布今日：收起时前台还是原来那个软件；全屏的软件上面也弹得出来
      type: 'panel',
      roundedCorners: true,
      hasShadow: true,
      title: 'Canvas Today quick add',
      backgroundColor: this.h.bg(),
      ...(E2E ? { x: -3000, y: 80 } : {}),
      webPreferences: { preload: this.h.preload, contextIsolation: true, sandbox: true, ...(E2E ? { backgroundThrottling: false } : {}) },
    })
    w.setAlwaysOnTop(true, 'floating')
    // 点到别处就收起（不还焦点：人已经点去别处了）；测试不收（别的测试窗口抢焦点会让它无故收起）
    if (!E2E) w.on('blur', () => this.hide(false))
    w.on('closed', () => {
      this.win = null
      this.loaded = null
      this.shown = false
    })
    this.loaded = new Promise((r) => w.webContents.once('did-finish-load', () => r()))
    this.h.load(w, 'quick')
    this.win = w
    return w
  }

  /** 弹出来（已经开着就把光标放回输入框） */
  async show() {
    const w = this.window()
    if (this.shown) {
      w.webContents.send('ct:quickOpen', false)
      if (!E2E) w.focus()
      return
    }
    const f = E2E ? this.fakeFront : await frontApp().catch(() => null)
    this.prev = isMe(f) ? null : f
    await this.loaded
    w.setBackgroundColor(this.h.bg())
    if (!E2E) {
      const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
      w.setPosition(Math.round(area.x + (area.width - W) / 2), Math.round(area.y + area.height * 0.22))
    }
    this.shown = true
    w.webContents.send('ct:quickOpen', true)
    if (!E2E) {
      w.show()
      w.focus()
    }
  }

  /** 收起；restore：回车加上了、按了 Esc，把焦点还给弹之前的那个软件 */
  hide(restore: boolean) {
    if (!this.shown) return
    this.shown = false
    if (!E2E) this.win?.hide()
    const prev = this.prev
    this.prev = null
    if (!restore || !prev) return
    if (E2E) {
      this.restored.push(prev.name)
      return
    }
    // 小框不激活画布今日，平常前台本来就是它；画布今日真被激活了才叫它回来（不然没开窗口的访达会被 open 开一个新窗口）
    void frontApp()
      .then((f) => (isMe(f) ? run('open', ['-b', prev.bundle]) : undefined))
      .catch(() => undefined)
  }

  /** 页面量好自己多高：窗口跟着变（最高 560） */
  fit(h: number) {
    if (this.win && h > 40) this.win.setContentSize(W, Math.min(560, Math.ceil(h)))
  }

  get webContentsId(): number | null {
    return this.win && !this.win.isDestroyed() ? this.win.webContents.id : null
  }

  dispose() {
    if (this.accel && !E2E) globalShortcut.unregister(this.accel)
    this.win?.destroy()
  }
}
