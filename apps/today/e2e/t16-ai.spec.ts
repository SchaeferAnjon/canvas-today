/**
 * AI（task-ykkoz，v2 原型）：详情「拆成小步」、日历「帮我排进空着的时间」，先给看、收下才写、能撤销；用画布笔记设置里「小活」那一家。
 * 假 AI（CT_AI_FAKE=1）照原型的 splitItems / freeSlots 回答；真的 Claude Code 另外手动跑一遍（交回里写）。
 */
import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { commits, launch, row } from './app'
import { CAL_SEED } from './fixtures'

const AI = { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '500' }

test('拆成小步：想着、拆好了列出来、收下写进那一行下面、撤销回到原来的字节；不要、esc 收起；出错能再试', async () => {
  const run = await launch({ env: { ...AI, CT_AI_FAKE_MS: '1500' } })
  const { page } = run
  try {
    await page.locator('.nav[data-k="list:写作/小论文计划.md"]').click()
    await row(page, '补实验图').click()
    const d = page.locator('[data-part="详情"]')
    const before = run.read('写作/小论文计划.md')
    await d.getByRole('button', { name: '拆成小步' }).click()
    const box = d.locator('[data-part="AI 帮忙"]')
    await expect(box.locator('.ah')).toHaveText('Claude Code 正在拆')
    await expect(box.locator('.thinking')).toBeVisible()
    await expect(box.locator('.ah')).toHaveText('拆成了4步· 收下后写进《小论文计划》这一行下面')
    await expect(box.locator('.it')).toHaveText(['把三组实验结果导出成表', '画准确率曲线', '画消融对比柱状图', '图注和编号对上正文'])
    // 还没收下：文件不动
    expect(run.read('写作/小论文计划.md')).toBe(before)
    await box.getByRole('button', { name: '收下' }).click()
    await expect(page.locator('.toast')).toContainText('加了4步子任务')
    await expect(page.locator('.toast')).toContainText('写进了《小论文计划》那一行下面，缩进一格的「- [ ]」')
    await expect
      .poll(() => run.read('写作/小论文计划.md'))
      .toBe(before.replace('- [ ] 补实验图 📅 2026-11-25 🔼\n', '- [ ] 补实验图 📅 2026-11-25 🔼\n    - [ ] 把三组实验结果导出成表\n    - [ ] 画准确率曲线\n    - [ ] 画消融对比柱状图\n    - [ ] 图注和编号对上正文\n'))
    await expect(d.locator('.subs .s')).toHaveText(['把三组实验结果导出成表', '画准确率曲线', '画消融对比柱状图', '图注和编号对上正文'])
    await expect.poll(() => commits(run.vault)[0]).toBe('画布今日：「补实验图」拆成4步')
    // 撤销：一次全拿掉
    await page.locator('.toast').getByRole('button', { name: '撤销' }).click()
    await expect.poll(() => run.read('写作/小论文计划.md')).toBe(before)
    // 不要：收起，不写
    await d.getByRole('button', { name: '拆成小步' }).click()
    await expect(box.locator('.it')).toHaveCount(4)
    await box.getByRole('button', { name: '不要' }).click()
    await expect(box).toHaveCount(0)
    // 想着的时候按 esc：收起
    await d.getByRole('button', { name: '拆成小步' }).click()
    await expect(box.locator('.thinking')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(box).toHaveCount(0)
    await page.waitForTimeout(800)
    await expect(box).toHaveCount(0)
    expect(run.read('写作/小论文计划.md')).toBe(before)
    // 换一条：框跟着收起
    await d.getByRole('button', { name: '拆成小步' }).click()
    await row(page, '改摘要').click()
    await expect(page.locator('[data-part="AI 帮忙"]')).toHaveCount(0)
    // AI 出错：说出来，能再试一次
    await page.locator('#qa').fill('（测试：AI 出错）')
    await page.locator('#qa').press('Enter')
    await row(page, '（测试：AI 出错）').click()
    await d.getByRole('button', { name: '拆成小步' }).click()
    await expect(box.locator('.ah')).toHaveText('AI 没答出来：Claude Code 退出了（1）：测试用的失败')
    await expect(box.getByRole('button', { name: '再试一次' })).toBeVisible()
  } finally {
    await run.close()
  }
})

test('帮我排进空着的时间：避开日程和有钟点的、虚线框、收下几篇一起改、撤销；右图标栏写用的是哪一家', async () => {
  const run = await launch({
    env: AI,
    reminders: { ...CAL_SEED, calAuth: 'full', auth: 'notDetermined' },
    settings: { calendar: { show: true } },
    // 画布笔记设置里「小活」选的是 Codex
    prepare: (vault) => {
      const dir = join(dirname(vault), 'notes-data', 'ai')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({ engine: 'claude', prefs: { default: { engine: 'claude', model: 'claude-opus-5-5' }, features: { quick: { engine: 'codex' } } } }))
    },
  })
  const { page } = run
  try {
    // 右图标栏：AI · Codex，点了说 AI 在哪两处用
    const aiBtn = page.locator('.abar.r .ab[data-k="ai"]')
    await expect(aiBtn).toHaveAttribute('aria-label', 'AI · Codex')
    await aiBtn.click()
    await expect(page.locator('.ab-say')).toHaveText('Codex：详情里「拆成小步」，日历里「帮我排进空着的时间」')

    await page.locator('.ab[data-k="calendar"]').click()
    await expect(page.locator('.cal-blk.ev', { hasText: '和爸妈视频' })).toBeVisible()
    const paper = run.read('写作/小论文计划.md')
    const inbox = run.read('收件箱/待办.md')
    await page.getByRole('button', { name: '帮我排进空着的时间' }).click()
    const bar = page.locator('.aibar')
    await expect(bar).toContainText('Codex 在看这两天的空档')
    await expect(bar).toContainText('想把4条排进空着的时间')
    await expect(bar).toContainText('避开了系统日历里的日程，虚线框是排好的样子')
    const ghosts = page.locator('.cal-blk.ghost')
    await expect(ghosts).toHaveCount(4)
    // 上面那一排、AI 那条、格子右边对齐（系统设成一直显示滚动条时格子窄 11，上面两样跟着让）
    const right = (sel: string) => page.locator(sel).last().evaluate((e) => Math.round(e.getBoundingClientRect().right))
    const cols = await right('.cal-col')
    expect(Math.abs((await right('.aibar')) - cols), 'AI 那条').toBeLessThanOrEqual(1)
    expect(Math.abs((await right('.cal-bar .cal-seg')) - cols), '月 / 周').toBeLessThanOrEqual(1)
    await expect(page.locator('.cal-col[data-drop="day:2026-11-22"] .cal-blk.ghost', { hasText: '读完三篇相关论文' }).locator('.bm')).toHaveText('12:00 · Codex 排的')
    // 明天 9:30 有组会：排在组会以后
    await expect(page.locator('.cal-col[data-drop="day:2026-11-23"] .cal-blk.ghost', { hasText: '和设计对一遍截图' }).locator('.bm')).toHaveText('10:30 · Codex 排的')
    // 还没收下：文件不动
    expect(run.read('写作/小论文计划.md')).toBe(paper)
    await bar.getByRole('button', { name: '收下' }).click()
    await expect(page.locator('.toast')).toContainText('排好了4条')
    await expect(page.locator('.toast')).toContainText('这几行的 📅 日子后面加上了钟点')
    await expect(ghosts).toHaveCount(0)
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain('- [ ] 读完三篇相关论文 📅 2026-11-22 12:00 🔼')
    await expect.poll(() => run.read('项目/画布今日.md')).toContain('- [ ] 和设计对一遍截图 📅 2026-11-23 10:30 🔼')
    const project = run.read('项目/画布今日.md')
    await expect(page.locator('.cal-col[data-drop="day:2026-11-22"] .cal-blk:not(.ghost):not(.ev)', { hasText: '读完三篇相关论文' })).toBeVisible()
    // 撤销：几篇一起退回
    await page.locator('.toast').getByRole('button', { name: '撤销' }).click()
    await expect.poll(() => run.read('写作/小论文计划.md')).toBe(paper)
    await expect.poll(() => run.read('收件箱/待办.md')).toBe(inbox)
    await expect.poll(() => run.read('项目/画布今日.md')).toBe(project.replace('📅 2026-11-23 10:30', '📅 2026-11-23'))
    // 不要：虚线框收起，不写
    await page.getByRole('button', { name: '帮我排进空着的时间' }).click()
    await expect(ghosts).toHaveCount(4)
    await bar.getByRole('button', { name: '不要' }).click()
    await expect(bar).toHaveCount(0)
    await expect(ghosts).toHaveCount(0)
    expect(run.read('写作/小论文计划.md')).toBe(paper)
  } finally {
    await run.close()
  }
})
