/**
 * 重开软件时恢复的网页标签，视频不自己播（task-0t4jq）。
 * 界面给恢复的标签挂 webpreferences="autoplayPolicy=document-user-activation-required"（renderer/web/WebView.tsx 的 hold）：
 * - 浏览器这层：要用户在网页里动过才许出声自动播（iframe 里的、Web Audio 也算），这个网页一直这样，和 Chrome 平常一样；
 * - 网页预加载那层（preload/media-hold.ts）：静音的自动播浏览器不拦，预加载按这里说的「还拦着」把它停下。
 *   用户在这个网页里点过、按过键，或者软件要它播（⌥K、点时刻）之后就不拦了。
 */
import { app, ipcMain, type WebContents, type WebPreferences } from 'electron'
import { HOLD_POLICY } from '../../shared/web-api'

/** 还拦着的网页（webContents id） */
const held = new Set<number>()
/** will-attach-webview 看到的：接下来建的这个网页是不是恢复的标签 */
let nextHeld = false

/**
 * main/index.ts 的 will-attach-webview 里调（webContents 上读不回网页设置，只能在这时看）。
 * Electron 在这个事件之后紧接着同步建出网页的 webContents（web-contents-created），中间不会插进别的网页
 */
export function noteMediaHold(prefs: WebPreferences) {
  nextHeld = prefs.autoplayPolicy === HOLD_POLICY
}

/** 恢复的标签记下来，用户第一次在网页里按下鼠标、按键就放开 */
function hold(wc: WebContents) {
  held.add(wc.id)
  const onInput = (_e: Electron.Event, input: Electron.InputEvent) => {
    if (!/^(mouseDown|keyDown|rawKeyDown|touchStart|gestureTap)$/.test(input.type)) return
    held.delete(wc.id)
    wc.off('input-event', onInput)
  }
  wc.on('input-event', onInput)
  wc.once('destroyed', () => held.delete(wc.id))
}

export function setupMediaHold(isOurWebview: (wc: WebContents) => boolean) {
  app.on('web-contents-created', (_e, wc) => {
    if (wc.getType() !== 'webview' || !nextHeld) return
    nextHeld = false
    hold(wc)
  })
  // 预加载每载入一页问一次：这一页还拦不拦（要在网页脚本跑之前知道，所以是同步的）
  ipcMain.on('web:media-held', (e) => {
    e.returnValue = held.has(e.sender.id)
  })
  // 软件要视频播（⌥K、点时刻跳回那一秒）：算一次用户动作，浏览器就许它出声播；之后这个网页也不拦了
  ipcMain.handle('web:media-release', async (e) => {
    if (!isOurWebview(e.sender)) return
    held.delete(e.sender.id)
    await e.sender.executeJavaScript('0', true)
  })
}
