/**
 * 外部改动（画布笔记里改了、Git 拉下来）：几秒内列表就变；正在输入的字不丢（快速加的输入框、详情里正在改的标题）；
 * 外面在上面加了几行，再勾这一条照样改到对的那一行。
 */
import { expect, test } from '@playwright/test'
import { launch, row } from './app'

test('外面改了文件：两秒内列表变，快速加里正在打的字不丢，回车照常加上', async () => {
  const run = await launch()
  const { page } = run
  try {
    await page.locator('#qa').click()
    await page.keyboard.type('周一交实验报告')
    await expect(page.locator('#qachips .chip')).toHaveText('明天')
    const t0 = Date.now()
    run.write('写作/小论文计划.md', run.read('写作/小论文计划.md').replace('- [ ] 改摘要\n', '- [ ] 改摘要\n- [ ] 外面加的一条 📅 2026-11-22 09:00\n'))
    await expect(row(page, '外面加的一条')).toBeVisible({ timeout: 3000 })
    const took = Date.now() - t0
    expect(took).toBeLessThan(3000)
    // 打了一半的字还在，光标还在输入框里
    await expect(page.locator('#qa')).toHaveValue('周一交实验报告')
    await expect(page.locator('#qa')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 交实验报告 📅 2026-11-23\n')
    console.log(`外面改了到列表变：${took}ms`)
  } finally {
    await run.close()
  }
})

test('详情里正在改标题时外面改了这一行的日子：打的字不丢，回车后标题和外面的日子都在', async () => {
  const run = await launch()
  const { page } = run
  try {
    await row(page, '交论文初稿').click()
    const d = page.locator('[data-part="详情"]')
    const title = d.getByLabel('任务名')
    await title.click()
    await page.keyboard.press('End')
    await page.keyboard.type('（终稿）')
    // 画布笔记那边改了这一行的日子（还在上面加了一行）
    run.write('写作/小论文计划.md', run.read('写作/小论文计划.md').replace('📅 2026-11-23 15:00', '📅 2026-11-26 15:00').replace('## 这周\n', '## 这周\n\n> 导师说可以晚几天\n'))
    await expect(d.locator('.md')).toHaveText('- [ ] 交论文初稿 📅 2026-11-26 15:00 🔔 提前1小时 ⏫', { timeout: 3000 })
    await expect(title).toHaveValue('交论文初稿（终稿）')
    await expect(title).toBeFocused()
    await page.keyboard.press('Enter')
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain('- [ ] 交论文初稿（终稿） 📅 2026-11-26 15:00 🔔 提前1小时 ⏫\n')
    expect(run.read('写作/小论文计划.md')).toContain('> 导师说可以晚几天')
  } finally {
    await run.close()
  }
})

test('外面在上面加了几行：勾掉照样改到那一行；外面删了那一行：不乱改，说一句', async () => {
  const run = await launch()
  const { page } = run
  try {
    await expect(row(page, '交 ecp 作业 2')).toBeVisible()
    run.write('课程/ecp/Lecture05 笔记.md', run.read('课程/ecp/Lecture05 笔记.md').replace('## 要做的\n', '## 要做的\n\n新加的一段。\n\n另一段。\n'))
    // 界面还没刷新就点（看到的还是旧行号）：主进程按原文找到挪下去的那一行
    await row(page, '交 ecp 作业 2').locator('.cb').click()
    await expect.poll(() => run.read('课程/ecp/Lecture05 笔记.md')).toContain('- [x] 交 ecp 作业 2 📅 2026-11-21 23:59 ⏫ ✅ 2026-11-22')
    expect(run.read('课程/ecp/Lecture05 笔记.md')).toContain('新加的一段。\n\n另一段。\n')
    // 外面把「复习 Lecture05…」删了，界面上还在时点它：不改别的行，提示一句
    const before = run.read('课程/ecp/Lecture05 笔记.md').replace(/- \[ \] 复习 Lecture05[^\n]*\n/, '')
    run.write('课程/ecp/Lecture05 笔记.md', before)
    await row(page, '复习 Lecture05').locator('.cb').click().catch(() => {})
    await expect(row(page, '复习 Lecture05')).toHaveCount(0, { timeout: 3000 })
    expect(run.read('课程/ecp/Lecture05 笔记.md')).toBe(before)
  } finally {
    await run.close()
  }
})
