/**
 * 右栏网页里的下载（2026-11-21 设置方向 A 第一批新加，task-f7rib）：以前 persist:web 不接下载，点了没反应。
 * 放哪看设置 › 网页和视频「下载放在」：下载文件夹、库里的「附件/下载」、每次问（我们自己弹存储面板，选好了重新下一次放进去；
 * 不用 Electron 自带的面板，测试模式下它会弹到用户屏幕上）。同名的不盖掉，加「 (1)」。下好了、没下成都告诉界面，底栏说一句。
 */
import { app, type BrowserWindow, dialog, ipcMain, type Session, shell } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { WebPrefs } from '../../shared/prefs'
import { E2E } from '../test-mode'
import type { Vault } from '../vault'

/** 下载文件夹：测试用 CN_DOWNLOADS_DIR；测试模式没给时放在测试实例自己的数据目录里，绝不往用户真的「下载」里放 */
const downloadsDir = () => process.env.CN_DOWNLOADS_DIR || (E2E ? join(app.getPath('userData'), 'downloads-test') : app.getPath('downloads'))

/** 网站给的文件名里不能有路径 */
const safeName = (n: string) => basename(n.replace(/[/\\]/g, '_')).replace(/^\.+/, '') || '下载的文件'

/** 同名的已经有了：「名字 (1).扩展名」 */
export function uniquePath(dir: string, name: string): string {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  let p = join(dir, name)
  for (let i = 1; existsSync(p); i++) p = join(dir, `${stem} (${i})${ext}`)
  return p
}

export function setupDownloads(ses: Session, d: { window(): BrowserWindow | null; vault(): Vault | null; mode(): WebPrefs['downloads'] }) {
  /** 「每次问」选好的地方：按网址认，重新下的那一次直接放进去 */
  const chosen = new Map<string, string>()
  /** 软件自己存进去的路径（「在访达中显示」只认这些） */
  const done = new Set<string>()
  const send = (ch: string, ...args: unknown[]) => d.window()?.webContents.send(ch, ...args)

  const track = (item: Electron.DownloadItem, path: string) =>
    item.once('done', (_e, state) => {
      if (state === 'completed') done.add(path)
      send('web:downloaded', { name: basename(path), path: state === 'completed' ? path : null, state })
    })

  ses.on('will-download', (e, item, wc) => {
    const url = item.getURL()
    const pre = chosen.get(url)
    if (pre) {
      chosen.delete(url)
      item.setSavePath(pre)
      return track(item, pre)
    }
    const name = safeName(item.getFilename())
    const mode = d.mode()
    if (mode === 'ask') {
      e.preventDefault()
      const w = d.window()
      const opts: Electron.SaveDialogOptions = { title: '下载放在哪', defaultPath: join(downloadsDir(), name), buttonLabel: '存' }
      void (w ? dialog.showSaveDialog(w, opts) : dialog.showSaveDialog(opts)).then((r) => {
        if (r.canceled || !r.filePath || wc.isDestroyed()) return
        chosen.set(url, r.filePath)
        wc.downloadURL(url)
      })
      return
    }
    const v = d.vault()
    const dir = mode === 'vault' && v ? join(v.root, '附件', '下载') : downloadsDir()
    mkdirSync(dir, { recursive: true })
    const path = uniquePath(dir, name)
    item.setSavePath(path)
    track(item, path)
  })

  ipcMain.handle('web:reveal-download', (_e, path: unknown) => {
    if (typeof path !== 'string' || !done.has(path)) throw new Error('不是软件下好的文件')
    shell.showItemInFolder(path)
  })
}
