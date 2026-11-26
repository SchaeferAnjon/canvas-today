/**
 * 测试模式（CN_E2E=1，或通用的 E2E=1）：软件照常跑，但不抢用户的屏幕——
 * 主窗口根本不显示（show: false，从不调 show），放在屏幕外，程序坞里不出图标，
 * 窗口在后台也照常渲染（截图、动画、定时器都正常）。
 */
export const E2E = process.env.CN_E2E === '1' || process.env.E2E === '1'

/** 测试模式：退出的每一步记进设置目录的 quit.log（端到端测试关软件卡住时看卡在哪一步；各个子进程什么时候退的也记） */
export function quitLog(what: string): void {
  if (!E2E) return
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { appendFileSync } = require('node:fs') as typeof import('node:fs')
  appendFileSync(`${app.getPath('userData')}/quit.log`, `${Date.now()} ${what}\n`)
}

/**
 * 测试模式下，凡是会出现在用户屏幕上的东西都不真做，只记下来（globalThis.cnScreen）：
 * 窗口全透明、鼠标穿透、被系统挪回屏幕就再挪出去；
 * 访达窗口、浏览器、打开/存储面板、提示框、系统菜单（不带坐标的菜单弹在鼠标所在的地方，窗口在屏幕外也挡不住）。
 * 测试要用其中哪个，在 app.evaluate 里自己再换掉（后换的生效）。
 * 真要弹系统菜单的测试（退出时收起菜单）设 CN_E2E_REAL_MENUS=1，菜单弹在屏幕外的窗口里。
 */
export function guardScreen(): void {
  if (!E2E) return
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app, dialog, Menu, screen, shell } = require('electron') as typeof import('electron')
  // 窗口：放在屏幕外还不够（macOS 会把整个在屏幕外的窗口拉回来，改大小时尤其会），
  // 所以测试窗口全透明、鼠标穿过去，一被挪进屏幕就挪回去。Playwright 的截图和点按走 CDP，不受影响
  app.on('browser-window-created', (_e, w) => {
    w.setOpacity(0)
    w.setIgnoreMouseEvents(true)
    // 网页里点全屏（YouTube 的全屏键）会让窗口进系统全屏、开一个新桌面：测试窗口不进，网页自己的全屏照样有（记一笔）；
    // 真进了（漏网的）马上退回去
    w.setFullScreenable(false)
    w.on('enter-html-full-screen', () => g.cnScreen.push('网页全屏'))
    w.on('enter-full-screen', () => {
      g.cnScreen.push('窗口进了系统全屏，退回去')
      w.setFullScreen(false)
    })
    const park = () => {
      if (w.isDestroyed()) return
      const b = w.getBounds()
      const onScreen = screen.getAllDisplays().some((d) => {
        const a = d.bounds
        return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y
      })
      if (onScreen) w.setPosition(-20000, 80)
    }
    w.on('move', park)
    w.on('resize', park)
    w.on('show', park)
  })
  const g = globalThis as unknown as { cnScreen: string[]; cnHeldMenu: { menu: Electron.Menu; cb?: () => void } | null }
  g.cnScreen = []
  g.cnHeldMenu = null
  const skip = (what: string) => {
    g.cnScreen.push(what)
    console.log(`[测试模式] 没真的做：${what}`)
  }
  shell.showItemInFolder = (p) => skip(`在访达中显示 ${p}`)
  shell.openExternal = async (url) => skip(`用浏览器打开 ${url}`)
  shell.openPath = async (p) => {
    skip(`打开 ${p}`)
    return ''
  }
  dialog.showOpenDialog = (async () => {
    skip('打开面板')
    return { canceled: true, filePaths: [] }
  }) as typeof dialog.showOpenDialog
  // 再记一条默认存在哪（「存储面板默认：…/Downloads/竞赛调研.pdf」），测试看默认的名字和位置
  dialog.showSaveDialog = (async (...args: unknown[]) => {
    const opts = args.find((a): a is Electron.SaveDialogOptions => !!a && typeof a === 'object' && !('webContents' in a))
    skip('存储面板')
    if (opts?.defaultPath) g.cnScreen.push(`存储面板默认：${opts.defaultPath}`)
    return { canceled: true, filePath: '' }
  }) as typeof dialog.showSaveDialog
  // 记「提示框」，再记一条带问的那句（「提示框：有 1 篇写不进去，字只在内存里」），测试看问的是什么
  dialog.showMessageBox = (async (...args: unknown[]) => {
    const opts = args.find((a): a is Electron.MessageBoxOptions => !!a && typeof (a as { message?: unknown }).message === 'string')
    skip('提示框')
    if (opts) g.cnScreen.push(`提示框：${opts.message}`)
    if (opts?.detail) g.cnScreen.push(`提示框说明：${opts.detail}`)
    return { response: 0, checkboxChecked: false }
  }) as typeof dialog.showMessageBox
  dialog.showErrorBox = (title) => skip(`出错框 ${title}`)
  if (process.env.CN_E2E_REAL_MENUS === '1') {
    const real = Menu.prototype.popup
    Menu.prototype.popup = function (this: Electron.Menu, opts?: Electron.PopupOptions) {
      return real.call(this, { ...opts, x: 0, y: 0 })
    }
  } else {
    Menu.prototype.popup = function (this: Electron.Menu, opts?: Electron.PopupOptions) {
      skip(`系统菜单（${this.items.map((i) => i.label).filter(Boolean).join('、')}）`)
      g.cnHeldMenu = { menu: this, cb: opts?.callback }
    }
  }
}
