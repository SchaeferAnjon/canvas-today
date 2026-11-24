/**
 * 写时间的两种方式在画布今日（task-pd289，和画布笔记同一套 @cn/tasks parseWhen、@cn/calendar 的选择器）：
 * - 快速加一条：打 @ 弹选择器，选的插进输入框，回车加上；⌥⌘T 也弹；本地认不出的问 AI（假 AI），下面写「AI 认出来：」，回车照它加
 * - 任务行：点日子那一格弹选择器，改钟点马上写进那一行，关上说一句带撤销（几次一起撤）；详情「其他…」弹，清掉；选着一条按 ⌥⌘T 弹
 * 钟拨到 2026-11-22 10:20（周日）；一律真点、真打字；无头（CT_E2E=1）、临时库。
 */
import { expect, test } from '@playwright/test'
import { launch, nav, row } from './app'

const picker = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: '定日子和时间' })

test('快速加一条：打 @ 选明天插进输入框、回车加上；⌥⌘T 选钟点；本地认不出的问 AI，回车照它加', async () => {
  const run = await launch({ env: { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '300' } })
  const { page } = run
  try {
    await nav(page, 'inbox').click()
    const qa = page.locator('#qa')
    await qa.click()
    await page.keyboard.type('交周报 @')
    await expect(picker(page)).toBeVisible()
    // 周日开头（画布今日的日历照原型从周日排）
    await expect(picker(page).locator('.cal-mini-g .w').first()).toHaveText('日')
    await picker(page).getByRole('menuitem', { name: /^明天/ }).click()
    await expect(picker(page)).toHaveCount(0)
    await expect(qa).toHaveValue('交周报 明天')
    await expect(qa).toBeFocused()
    await expect(page.locator('#qachips')).toContainText('认出来：')
    // ⌥⌘T：再弹，选钟点，插进去的那一截换成新的
    await page.keyboard.press('Alt+Meta+KeyT')
    await expect(picker(page)).toBeVisible()
    await picker(page).getByRole('combobox', { name: '钟点' }).selectOption('09:00')
    await expect(qa).toHaveValue('交周报 明天 09:00')
    await page.keyboard.press('Escape')
    await expect(picker(page)).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(qa).toHaveValue('')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 交周报 📅 2026-11-23 09:00\n')

    // AI：「圣诞节前买礼物」本地认不出
    await qa.click()
    await page.keyboard.type('圣诞节前买礼物')
    await expect(page.locator('#qachips')).toContainText('AI 认出来：', { timeout: 5000 })
    await page.keyboard.press('Enter')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 买礼物 📅 2026-12-25\n')
  } finally {
    await run.close()
  }
})

test('任务行：点日子那一格弹选择器改钟点，关上说一句、撤销几次一起撤；详情「其他…」清掉；选着一条按 ⌥⌘T 弹', async () => {
  const run = await launch()
  const { page } = run
  try {
    await nav(page, 'list:写作/小论文计划.md').click()
    const before = run.read('写作/小论文计划.md')
    const r = row(page, '补实验图')
    await r.locator('.acc.when').click()
    await expect(picker(page)).toBeVisible()
    // 点日子那一格不是选中这一行（右边详情还是「点一条看详情」）
    await expect(page.locator('[data-part="详情"] .dtitle input')).toHaveCount(0)
    await picker(page).getByRole('combobox', { name: '钟点' }).selectOption('15:00')
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain('- [ ] 补实验图 📅 2026-11-25 15:00 🔼\n')
    await picker(page).getByRole('combobox', { name: '提醒' }).selectOption('提前1小时')
    await expect.poll(() => run.read('写作/小论文计划.md')).toMatch(/- \[ \] 补实验图 📅 2026-11-25 15:00 🔔 提前1小时 🔼 🆔 [a-z0-9]{6}\n/)
    await page.keyboard.press('Escape')
    await expect(picker(page)).toHaveCount(0)
    const toast = page.locator('.toast')
    await expect(toast).toContainText('补实验图')
    await toast.getByRole('button', { name: '撤回' }).click()
    await expect.poll(() => run.read('写作/小论文计划.md')).toBe(before)

    // 详情「其他…」：清掉
    await row(page, '补实验图').click()
    const d = page.locator('[data-part="详情"]')
    await d.getByRole('button', { name: '选别的日子' }).click()
    await expect(picker(page)).toBeVisible()
    await picker(page).getByRole('button', { name: '清掉' }).click()
    await expect(picker(page)).toHaveCount(0)
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain('- [ ] 补实验图 🔼\n')

    // 选着这一条按 ⌥⌘T：弹，点小月历上的 27 号
    await page.locator('.center').click({ position: { x: 5, y: 5 } })
    await row(page, '补实验图').click()
    await page.keyboard.press('Alt+Meta+KeyT')
    await expect(picker(page)).toBeVisible()
    await picker(page).locator('.cal-mini-g button[data-day="2026-11-27"]').click()
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain('- [ ] 补实验图 📅 2026-11-27 🔼\n')
  } finally {
    await run.close()
  }
})
