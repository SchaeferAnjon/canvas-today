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

/**
 * 右栏 AI 对话（task-ykkoz）真问两句：排进空着的时间（收下写进笔记）、按优先级排（看卡）。额度紧，只问这两句。
 *   CLAUDE_CONFIG_DIR=<登录了的那份> CT_REAL_AI=1 CT_AI_MODEL=sonnet CT_AI_EFFORT=low npx playwright test e2e/real-ai.spec.ts -g 对话
 */
test('真的 Claude Code：右栏 AI 对话问两句，改动卡查过才给看，收下写进笔记', async () => {
  test.setTimeout(420_000)
  const run = await launch({ reminders: { ...CAL_SEED, calAuth: 'full' }, settings: { calendar: { show: true } } })
  const { page } = run
  try {
    await page.locator('.ab[data-k="calendar"]').click()
    await expect(page.locator('.cal-blk.ev', { hasText: '和爸妈视频' })).toBeVisible()
    await page.locator('.abar.r .ab[data-k="ai"]').click()
    const p = page.locator('[data-part="AI 对话"]')
    const ask = async (text: string) => {
      const n = await p.locator('.aim-a').count()
      const t0 = Date.now()
      await p.locator('.aim-in textarea').fill(text)
      await p.locator('.aim-in textarea').press('Enter')
      await expect(p.locator('.aim-a')).toHaveCount(n + 1, { timeout: 5000 })
      await expect(p.locator('.thinking')).toHaveCount(0, { timeout: 240_000 })
      const a = p.locator('.aim-a').last()
      console.log(`[真 AI 对话] 「${text}」${((Date.now() - t0) / 1000).toFixed(1)} 秒\n${await a.innerText()}`)
      return a
    }
    const a1 = await ask('把这周还没定钟点的作业排进空着的时间')
    await expect(a1.locator('.aerr')).toHaveCount(0)
    const c1 = a1.locator('[data-part="改动卡"]')
    await expect(c1).toBeVisible()
    console.log(`[真 AI 对话] 虚线框：${JSON.stringify(await page.locator('.cal-blk.ghost').allInnerTexts())}`)
    if (await c1.getByRole('button', { name: '收下' }).count()) {
      await c1.getByRole('button', { name: '收下' }).click()
      await expect(page.locator('.toast')).toContainText('AI改了')
      console.log(`[真 AI 对话] ${await page.locator('.toast').innerText()}`)
    }
    const a2 = await ask('把收件箱这几条按优先级排好')
    await expect(a2.locator('.aerr')).toHaveCount(0)
    console.log(`[真 AI 对话] 标记：${JSON.stringify(await page.locator('.aim-mv').allInnerTexts())}`)
  } finally {
    await run.close()
  }
})
