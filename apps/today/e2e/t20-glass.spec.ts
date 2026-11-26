/**
 * 面板透明度（task-jgely）：画布今日的外观跟画布笔记走时，画布笔记设置里拉的透明度画布今日跟着变（改了几秒内跟上）；
 * 不跟时自己外观页里那一行真拖，三块面板跟着变透、存进自己的设置、重开记得。
 */
import { expect, type Page, test } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GLASS_DEFAULT, GLASS_MAX, GLASS_MIN } from '../../../packages/design/src/glass'

/** 透明度 v 时面板的不透明度：0 到 50 从 100% 匀着降到主题默认 k，50 到 100 再匀着降 16 个百分点（@cn/design/glass） */
const op = (k: number, v: number) => Math.round(v <= GLASS_DEFAULT ? 100 - ((100 - k) * v) / GLASS_DEFAULT : k - (16 * (v - GLASS_DEFAULT)) / (GLASS_MAX - GLASS_DEFAULT))
import { launch, LOOK, quit, type Running } from './app'

const dlg = (page: Page) => page.getByRole('dialog', { name: '设置' })

/** CT_SHOTS=目录 时顺手拍一张（交付图，2 倍） */
async function shot(run: Running, name: string) {
  if (!process.env.CT_SHOTS) return
  mkdirSync(process.env.CT_SHOTS, { recursive: true })
  await run.page.waitForTimeout(300)
  // 只拍网页那一块（窗口比测试定的视口大时，capturePage 整窗下面会多一条白）
  const vp = run.page.viewportSize()!
  const b64 = await run.app.evaluate(async ({ BrowserWindow }, vp) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage({ x: 0, y: 0, ...vp })).toPNG().toString('base64'), vp)
  writeFileSync(join(process.env.CT_SHOTS, `${name}.png`), Buffer.from(b64, 'base64'))
}

/** 左栏、中间、右栏、底栏底色的不透明度（百分数） */
const alphas = (page: Page) =>
  page.evaluate(() => {
    const a = (sel: string) => {
      const c = getComputedStyle(document.querySelector(sel)!).backgroundColor
      const m = c.match(/\/\s*([\d.]+)\)$/) ?? c.match(/rgba\([^)]*,\s*([\d.]+)\)$/)
      return m ? Math.round(Number(m[1]) * 100) : 100
    }
    // 底栏那条磨砂条也跟着变（2026-11-25 按推荐小改，以前固定 82%）
    return { left: a('.fb .left'), center: a('.fb .center'), right: a('.fb .right'), status: a('.fb .status') }
  })

test('跟着画布笔记：那边拉了透明度，这边跟着变', async () => {
  const run = await launch({ settings: { ...LOOK('sky', 'b'), followNotes: true } })
  const { page, root } = run
  const notes = join(root, 'notes-data', 'settings.json')
  try {
    writeFileSync(notes, JSON.stringify({ appearance: { followSystem: false, skin: 'sky', frame: 'b', winBg: 'aurora', glassLevel: GLASS_MAX } }))
    await expect.poll(() => alphas(page), { timeout: 5000 }).toEqual({ left: op(80, GLASS_MAX), center: op(80, GLASS_MAX), right: op(80, GLASS_MAX), status: op(80, GLASS_MAX) })
    await shot(run, 'today-sky-max')
    writeFileSync(notes, JSON.stringify({ appearance: { followSystem: false, skin: 'petrol', frame: 'b', winBg: 'aurora', glassLevel: GLASS_MIN } }))
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'petrol', { timeout: 5000 })
    await expect.poll(() => alphas(page), { timeout: 5000 }).toEqual({ left: 100, center: 100, right: 100, status: 100 })
    // 画布笔记回到默认：这边也回到用户认可的那版
    writeFileSync(notes, JSON.stringify({ appearance: { followSystem: false, skin: 'petrol', frame: 'b', winBg: 'aurora' } }))
    await expect.poll(() => alphas(page), { timeout: 5000 }).toEqual({ left: 82, center: 82, right: 82, status: 82 })
    await shot(run, 'today-petrol-default')
  } finally {
    await run.close()
  }
})

test('不跟画布笔记：自己外观页里拖透明度，存下、重开记得', async () => {
  const run = await launch({ settings: { ...LOOK('sky', 'b'), followNotes: false } })
  const { page, root, userData } = run
  let again: Awaited<ReturnType<typeof launch>> | undefined
  try {
    expect(await alphas(page)).toEqual({ left: 80, center: 80, right: 80, status: 80 })
    await shot(run, 'today-sky-default')
    await page.locator('.ab[data-k="settings"]').click()
    await dlg(page).getByRole('navigation', { name: '设置分页' }).getByRole('button', { name: '外观' }).click()
    const slider = dlg(page).getByRole('slider', { name: '面板透明度' })
    await slider.scrollIntoViewIfNeeded()
    await expect(slider).toHaveValue(String(GLASS_DEFAULT))
    const b = (await slider.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width + 30, b.y + b.height / 2, { steps: 8 })
    await page.mouse.up()
    await expect(slider).toHaveValue(String(GLASS_MAX))
    expect(await alphas(page)).toEqual({ left: op(80, GLASS_MAX), center: op(80, GLASS_MAX), right: op(80, GLASS_MAX), status: op(80, GLASS_MAX) })
    // 停手后存进自己的设置，底下提示条说改成了多少
    await expect.poll(() => JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')).appearance.glassLevel).toBe(GLASS_MAX)
    await expect(page.getByText(`「面板透明度」改成「透 ${GLASS_MAX}%」`)).toBeVisible()
    await quit(run)
    again = await launch({ root })
    expect(await alphas(again.page)).toEqual({ left: op(80, GLASS_MAX), center: op(80, GLASS_MAX), right: op(80, GLASS_MAX), status: op(80, GLASS_MAX) })
  } finally {
    if (again) await again.close()
    else await run.close()
  }
})
