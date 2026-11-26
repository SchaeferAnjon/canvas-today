/**
 * 没装 Claude Code 时的 AI（task-587os，设计页第 4 节「画布今日、ParaRead 同一套」）：画布笔记「小活」那一行是 Claude API · Haiku 5.5，
 * 画布今日自己还没有 Key、画布笔记有：「拆成小步」先问一句「用画布笔记里存的 Anthropic Key？」，「不用」收起、什么都不写；
 * 「用它」存一份到画布今日自己这里（测试实例只放内存，画布笔记那份从 CT_TEST_NOTES_KEYS 来），接着拆；
 * 设置 › AI 一页：跟画布笔记用同一个、Key 已存一份（后 4 位）。按钮上画 Claude 的标志。
 */
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { launch, row } from './app'

const dlg = (page: Page) => page.getByRole('dialog', { name: '设置' })

test('借画布笔记那把 Key：先问一句，不用就收起；用它存一份接着拆；设置 › AI 写已存一份', async () => {
  const run = await launch({
    env: { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '300', CT_TEST_NOTES_KEYS: JSON.stringify({ anthropic: 'sk-ant-' + 'from-notes-9z9z' /* 编的 Key，拆两段写免得公开导出当成真的 */ }) },
    prepare: (vault) => {
      const ai = join(dirname(vault), 'notes-data', 'ai')
      mkdirSync(ai, { recursive: true })
      writeFileSync(join(ai, 'settings.json'), JSON.stringify({ prefs: { default: { engine: 'anthropic', model: 'claude-sonnet-5-5', effort: 'medium' }, features: { quick: { engine: 'anthropic', model: 'claude-haiku-5-5' } } } }))
    },
  })
  const { page } = run
  try {
    await page.locator('.nav[data-k="list:写作/小论文计划.md"]').click()
    await row(page, '补实验图').click()
    const d = page.locator('[data-part="详情"]')
    const before = run.read('写作/小论文计划.md')
    await d.getByRole('button', { name: '拆成小步' }).click()
    const ask = d.getByTestId('ai-borrow')
    await expect(ask).toContainText('用画布笔记里存的Anthropic Key？')
    await expect(ask).toContainText('同意后存一份到画布今日自己的钥匙串里')
    // 不用：收起，不写，下次照样问
    await ask.getByRole('button', { name: '不用' }).click()
    await expect(d.locator('[data-part="AI 帮忙"]')).toHaveCount(0)
    expect(run.read('写作/小论文计划.md')).toBe(before)
    await d.getByRole('button', { name: '拆成小步' }).click()
    await expect(d.getByTestId('ai-borrow')).toBeVisible()
    if (process.env.CT_SHOTS) await d.locator('[data-part="AI 帮忙"]').screenshot({ path: join(process.env.CT_SHOTS, '12-today-borrow.png') })
    // 用它：存一份，接着拆（假 AI 照原型的回答）
    await d.getByTestId('ai-borrow').getByRole('button', { name: '用它' }).click()
    const box = d.locator('[data-part="AI 帮忙"]')
    await expect(box.locator('.it')).toHaveText(['把三组实验结果导出成表', '画准确率曲线', '画消融对比柱状图', '图注和编号对上正文'])
    await expect(box.locator('.ah')).toContainText('拆成了4步')
    // 再拆一次不再问
    await box.getByRole('button', { name: '不要' }).click()
    await d.getByRole('button', { name: '拆成小步' }).click()
    await expect(box.locator('.it')).toHaveCount(4)
    await expect(d.getByTestId('ai-borrow')).toHaveCount(0)
    expect(await page.evaluate(() => window.ct.aiInfo())).toMatchObject({ engine: 'anthropic', label: 'Claude API', full: 'Claude API · Haiku 5.5' })
    expect((await page.evaluate(() => window.ct.aiInfo())).borrow).toBeUndefined()
    await box.getByRole('button', { name: '不要' }).click()

    // 设置 › AI：跟画布笔记「小活」那一行；Key 已存一份 ••••9z9z
    await page.locator('.ab[data-k="settings"]').click()
    await dlg(page).getByRole('navigation', { name: '设置分页' }).getByRole('button', { name: 'AI', exact: true }).click()
    await expect(dlg(page).locator('[data-row="aiFollow"]')).toContainText('跟画布笔记设置 › AI 的「小活」那一行')
    await expect(dlg(page).getByTestId('ai-pick-quick')).toContainText('Claude API · Haiku 5.5')
    await expect(dlg(page)).toContainText('Key也用画布笔记那把：Claude API')
    await expect(dlg(page)).toContainText('已存一份 · ••••9z9z')
    if (process.env.CT_SHOTS) await dlg(page).screenshot({ path: join(process.env.CT_SHOTS, '13-today-settings.png') })
    // 不用了：删掉画布今日那一份，按钮回到「用它」
    await dlg(page).getByTestId('ai-drop-anthropic').click()
    await expect(dlg(page).getByTestId('ai-borrow-anthropic')).toBeVisible()
    expect((await page.evaluate(() => window.ct.aiInfo())).borrow).toBe('anthropic')
  } finally {
    await run.close()
  }
})
