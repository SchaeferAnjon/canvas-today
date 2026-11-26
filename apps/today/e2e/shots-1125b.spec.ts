/**
 * bug 一批 1125b 的交付截图：只在给了 CT_SHOTS_1125B（目录）时截；CT_SHOTS_TAG 是文件名后缀（before / after），
 * 修前那份用 CT_E2E_MAIN 指到修前的构建。假 AI，主题天青、浮岛书桌 B、背景极光，1420 × 799。
 */
import { type Page, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from './app'

const OUT = process.env.CT_SHOTS_1125B ?? ''
const TAG = process.env.CT_SHOTS_TAG ?? 'after'
test.skip(!OUT, '只在出截图时跑（CT_SHOTS_1125B=<目录>）')

const panel = (p: Page) => p.locator('[data-part="AI 对话"]')
const dlg = (p: Page) => p.getByRole('dialog', { name: '设置' })
const file = (name: string) => (mkdirSync(OUT, { recursive: true }), join(OUT, `${name}-${TAG}.png`))
async function say(p: Page, text: string) {
  const ta = panel(p).locator('.aim-in textarea')
  await ta.fill(text)
  await ta.press('Enter')
}

test('2 答着时点「+」再切回去', async () => {
  const run = await launch({ env: { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '2500' } })
  const { page } = run
  try {
    await page.locator('.abar.r .ab[data-k="ai"]').click()
    await say(page, '把收件箱里的按优先级排好')
    await panel(page).locator('.thinking').waitFor()
    await panel(page).getByRole('button', { name: '新对话' }).click()
    await page.waitForTimeout(4000)
    await panel(page).locator('.aim-h .ttl').click()
    await panel(page).locator('.aim-h .aim-menu .it', { hasText: '把收件箱里的按优先级排好' }).click()
    await page.waitForTimeout(800)
    await page.locator('.right').screenshot({ path: file('2-chat') })
  } finally {
    await run.close()
  }
})

test('3 回答按 Markdown 画', async () => {
  const run = await launch({ env: { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '200' } })
  const { page } = run
  try {
    await page.locator('.abar.r .ab[data-k="ai"]').click()
    await say(page, '（测试：Markdown）')
    await panel(page).locator('.aim-a').last().locator('.txt').waitFor()
    await page.waitForTimeout(400)
    await page.locator('.right').screenshot({ path: file('3-md') })
  } finally {
    await run.close()
  }
})

test('4 ⌘K 打「小论文」', async () => {
  const run = await launch()
  const { page } = run
  try {
    await page.keyboard.press('Meta+k')
    await page.locator('.pal input').fill('小论文')
    await page.waitForTimeout(400)
    await page.locator('.pal').screenshot({ path: file('4-pal') })
  } finally {
    await run.close()
  }
})

test('5 6 设置弹窗（浮岛书桌、极光背景）和 AI 页', async () => {
  const run = await launch()
  const { page } = run
  try {
    await page.locator('.ab[data-k="settings"]').click()
    await dlg(page).waitFor()
    await page.waitForTimeout(500)
    await page.screenshot({ path: file('5-set') })
    await dlg(page).getByRole('navigation', { name: '设置分页' }).getByRole('button', { name: 'AI', exact: true }).click()
    await page.waitForTimeout(400)
    await page.locator('.set').screenshot({ path: file('6-ai') })
  } finally {
    await run.close()
  }
})
