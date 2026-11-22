/**
 * 真的 AI（task-ykkoz）：本机的 Claude Code 真问真答走一遍「拆成小步」「帮我排进空着的时间」（不是假 AI）。平时跳过：
 *   CT_REAL_AI=1 ANTHROPIC_API_KEY=… CT_AI_MODEL=sonnet CT_AI_EFFORT=low npx playwright test e2e/real-ai.spec.ts
 * 跑之前去掉继承来的 CLAUDE_* 环境变量（不然命令行以为自己在别的会话里）。问一次、不给工具、不留会话记录（--no-session-persistence）。
 */
import { expect, test } from '@playwright/test'
import { launch, row } from './app'
import { CAL_SEED } from './fixtures'

test.skip(process.env.CT_REAL_AI !== '1', '真 AI：CT_REAL_AI=1 才跑')

test('真的 Claude Code：拆成小步、排进空着的时间，收下写进笔记', async () => {
  test.setTimeout(420_000)
  const run = await launch({ reminders: { ...CAL_SEED, calAuth: 'full' }, settings: { calendar: { show: true } } })
  const { page } = run
  try {
    // 拆成小步
    await page.locator('.nav[data-k="list:写作/小论文计划.md"]').click()
    await row(page, '补实验图').click()
    const d = page.locator('[data-part="详情"]')
    let t0 = Date.now()
    await d.getByRole('button', { name: '拆成小步' }).click()
    const box = d.locator('[data-part="AI 帮忙"]')
    await expect(box.getByRole('button', { name: '收下' }).or(box.getByRole('button', { name: '再试一次' }))).toBeVisible({ timeout: 180_000 })
    console.log(`[真 AI] 拆成小步 ${((Date.now() - t0) / 1000).toFixed(1)} 秒：${await box.locator('.ah').innerText()}`)
    const steps = await box.locator('.it').allInnerTexts()
    console.log(`[真 AI] 几步：${JSON.stringify(steps)}`)
    expect(steps.length).toBeGreaterThanOrEqual(3)
    await box.getByRole('button', { name: '收下' }).click()
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain(`    - [ ] ${steps[0]}`)

    // 排进空着的时间
    await page.locator('.ab[data-k="calendar"]').click()
    await expect(page.locator('.cal-blk.ev', { hasText: '和爸妈视频' })).toBeVisible()
    t0 = Date.now()
    await page.getByRole('button', { name: '帮我排进空着的时间' }).click()
    const bar = page.locator('.aibar')
    await expect(bar.getByRole('button', { name: '收下' }).or(bar.getByRole('button', { name: '再试一次' })).or(bar.getByRole('button', { name: '关闭' }))).toBeVisible({ timeout: 180_000 })
    console.log(`[真 AI] 排空档 ${((Date.now() - t0) / 1000).toFixed(1)} 秒：${await bar.innerText()}`)
    const ghosts = await page.locator('.cal-blk.ghost').allInnerTexts()
    console.log(`[真 AI] 虚线框：${JSON.stringify(ghosts)}`)
    expect(ghosts.length).toBeGreaterThan(0)
    await bar.getByRole('button', { name: '收下' }).click()
    await expect(page.locator('.toast')).toContainText('排好了')
    console.log(`[真 AI] ${await page.locator('.toast').innerText()}`)
  } finally {
    await run.close()
  }
})
