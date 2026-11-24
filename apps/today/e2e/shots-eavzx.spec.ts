/**
 * 画布今日 收不收那一套的截图（task-eavzx B 线）：拆成小步、帮我排、收下后底部提示里的撤回，天青、深湖两套，B 浮岛书桌，都是真点。
 * 只在给了 CT_SHOTS（目录）时跑；文件名 sites-today-<split|plan|toast>-<sky|petrol>.png。
 */
import { expect, type Locator, type Page, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, LOOK, row } from './app'
import { CAL_SEED } from './fixtures'

const DIR = process.env.CT_SHOTS
test.skip(!DIR, '只在截图时跑（CT_SHOTS=目录）')

const AI = { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '300' }

async function shot(page: Page, name: string, l?: Locator, pad = 12) {
  await page.waitForTimeout(400)
  const path = join(DIR!, `${name}.png`)
  if (!l) return void (await page.screenshot({ path }))
  const b = (await l.boundingBox())!
  const vp = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
  const x = Math.max(0, b.x - pad)
  const y = Math.max(0, b.y - pad)
  await page.screenshot({ path, clip: { x, y, width: Math.min(vp.width, b.x + b.width + pad) - x, height: Math.min(vp.height, b.y + b.height + pad) - y } })
}

for (const skin of ['sky', 'petrol'] as const) {
  test(`拆成小步、撤回提示 · ${skin}`, async () => {
    mkdirSync(DIR!, { recursive: true })
    const run = await launch({ env: AI, settings: LOOK(skin, 'b') })
    const { page } = run
    try {
      await page.locator('.nav[data-k="list:写作/小论文计划.md"]').click()
      await row(page, '补实验图').click()
      const d = page.locator('[data-part="详情"]')
      await d.getByRole('button', { name: '拆成小步' }).click()
      const box = d.locator('[data-part="AI 帮忙"]')
      await expect(box.getByTestId('ai-split-bar')).toBeVisible({ timeout: 15_000 })
      await page.mouse.move(5, 5)
      await shot(page, `sites-today-split-${skin}`)
      await box.getByTestId('ai-split-bar').locator('[data-act="accept"]').click()
      await expect(page.locator('.toast [data-act="undo"]')).toBeVisible()
      await shot(page, `sites-today-toast-${skin}`, page.locator('.toast'), 24)
    } finally {
      await run.close()
    }
  })

  test(`帮我排 · ${skin}`, async () => {
    mkdirSync(DIR!, { recursive: true })
    const run = await launch({ env: AI, reminders: { ...CAL_SEED, calAuth: 'full', auth: 'notDetermined' }, settings: { ...LOOK(skin, 'b'), calendar: { show: true } } })
    const { page } = run
    try {
      await page.locator('.ab[data-k="calendar"]').click()
      await page.getByRole('button', { name: '帮我排进空着的时间' }).click()
      await expect(page.getByTestId('ai-sched-bar')).toBeVisible({ timeout: 15_000 })
      await page.mouse.move(5, 5)
      await shot(page, `sites-today-plan-${skin}`)
    } finally {
      await run.close()
    }
  })
}
