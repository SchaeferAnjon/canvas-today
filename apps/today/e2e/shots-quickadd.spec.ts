/**
 * 交付页的截图（画布今日特色第一条线）：全局快速加一条的小框、菜单栏小窗、设置里那组键被占了，天青和深湖各一张。
 *   CT_QUICK_SHOTS=<目录> npx playwright test e2e/shots-quickadd.spec.ts   （先 npx electron-vite build）
 * 不给 CT_QUICK_SHOTS 就跳过。webContents.capturePage 拍 2 倍的 PNG（小框、小窗按真窗口大小）。
 */
import { expect, type ElectronApplication, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, LOOK, type Running } from './app'
import { CAL_SEED } from './fixtures'

const OUT = process.env.CT_QUICK_SHOTS
test.skip(!OUT, '只在出截图时跑（CT_QUICK_SHOTS=<目录>）')

async function capture(app: ElectronApplication, url: string): Promise<Buffer> {
  const b64 = await app.evaluate(async ({ BrowserWindow }, url) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith(url))!
    return (await w.webContents.capturePage()).toPNG().toString('base64')
  }, url)
  return Buffer.from(b64, 'base64')
}
const save = async (run: Running, url: string, name: string) => {
  await new Promise((r) => setTimeout(r, 400))
  mkdirSync(OUT!, { recursive: true })
  writeFileSync(join(OUT!, `${name}.png`), await capture(run.app, url))
}
const press = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctQuick: { press(): Promise<void> } }).ctQuick.press())
const quickPage = async (run: Running) => {
  await expect.poll(() => run.app.windows().some((w) => w.url().endsWith('/quick.html'))).toBe(true)
  return run.app.windows().find((w) => w.url().endsWith('/quick.html'))!
}

for (const tone of ['light', 'dark'] as const) {
  const look = LOOK(tone === 'light' ? 'sky' : 'petrol', 'b')

  test(`小框 ${tone}`, async () => {
    const run = await launch({ settings: look })
    try {
      await press(run)
      const qp = await quickPage(run)
      const box = qp.getByLabel('快速加一条')
      await save(run, '/quick.html', `quick-empty-${tone}`)
      await box.pressSequentially('明天下午三点 交实验报告 提前1小时提醒 #小论文计划 !高')
      await expect(qp.locator('.qdest b')).toHaveText('《小论文计划》')
      await save(run, '/quick.html', `quick-typed-${tone}`)
      await box.fill('')
      await box.pressSequentially('读第五章 #杀死')
      await box.press('Meta+Enter')
      await save(run, '/quick.html', `quick-swap-${tone}`)
      await box.fill('读第五章 #没有这篇')
      await save(run, '/quick.html', `quick-nomatch-${tone}`)
      await box.fill('明天 买牛奶 #家务\n周三下午3点 交第三章习题 #作业 !高\n整理桌面')
      await expect(qp.locator('.qmulti .qr')).toHaveCount(3)
      await save(run, '/quick.html', `quick-multi-${tone}`)
    } finally {
      await run.close()
    }
  })

  test(`菜单栏小窗 ${tone}`, async () => {
    const run = await launch({ settings: { ...look, calendar: { show: true } }, now: '2026-11-22T12:00:00', reminders: { ...CAL_SEED, calAuth: 'full' } })
    try {
      await run.app.evaluate(() => (globalThis as unknown as { ctTrayOpen: () => number }).ctTrayOpen())
      await expect.poll(() => run.app.windows().some((w) => w.url().endsWith('/tray.html'))).toBe(true)
      const tray = run.app.windows().find((w) => w.url().endsWith('/tray.html'))!
      await expect(tray.locator('[data-part="下一件"]')).toBeVisible()
      await tray.locator('.row', { hasText: '取快递' }).locator('.cb').click()
      await expect(tray.locator('.row.done', { hasText: '取快递' })).toBeVisible()
      // 鼠标挪开：不留悬停底色
      await tray.mouse.move(2, 2)
      await save(run, '/tray.html', `tray-${tone}`)
    } finally {
      await run.close()
    }
  })

  test(`设置里键被占了 ${tone}`, async () => {
    const run = await launch({ settings: look, env: { CT_TAKEN_KEYS: '⌥⇧T' } })
    try {
      await run.app.evaluate(() => (globalThis as unknown as { ctTrayOpen: () => number }).ctTrayOpen())
      await expect.poll(() => run.app.windows().some((w) => w.url().endsWith('/tray.html'))).toBe(true)
      const tray = run.app.windows().find((w) => w.url().endsWith('/tray.html'))!
      await expect(tray.locator('.trtaken')).toContainText('被别的软件占了')
      await save(run, '/tray.html', `tray-taken-${tone}`)
      await run.page.keyboard.press('Meta+,')
      await expect(run.page.locator('.set [data-row="quickKey"] [role="alert"]')).toBeVisible()
      await save(run, '/index.html', `settings-taken-${tone}`)
      await run.page.locator('.set [data-row="quickKey"] .sa-keyb').click()
      await save(run, '/index.html', `settings-rec-${tone}`)
    } finally {
      await run.close()
    }
  })
}
