/**
 * 测试模式（CT_E2E=1，或者和画布笔记一样的 CN_E2E=1、通用的 E2E=1）：软件照常跑，但不碰用户的屏幕：
 * 窗口从不显示（show: false，从不调 show），放在屏幕外、全透明、鼠标穿透，被系统挪回屏幕就再挪出去；程序坞里不出图标；
 * 不建真的菜单栏图标；通知、在访达中显示、用浏览器打开、打开面板、提示框、系统菜单都换成记录器（globalThis.cnScreen），
 * 到点的通知记在 globalThis.ctNotifs，测试用 globalThis.ctNotifAct(第几条, 按钮) 像人一样点通知上的按钮。
 * 照画布笔记 apps/notes/src/main/test-mode.ts 的做法。
 */
export const E2E = process.env.CT_E2E === '1' || process.env.CN_E2E === '1' || process.env.E2E === '1'

export function guardScreen(): void {
  if (!E2E) return
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app, dialog, Menu, screen, shell } = require('electron') as typeof import('electron')
  app.on('browser-window-created', (_e, w) => {
    w.setOpacity(0)
    w.setIgnoreMouseEvents(true)
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
    park()
  })
  const g = globalThis as unknown as { cnScreen: string[] }
  g.cnScreen = []
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
  dialog.showSaveDialog = (async () => {
    skip('存储面板')
    return { canceled: true, filePath: '' }
  }) as typeof dialog.showSaveDialog
  dialog.showMessageBox = (async (...args: unknown[]) => {
    const opts = args.find((a): a is Electron.MessageBoxOptions => !!a && typeof (a as { message?: unknown }).message === 'string')
    skip('提示框' + (opts ? `：${opts.message}` : ''))
    return { response: 0, checkboxChecked: false }
  }) as typeof dialog.showMessageBox
  dialog.showErrorBox = (title) => skip(`出错框 ${title}`)
  // 不带坐标的系统菜单弹在鼠标所在的地方（窗口在屏幕外也挡不住）：只记下来，测试用 e2e/menu.ts 读、点
  Menu.prototype.popup = function (this: Electron.Menu) {
    skip(`系统菜单（${this.items.map((i) => i.label).filter(Boolean).join('、')}）`)
  }
}
