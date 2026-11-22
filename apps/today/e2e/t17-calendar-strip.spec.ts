/**
 * 共用日历组件里给画布笔记待办首页用的那一个（@cn/calendar 的 CalStrip，设计页 18-待办首页 的 calendar()）：
 * 用 Vite 起 packages/calendar/demo 那一页，无头 Chromium 真点真拖（不起画布今日、不起画布笔记）。
 * 周：七格从今天起、点一天只看那天（右上「只看 11月25日 周三 ×」，再点、点 × 回到全部）；月：带点；‹ › 和「回到今天」；
 * 拖清单里一条到某一格改日子；日程只读（点了交给宿主、拖不动）。
 */
import { chromium, expect, type Page, test } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'

const shell = () => {
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  return readdirSync(cache)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort()
    .reverse()
    .map((d) => join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'))
    .find((p) => existsSync(p))
}

let server: ViteDevServer
test.beforeAll(async () => {
  server = await createServer({ root: join(__dirname, '../../../packages/calendar/demo'), plugins: [react()], logLevel: 'error', server: { port: 0, host: '127.0.0.1' } })
  await server.listen()
})
test.afterAll(async () => server?.close())

async function open(): Promise<{ page: Page; close: () => Promise<void> }> {
  const b = await chromium.launch({ executablePath: shell() })
  const page = await b.newPage({ viewport: { width: 1100, height: 760 } })
  const errs: string[] = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(server.resolvedUrls!.local[0]!)
  await expect(page.locator('.cal-strip')).toBeVisible()
  return {
    page,
    close: async () => {
      expect(errs).toEqual([])
      await b.close()
    },
  }
}

const log = async (page: Page) => JSON.parse((await page.getByTestId('log').textContent())!) as { mode: string; anchor: string; picked: string | null; last: string }

test('CalStrip 周：点一天只看那天、再点或点 × 回到全部；‹ › 和回到今天；日程只读', async () => {
  const { page, close } = await open()
  try {
    await expect(page.locator('.cal-stitle')).toHaveText('11月22日 – 28日')
    await expect(page.locator('.cal-scell')).toHaveCount(7)
    await expect(page.locator('.cal-scell').first().locator('.cal-swh')).toHaveText('22今天')
    // 22 号：日程在前、钟点在前
    await expect(page.locator('.cal-scell[data-day="2026-11-22"] > div:not(.cal-swh)')).toHaveText(['16:00 和爸妈视频', '11:00 复习 Lecture05 的神经元结构图', '读完三篇相关论文'])
    // 点 25 号：只看那天
    await page.locator('.cal-scell[data-day="2026-11-25"]').click()
    await expect(page.locator('.cal-fchip')).toHaveText('只看 11月25日 周三')
    await expect(page.locator('.demo-row')).toHaveText(['补实验图2026-11-25'])
    await expect(page.locator('.cal-scell[data-day="2026-11-25"]')).toHaveClass(/sel/)
    // 点 ×：回到全部
    await page.getByRole('button', { name: '看全部' }).click()
    await expect(page.locator('.cal-fchip')).toHaveCount(0)
    await expect(page.locator('.demo-row')).toHaveCount(5)
    // 再点同一天两次：选上又回到全部
    // （点在日子那一行：格子里的日程是只读的，点日程不算选这一天）
    await page.locator('.cal-scell[data-day="2026-11-23"] .cal-swh').click()
    expect((await log(page)).picked).toBe('2026-11-23')
    await page.locator('.cal-scell[data-day="2026-11-23"] .cal-swh').click()
    expect((await log(page)).picked).toBe(null)
    // 往后一周：出「回到今天」，跨月写全
    await page.getByRole('button', { name: '后一周' }).click()
    await expect(page.locator('.cal-stitle')).toHaveText('11月29日 – 12月5日')
    await page.getByRole('button', { name: '回到今天' }).click()
    await expect(page.locator('.cal-stitle')).toHaveText('11月22日 – 28日')
    await expect(page.getByRole('button', { name: '回到今天' })).toHaveCount(0)
    // 点日程：交给宿主（只读，不选那一天）
    await page.locator('.cal-sev', { hasText: '组会' }).click()
    expect(await log(page)).toMatchObject({ picked: null, last: 'event' })
  } finally {
    await close()
  }
})

test('CalStrip 拖一条到某一格改日子（钟点不变）；月看法带点、过期红点、日程空心圈，点一天也只看那天', async () => {
  const { page, close } = await open()
  try {
    // 真拖：清单里「补实验图」拖到 27 号那一格
    const src = page.locator('.demo-row', { hasText: '补实验图' })
    const dst = page.locator('.cal-scell[data-day="2026-11-27"]')
    const a = (await src.boundingBox())!
    const b = (await dst.boundingBox())!
    await page.mouse.move(a.x + 40, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(a.x + 60, a.y + a.height / 2 + 10, { steps: 4 })
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
    await expect(dst).toHaveClass(/cal-over/)
    await expect(page.locator('.cal-ghost')).toHaveText('补实验图')
    await page.mouse.up()
    expect((await log(page)).last).toBe('drop e → 2026-11-27')
    await expect(page.locator('.cal-scell[data-day="2026-11-27"]')).toContainText('补实验图')
    await expect(page.locator('.cal-ghost')).toHaveCount(0)
    // 月
    await page.getByRole('tab', { name: '月' }).click()
    await expect(page.locator('.cal-stitle')).toHaveText('2026年11月')
    await expect(page.locator('.cal-smc')).toHaveCount(42)
    await expect(page.locator('.cal-smh span')).toHaveText(['一', '二', '三', '四', '五', '六', '日'])
    await expect(page.locator('.cal-smc[data-day="2026-11-21"] .cal-dots i')).toHaveClass(['late'])
    expect(await page.locator('.cal-smc[data-day="2026-11-23"] .cal-dots i').evaluateAll((is) => is.map((i) => i.className))).toEqual(['', 'ev'])
    await expect(page.locator('.cal-smc[data-day="2026-11-22"]')).toHaveClass(/today/)
    await page.locator('.cal-smc[data-day="2026-11-23"]').click()
    await expect(page.locator('.cal-fchip')).toHaveText('只看 11月23日 周一')
    await expect(page.locator('.demo-row')).toHaveText(['交论文初稿2026-11-23'])
    await page.getByRole('button', { name: '下个月' }).click()
    await expect(page.locator('.cal-stitle')).toHaveText('2026年12月')
    await expect(page.getByRole('button', { name: '回到今天' })).toBeVisible()
  } finally {
    await close()
  }
})
