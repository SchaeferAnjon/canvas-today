// Electron 45 起从没显示过的窗口，渲染进程一开始就按「在后台」降优先级，机器一忙就一直停在加载中（MeetCaption 先查到，2026-11-25）。
// 主进程在 app ready 前加 disable-renderer-backgrounding（scripts/test/renderer-backgrounding.test.ts 守着那一行）。
// 这里在真软件里看：开关在；测试模式下从没显示过的主窗口加载完、动画帧在跑；再新开一个隐藏窗口（同快速加一条、菜单栏弹窗那种）加载得出来。
// 修前只有「开关在」那一条挂：降优先级只在机器忙时卡住（画布笔记的同一条在占满 CPU 时也没复现出来；最小复现空 Electron 45 + show:false 占满 CPU 时 40 秒加载不完，加开关 0.2 秒）
import { expect, test } from '@playwright/test'
import { launch } from './app'

test('隐藏窗口不降优先级：开关在，从没显示过的主窗口加载完、动画帧在跑，新开的隐藏窗口加载得出来', async () => {
  const run = await launch({ files: { '甲篇.md': '# 甲篇\n\n- [ ] 买菜\n' } })
  const { app, page } = run
  try {
    expect(await app.evaluate(({ app }) => app.commandLine.hasSwitch('disable-renderer-backgrounding'))).toBe(true)
    // 测试模式：主窗口从没显示过，照样加载完、requestAnimationFrame 在跑
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible()))).toBe(false)
    expect(await page.evaluate(() => document.readyState)).toBe('complete')
    const frames = await page.evaluate(() => new Promise<number>((r) => { let n = 0; const tick = () => (++n >= 5 ? r(n) : requestAnimationFrame(tick)); requestAnimationFrame(tick) }))
    expect(frames).toBe(5)
    // 新开一个隐藏窗口，等它加载完（不降优先级时 1 秒内；10 秒没好算挂）
    const r = await app.evaluate(
      ({ BrowserWindow }) =>
        new Promise<{ ok: boolean; ms: number; vis?: string }>((done) => {
          const t0 = Date.now()
          const w = new BrowserWindow({ show: false, x: -3000, y: -3000, webPreferences: { sandbox: true } })
          const end = (ok: boolean, vis?: string) => {
            done({ ok, ms: Date.now() - t0, vis })
            w.destroy()
          }
          const timer = setTimeout(() => end(false), 10_000)
          w.webContents.once('did-finish-load', () => {
            void w.webContents.executeJavaScript('new Promise((r) => requestAnimationFrame(() => r(document.visibilityState)))').then((vis: string) => {
              clearTimeout(timer)
              end(true, vis)
            })
          })
          void w.loadURL('data:text/html;charset=utf-8,<p>hidden</p>')
        }),
    )
    console.log('新开的隐藏窗口', r)
    expect(r.ok).toBe(true)
  } finally {
    await run.close()
  }
})
