/**
 * 日历（周、月）、四象限：真拖着改日子、钟点、优先级；小月历点一天跳到那一周；⌘K 搜一条、加一条。
 */
import { expect, test } from '@playwright/test'
import { dragTo, launch } from './app'

test('四象限：从「不重要不紧急」拖到「重要且紧急」，那一行加上 ⏫', async () => {
  const run = await launch()
  const { page } = run
  try {
    await page.locator('.ab[data-k="quad"]').click()
    await expect(page.locator('.vhead h1')).toHaveText('四象限')
    const q4 = page.locator('.q.q4')
    const src = q4.locator('.row', { hasText: '改摘要' })
    await dragTo(page, src, page.locator('.q.q1'))
    await expect(page.locator('.toast')).toContainText('「改摘要」改成高优先级')
    await expect(page.locator('.toast')).toContainText('那一行加上 ⏫')
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain('- [ ] 改摘要 ⏫\n')
    await expect(page.locator('.q.q1 .row', { hasText: '改摘要' })).toBeVisible()
    // 再拖回「没设」：记号拿掉
    await dragTo(page, page.locator('.q.q1 .row', { hasText: '改摘要' }), q4)
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain('- [ ] 改摘要\n')
  } finally {
    await run.close()
  }
})

test('日历周看法：拖一块到另一天的某个钟点，📅 日子和钟点都换；拖到「全天」那一行，钟点拿掉', async () => {
  const run = await launch()
  const { page } = run
  try {
    await page.locator('.ab[data-k="calendar"]').click()
    await expect(page.locator('.vhead h1')).toHaveText('日历')
    await expect(page.locator('.cal-head > div')).toHaveCount(8)
    const blk = page.locator('.cal-blk', { hasText: '交论文初稿' })
    await expect(blk).toBeVisible()
    // 拖到 11 月 25 日（第 4 列）的 14:00：格子是 40 一小时，从 0 点起
    const col = page.locator('.cal-col[data-drop="day:2026-11-25"]')
    const box = (await col.boundingBox())!
    const grid = page.locator('.cal-week')
    const scrollTop = await grid.evaluate((g) => g.scrollTop)
    expect(scrollTop).toBe(8 * 40)
    await dragTo(page, blk, col, 14 * 40 + 6)
    await expect(page.locator('.toast')).toContainText('「交论文初稿」挪到了周三 14:00')
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain('- [ ] 交论文初稿 📅 2026-11-25 14:00 🔔 提前1小时 ⏫')
    expect(box.height).toBe(24 * 40)
    // 界面换成新的那一块（在 25 日那一列里）再拖下一次
    await expect(page.locator('.cal-col[data-drop="day:2026-11-25"] .cal-blk', { hasText: '交论文初稿' })).toBeVisible()
    // 拖到 11 月 27 日的「全天」
    await dragTo(page, page.locator('.cal-blk', { hasText: '交论文初稿' }), page.locator('.cal-allday [data-drop="allday:2026-11-27"]'))
    await expect(page.locator('.toast')).toContainText('（全天）')
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain('- [ ] 交论文初稿 📅 2026-11-27 🔔 提前1小时 ⏫')
    await expect(page.locator('.cal-allday .cal-chip', { hasText: '交论文初稿' })).toBeVisible()
  } finally {
    await run.close()
  }
})

test('日历月看法：拖到另一天，钟点留着；‹ › 换月；小月历点一天跳到那一周', async () => {
  const run = await launch()
  const { page } = run
  try {
    await page.locator('.ab[data-k="calendar"]').click()
    await page.getByRole('tab', { name: '月' }).click()
    await expect(page.locator('.cal-mcell')).toHaveCount(35)
    const chip = page.locator('.cal-mcell[data-drop="mday:2026-11-24"] .cal-chip', { hasText: '订冰岛租车' })
    await expect(chip).toBeVisible()
    await dragTo(page, chip, page.locator('.cal-mcell[data-drop="mday:2026-11-30"]'))
    await expect.poll(() => run.read('生活/冰岛行程.md')).toContain('- [ ] 订冰岛租车 📅 2026-11-30 20:00 🔔 准时')
    await page.locator('.cal-bar').getByRole('button', { name: '往后' }).click()
    await expect(page.locator('.vhead .t2')).toContainText('2026年12月')
    await expect(page.locator('.cal-mcell[data-drop="mday:2026-12-05"] .cal-chip', { hasText: '交期中报告' })).toBeVisible()
    // 小月历跟着换到 12 月；点 5 号，回到周看法、从 12 月 5 日起
    await expect(page.locator('.cal-mini-h')).toContainText('2026年12月')
    await page.locator('.cal-mini-g button', { hasText: /^5$/ }).click()
    await expect(page.getByRole('tab', { name: '周' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.cal-head > div').nth(1)).toContainText('5')
    await expect(page.locator('.cal-blk', { hasText: '交期中报告' })).toBeVisible()
  } finally {
    await run.close()
  }
})

test('⌘K：搜一条打开它；没有的就加一条', async () => {
  const run = await launch()
  const { page } = run
  try {
    await page.keyboard.press('Meta+k')
    const pal = page.locator('.pal')
    await expect(pal).toBeVisible()
    await page.keyboard.type('冰岛')
    await expect(pal.locator('.pr', { hasText: '订冰岛租车' })).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(pal).toHaveCount(0)
    await expect(page.locator('[data-part="详情"] .dtitle input')).toHaveValue('订冰岛租车')
    await page.locator('.srch').click()
    await page.keyboard.type('周五 交读书报告')
    await expect(pal.locator('.pr').first()).toContainText('加一条「交读书报告」')
    await page.keyboard.press('Enter')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 交读书报告 📅 2026-11-27\n')
  } finally {
    await run.close()
  }
})
