/**
 * 画布今日写时间（task-pd289）的截图：天青、深湖。CT_SHOTS_WHEN=<目录> 才跑（在 apps/today 下，先 electron-vite build）。
 * 快速加一条打 @ 的选择器、「AI 认出来」、任务行点日子那一格的选择器，和邻页（详情）
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, LOOK, nav, row } from './app'

const DIR = process.env.CT_SHOTS_WHEN
test.skip(!DIR, 'CT_SHOTS_WHEN=<目录> 才截')

const picker = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: '定日子和时间' })

for (const skin of ['sky', 'petrol'] as const) {
  test(`画布今日写时间（${skin}）`, async () => {
    mkdirSync(DIR!, { recursive: true })
    const run = await launch({ settings: LOOK(skin, 'b'), env: { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '200' } })
    const { page } = run
    try {
      await nav(page, 'list:写作/小论文计划.md').click()
      await page.locator('#qa').click()
      await page.keyboard.type('交周报 @')
      await expect(picker(page)).toBeVisible()
      await page.screenshot({ path: join(DIR!, `t1-quick-picker-${skin}.png`) })
      await page.keyboard.press('Escape')
      await page.locator('#qa').fill('')
      await page.locator('#qa').click()
      await page.keyboard.type('圣诞节前买礼物')
      await expect(page.locator('#qachips')).toContainText('AI 认出来', { timeout: 5000 })
      await page.screenshot({ path: join(DIR!, `t2-quick-ai-${skin}.png`) })
      await page.locator('#qa').fill('')
      await row(page, '补实验图').click()
      await expect(page.locator('[data-part="详情"]')).toBeVisible()
      await page.screenshot({ path: join(DIR!, `t3-detail-${skin}.png`) })
      await row(page, '补实验图').locator('.acc.when').click()
      await expect(picker(page)).toBeVisible()
      await page.screenshot({ path: join(DIR!, `t3-row-picker-${skin}.png`) })
    } finally {
      await run.close()
    }
  })
}
