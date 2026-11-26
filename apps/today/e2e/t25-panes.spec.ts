/**
 * 栏和栏之间的分隔条（画布今日栏宽拖动）：左栏 / 中间、中间 / 右栏 AI、排一天里这一步 / 「今天的时间」都能真拖，
 * 宽度跟着变、有最窄最宽、双击回到默认、重开软件记住。浮岛书桌、VS Code 两种风格各走一遍。
 * CT_SHOTS=<目录> 时截拖着、拖完的样子（交付页用）。
 */
import { expect, type Locator, type Page, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, LOOK, quit } from './app'
import { CAL_SEED, VAULT } from './fixtures'

const SHOTS = process.env.CT_SHOTS
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(SHOTS, name + '.png') })
}

const width = async (l: Locator) => Math.round((await l.boundingBox())!.width)

/** 按住分隔条正中，横着挪 dx 再松开；hold 在松手前跑（截拖着的样子） */
async function drag(page: Page, sash: Locator, dx: number, hold?: () => Promise<void>) {
  const b = (await sash.boundingBox())!
  const x = b.x + b.width / 2
  const y = b.y + b.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y, { steps: 4 })
  await page.mouse.move(x + dx, y, { steps: 4 })
  await hold?.()
  await page.mouse.up()
}

const NOW = '2026-11-23T08:30:00'

for (const frame of ['b', 'a'] as const) {
  test(`栏宽能拖、双击回默认、重开记住（${frame === 'a' ? 'VS Code 风格' : '浮岛书桌'}）`, async () => {
    test.setTimeout(150_000)
    const settings = { ...LOOK('mint', frame), calendar: { show: true }, plan: { onOpen: true, tray: true, journal: null } }
    const reminders = { ...CAL_SEED, calAuth: 'full' }
    let run = await launch({ reminders, settings, files: VAULT, now: NOW })
    const { root } = run
    let page = run.page
    const leftP = () => page.locator('.body > .left')
    const rightP = () => page.locator('.body > .right')
    const day = () => page.locator('.plan > .pday')
    const sash = (k: string) => page.locator(`[data-sash="${k}"]`)
    try {
      // 右栏开 AI（用户截图那个样子：左栏、排一天、右栏 AI 三块都在）
      await page.locator('.ab[data-k="ai"]').click()
      await expect(rightP()).toBeVisible()
      const L0 = await width(leftP())
      const R0 = await width(rightP())
      const D0 = await width(day())
      expect(L0).toBe(frame === 'a' ? 252 : 242)
      expect(R0).toBe(380)

      // 三条分隔条都在，左右箭头光标
      for (const k of ['left', 'right', 'day']) {
        await expect(sash(k)).toBeVisible()
        expect(await sash(k).evaluate((el) => getComputedStyle(el).cursor)).toBe('col-resize')
        await expect(sash(k)).toHaveAttribute('role', 'separator')
      }
      await shot(page, `${frame}-0-before`)

      // ---------- 排一天：「今天的时间」往左拖 20 变宽 20 ----------
      const D1 = await width(day())
      await drag(page, sash('day'), -20, async () => {
        await shot(page, `${frame}-3-day-dragging`)
      })
      await expect.poll(() => width(day())).toBe(D1 + 20)
      // 最窄 240
      await drag(page, sash('day'), 1000)
      await expect.poll(() => width(day())).toBe(240)
      // 最宽：左边这一步留 320
      await drag(page, sash('day'), -2000)
      await expect.poll(() => width(page.locator('.plan > .pmain'))).toBe(320)
      await drag(page, sash('day'), 2000)
      await expect.poll(() => width(day())).toBe(240)
      await drag(page, sash('day'), -100)
      await expect.poll(() => width(day())).toBe(340)

      // ---------- 左栏：往右拖 60 变宽 60；拖着时亮一条线、整页是左右箭头 ----------
      await drag(page, sash('left'), 60, async () => {
        await expect(sash('left')).toHaveClass(/\bon\b/)
        expect(await page.evaluate(() => document.body.classList.contains('resizing'))).toBe(true)
        await shot(page, `${frame}-1-left-dragging`)
      })
      await expect.poll(() => width(leftP())).toBe(L0 + 60)
      expect(await page.evaluate(() => document.body.classList.contains('resizing'))).toBe(false)
      await expect(sash('left')).not.toHaveClass(/\bon\b/)
      // 最宽 400、最窄 200
      await drag(page, sash('left'), 400)
      await expect.poll(() => width(leftP())).toBe(400)
      await drag(page, sash('left'), -400)
      await expect.poll(() => width(leftP())).toBe(200)
      await drag(page, sash('left'), 80)
      await expect.poll(() => width(leftP())).toBe(280)

      // ---------- 右栏 AI：往左拖 100 变宽 100（用户圈的那条） ----------
      await drag(page, sash('right'), -100, async () => {
        await shot(page, `${frame}-2-right-dragging`)
      })
      await expect.poll(() => width(rightP())).toBe(R0 + 100)
      // 最窄 300
      await drag(page, sash('right'), 300)
      await expect.poll(() => width(rightP())).toBe(300)
      // 中间至少留 420
      await drag(page, sash('right'), -2000)
      await expect.poll(() => width(page.locator('.body > .center'))).toBe(420)
      await drag(page, sash('right'), 2000)
      await expect.poll(() => width(rightP())).toBe(300)
      await drag(page, sash('right'), -40)
      await expect.poll(() => width(rightP())).toBe(340)
      // 时间线拖过的宽还在（中间够宽）
      await expect.poll(() => width(day())).toBe(340)
      await shot(page, `${frame}-4-after`)

      // ---------- 重开：三块宽度都还在 ----------
      await page.waitForTimeout(300)
      await quit(run)
      run = await launch({ root, reminders, settings, now: NOW })
      page = run.page
      await page.locator('.ab[data-k="ai"]').click()
      await expect.poll(() => width(leftP())).toBe(280)
      await expect.poll(() => width(rightP())).toBe(340)
      await expect.poll(() => width(day())).toBe(340)

      // ---------- 双击回到默认（也记住：再重开还是默认） ----------
      await sash('left').dblclick()
      await expect.poll(() => width(leftP())).toBe(L0)
      await sash('right').dblclick()
      await expect.poll(() => width(rightP())).toBe(R0)
      await sash('day').dblclick()
      await expect.poll(() => width(day())).toBe(D0)
      await page.waitForTimeout(300)
      await quit(run)
      run = await launch({ root, reminders, settings, now: NOW })
      page = run.page
      await page.locator('.ab[data-k="ai"]').click()
      await expect.poll(() => width(leftP())).toBe(L0)
      await expect.poll(() => width(rightP())).toBe(R0)
      await expect.poll(() => width(day())).toBe(D0)
    } finally {
      await quit(run)
    }
  })
}
