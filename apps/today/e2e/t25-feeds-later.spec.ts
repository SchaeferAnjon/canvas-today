/**
 * 画布订阅写进来的稍后读（shared/feeds-link.ts，2026-11-25 画布订阅第二批加的接口）：
 * 「收件箱/稍后读.md」里那一行显示成「读：标题」（不露 md 链接），行尾「画布订阅」点了走 canvas-feeds://item/…（测试模式记下，不真开）；
 * 勾掉只改那一行。别的待办一样不变。
 */
import { expect, test } from '@playwright/test'
import { launch, nav, row } from './app'
import { VAULT } from './fixtures'

test('稍后读那一行：显示链接的字、行尾「画布订阅」打开那一篇、勾掉写回', async () => {
  const LATER = '# 稍后读\n\n- [ ] 读：[提示词缓存省下的钱](canvas-feeds://item/a_1b2c)\n'
  const run = await launch({ files: { ...VAULT, '收件箱/稍后读.md': LATER } })
  const { page } = run
  try {
    await nav(page, 'list:收件箱/稍后读.md').click()
    const r = row(page, '提示词缓存省下的钱')
    await expect(r.locator('.rt')).toHaveText('读：提示词缓存省下的钱')
    await expect(r.getByTestId('feeds-chip')).toHaveText('画布订阅')
    if (process.env.CT_FEEDS_SHOT) await page.screenshot({ path: process.env.CT_FEEDS_SHOT })
    await r.getByTestId('feeds-chip').click()
    await expect.poll(() => run.app.evaluate(() => (globalThis as unknown as { cnScreen: string[] }).cnScreen)).toContain('用浏览器打开 canvas-feeds://item/a_1b2c')
    await r.locator('.cb').first().click()
    await expect.poll(() => run.read('收件箱/稍后读.md')).toMatch(/^# 稍后读\n\n- \[x\] 读：\[提示词缓存省下的钱\]\(canvas-feeds:\/\/item\/a_1b2c\) ✅ \d{4}-\d{2}-\d{2}\n$/)
  } finally {
    await run.close()
  }
})
