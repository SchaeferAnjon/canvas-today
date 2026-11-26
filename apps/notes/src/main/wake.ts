/**
 * 看不见的网页、窗口照前台优先级跑（AI 开在 AI 后面的网页、印 PDF 的隐藏窗口）。
 * Chromium 把看不见的页的渲染进程降成后台优先级（ps 的 pri 是 4），Mac 一忙它就几乎分不到 CPU：网页载不完、脚本几十秒不回话、PDF 印半分钟。
 * 只在 webPreferences 里写 backgroundThrottling: false 不够（一开始就藏着的页照样降）；setBackgroundThrottling 会对藏着的页调一次 WasShown，
 * 先设 true 再设 false，保证真走一遍。换页会换渲染进程，新的又当后台页起，要在 did-navigate 后再叫一次
 */
import type { WebContents } from 'electron'

export function wakeHidden(wc: WebContents): void {
  wc.setBackgroundThrottling(true)
  wc.setBackgroundThrottling(false)
}
