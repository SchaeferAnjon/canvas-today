/**
 * AI 输入框里粘贴 / 拖进来的图（CN-24）：存在软件设置目录的 pasted/（不进库、不进 Git），
 * 发给引擎时读出来；界面用 cn-file://app/pasted/<名字> 显示。存、读、认名字是 @cn/ai-engines 的 PastedImages（画布今日也用它）。
 */
import { BrowserWindow, dialog, ipcMain, nativeImage } from 'electron'
import { join } from 'node:path'
import { type EngineImage, MAX_PASTED_IMAGES, PASTED_PICK_EXTS, PastedImages } from '@cn/ai-engines'

/** 一次最多带几张 */
export const MAX_PASTED = MAX_PASTED_IMAGES

let store = new PastedImages('')

export function setupPasted(appDir: string) {
  store = new PastedImages(join(appDir, 'pasted'))
  ipcMain.handle('ai:paste', (_e, bytes: unknown, mime: unknown) => store.save(bytes, mime))
  // 输入框底行「+」加图（CN-91 方向 C）：系统选图框，选的图存进 pasted/（PNG、JPEG 原样，别的格式画成 PNG），返回名字和文件名；
  // room：输入框还放得下几张。测试模式里选图框被换成记录器（test-mode.ts），测试要用时自己再换
  ipcMain.handle('ai:paste:pick', async (e, room: unknown) => {
    const n = typeof room === 'number' && room > 0 ? Math.min(MAX_PASTED, Math.floor(room)) : 0
    if (!n) return []
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts: Electron.OpenDialogOptions = { title: '加图', properties: ['openFile', 'multiSelections'], filters: [{ name: '图片', extensions: PASTED_PICK_EXTS }] }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled) return []
    return store.addFiles(r.filePaths, n, toPng)
  })
}

/** 选图框里的 gif、webp、heic……画成 PNG */
export function toPng(raw: Uint8Array, file: string): Uint8Array {
  const img = nativeImage.createFromBuffer(Buffer.from(raw))
  if (img.isEmpty()) throw new Error(`「${file}」读不出来，换一张 PNG 或 JPEG`)
  return img.toPNG()
}

/** pasted/ 里一张图在这台 Mac 上的路径（记笔记时拷进库里的附件）；名字不对的报错，不碰别的文件 */
export const pastedPath = (name: string): string => store.path(name)

/** 界面给的名字 → 发给引擎的图（名字不对的报错，不读别的文件） */
export const pastedImages = (names: unknown): Promise<EngineImage[]> => store.images(names)
