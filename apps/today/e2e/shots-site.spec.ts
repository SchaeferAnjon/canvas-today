/**
 * README 和官网用的截图：真软件（测试模式，窗口不上屏）+ e2e/fixtures.ts 里编的样本库，钟拨到 2026-11-22 10:20。
 *   CT_SITE_SHOTS=<目录> npx playwright test e2e/shots-site.spec.ts   （先 npx electron-vite build）
 * 不给 CT_SITE_SHOTS 就跳过。窗口 1420 × 799，webContents.capturePage 拍 2 倍的 PNG；转 JPG、挑哪几张由用的地方决定。
 */
import { expect, type ElectronApplication, type Page, test } from '@playwright/test'
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, LOOK } from './app'
import { VAULT } from './fixtures'

const OUT = process.env.CT_SITE_SHOTS
test.skip(!OUT, '只在出截图时跑（CT_SITE_SHOTS=<目录>）')

const W = 1420
const H = 799

/** 「有待办的笔记」按最近改的排：小论文计划在最上面 */
function times(vault: string) {
  const t = (d: string) => new Date(d).getTime() / 1000
  const at = (p: string, d: string) => utimesSync(join(vault, p), t(d), t(d))
  at('写作/小论文计划.md', '2026-11-22T09:12:00')
  at('课程/ecp/Lecture05 笔记.md', '2026-11-21T20:00:00')
  at('项目/画布今日.md', '2026-11-21T18:00:00')
  at('周记/第47周.md', '2026-11-19T20:00:00')
  at('生活/冰岛行程.md', '2026-11-18T20:00:00')
}

async function capture(app: ElectronApplication, title?: string): Promise<Buffer> {
  const b64 = await app.evaluate(async ({ BrowserWindow }, title) => {
    const w = BrowserWindow.getAllWindows().find((x) => !title || x.getTitle().includes(title)) ?? BrowserWindow.getAllWindows()[0]!
    return (await w.webContents.capturePage()).toPNG().toString('base64')
  }, title)
  return Buffer.from(b64, 'base64')
}

async function shot(name: string, o: { frame: 'a' | 'b'; tone: 'light' | 'dark'; lang?: 'zh' | 'en' }, prep: (p: Page) => Promise<void>) {
  const run = await launch({ settings: LOOK(o.tone === 'light' ? 'sky' : 'petrol', o.frame, o.lang ?? 'zh'), size: { width: W, height: H }, prepare: times })
  try {
    await run.app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w as number, h as number), [W, H] as const)
    await prep(run.page)
    await run.page.mouse.move(700, 790)
    await run.page.waitForTimeout(400)
    mkdirSync(OUT!, { recursive: true })
    writeFileSync(join(OUT!, `${name}.png`), await capture(run.app))
  } finally {
    await run.close()
  }
}

const pick = (title: string) => async (p: Page) => {
  await p.locator('.center .row', { hasText: title }).first().click()
  await expect(p.locator('[data-part="详情"] .dtitle input')).toHaveValue(title)
}

test('今天 + 详情：B 天青、B 深湖', async () => {
  await shot('today-b-light', { frame: 'b', tone: 'light' }, pick('交论文初稿'))
  await shot('today-b-dark', { frame: 'b', tone: 'dark' }, pick('交论文初稿'))
})

test('日历（周）、四象限、快速加', async () => {
  await shot('calendar-b-light', { frame: 'b', tone: 'light' }, async (p) => {
    await p.locator('.ab[data-k="calendar"]').click()
  })
  await shot('calendar-b-dark', { frame: 'b', tone: 'dark' }, async (p) => {
    await p.locator('.ab[data-k="calendar"]').click()
  })
  await shot('quad-a-light', { frame: 'a', tone: 'light' }, async (p) => {
    await p.locator('.ab[data-k="quad"]').click()
  })
  await shot('quick-b-light', { frame: 'b', tone: 'light' }, async (p) => {
    await p.locator('#qa').click()
    await p.keyboard.type('明天下午三点交论文 #写作 !高')
  })
})

test('英文界面', async () => {
  await shot('today-a-en', { frame: 'a', tone: 'light', lang: 'en' }, pick('交论文初稿'))
})

test('菜单栏小窗：浅、深', async () => {
  for (const tone of ['light', 'dark'] as const) {
    const run = await launch({ settings: LOOK(tone === 'light' ? 'sky' : 'petrol', 'b'), size: { width: W, height: H }, prepare: times, files: VAULT })
    try {
      await run.app.evaluate(() => (globalThis as unknown as { ctTrayOpen: () => number }).ctTrayOpen())
      await expect.poll(() => run.app.windows().length).toBe(2)
      const tray = run.app.windows().find((w) => w !== run.page)!
      await tray.setViewportSize({ width: 320, height: 420 })
      await tray.locator('.trh').waitFor()
      await tray.waitForTimeout(300)
      mkdirSync(OUT!, { recursive: true })
      writeFileSync(join(OUT!, `tray-${tone}.png`), await capture(run.app, 'menu bar'))
    } finally {
      await run.close()
    }
  }
})
