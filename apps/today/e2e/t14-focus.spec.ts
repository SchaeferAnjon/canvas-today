/**
 * 专注（番茄钟，task-ykkoz，v2 原型 focusView）：真点开始、暂停、放弃；拨钟快进到满 25 分钟，记一行进
 * .canvas-tasks/专注/<设备名>/YYYY-MM.csv、那一条加上 🆔、弹通知、提示条；详情「🍅 1」；右键「开始专注 25 分钟」；
 * 别的设备记的（Git 拉下来的）也算进「今天专注了几分钟」。
 */
import { expect, test } from '@playwright/test'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { commits, launch, row } from './app'
import { armMenus, openedMenu, pickMenu } from './menu'

const CSV = '.canvas-tasks/专注/mac-test/2026-11.csv'

test('专注：开始、暂停、放弃；满 25 分钟记进库里、加 🆔、弹通知；详情里「🍅 1」', async () => {
  const run = await launch()
  const { page } = run
  try {
    await page.locator('.ab[data-k="focus"]').click()
    await expect(page.locator('.vhead h1')).toHaveText('专注')
    await expect(page.locator('.vhead .t2')).toHaveText('番茄钟25分钟')
    // 整页：没有左栏、右栏
    await expect(page.locator('aside.left')).toHaveCount(0)
    await expect(page.locator('aside.right')).toHaveCount(0)
    const left = page.getByTestId('focus-left')
    await expect(left).toHaveText('25:00')
    // 还没挂：今天的第一条
    await expect(page.locator('.ring .tm span')).toHaveText('复习 Lecture05 的神经元结构图')
    const pick = page.getByLabel('专注在哪一条')
    // 能挑的：过期、今天、明天的，和「今天」页一个顺序
    const opts = await pick.locator('option').allTextContents()
    expect(opts.slice(0, 4)).toEqual(['交 ecp 作业 2', '复习 Lecture05 的神经元结构图', '写第一批交回', '写本周周报'])
    expect([...opts].sort()).toEqual(['交 ecp 作业 2', '复习 Lecture05 的神经元结构图', '写第一批交回', '写本周周报', '读完三篇相关论文', '取快递', '整理这周的读书笔记', '浇花', '发给导师', '交论文初稿', '和设计对一遍截图', '读第三章'].sort())
    await pick.selectOption({ label: '读完三篇相关论文' })
    await expect(page.locator('.ring .tm span')).toHaveText('读完三篇相关论文')

    // 开始：走起来，底栏写剩几分钟
    await page.getByRole('button', { name: '开始', exact: true }).click()
    await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
    await expect(page.locator('.ring .tm span')).toHaveText('专注中')
    await expect(page.getByTestId('focus-bar')).toBeVisible()
    await expect(left).not.toHaveText('25:00', { timeout: 4000 })
    // 暂停：停住
    await page.getByRole('button', { name: '暂停', exact: true }).click()
    const paused = await left.textContent()
    await page.waitForTimeout(1300)
    await expect(left).toHaveText(paused!)
    await expect(page.getByTestId('focus-bar')).toHaveCount(0)
    // 放弃：回到 25 分钟，不记
    await page.getByRole('button', { name: '放弃' }).click()
    await expect(left).toHaveText('25:00')
    expect(existsSync(join(run.vault, CSV))).toBe(false)

    // 再开始，拨钟到 26 分钟以后：满了
    await page.getByRole('button', { name: '开始', exact: true }).click()
    await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
    await run.app.evaluate(() => (globalThis as unknown as { ctSetClock: (s: string) => void }).ctSetClock('2026-11-22T10:46:00'))
    await expect(page.locator('.toast')).toContainText('专注完了25分钟 · 读完三篇相关论文')
    await expect(page.locator('.toast')).toContainText(`记进了 ${CSV}`)
    await expect(left).toHaveText('25:00')
    await expect(page.getByRole('button', { name: '开始', exact: true })).toBeVisible()
    // 那一条加上了 🆔，记录认它
    await expect.poll(() => run.read('写作/小论文计划.md')).toMatch(/- \[ \] 读完三篇相关论文 📅 2026-11-22 🔼 🆔 [a-z0-9]{6}\n/)
    const id = /读完三篇相关论文 📅 2026-11-22 🔼 🆔 ([a-z0-9]{6})/.exec(run.read('写作/小论文计划.md'))![1]
    await expect.poll(() => (existsSync(join(run.vault, CSV)) ? run.read(CSV) : '')).toBe(`开始,结束,分钟,🆔,标题,笔记\n2026-11-22T10:20,2026-11-22T10:46,25,${id},读完三篇相关论文,写作/小论文计划.md\n`)
    await expect(page.locator('.fl .dsec').nth(1)).toHaveText('今天专注了25分钟')
    await expect(page.locator('.rec')).toHaveText(['10:20–10:46读完三篇相关论文25分钟'])
    const notifs = await run.app.evaluate(() => (globalThis as unknown as { ctNotifs: { title: string; body: string }[] }).ctNotifs)
    expect(notifs.at(-1)).toMatchObject({ title: '专注完了 25 分钟', body: '读完三篇相关论文' })
    await expect.poll(() => commits(run.vault).slice(0, 2).join('\n')).toContain('专注 25 分钟「读完三篇相关论文」')

    // 详情里：专注过一个番茄
    await page.locator('.ab[data-k="lists"]').click()
    await row(page, '读完三篇相关论文').click()
    await expect(page.locator('[data-part="详情专注"]')).toContainText('开始专注25分钟')
    await expect(page.locator('[data-part="详情专注"]')).toContainText('🍅 1')
    // 详情「开始专注」：换到专注、挂上这一条、走起来
    await page.locator('[data-part="详情专注"]').getByRole('button', { name: '开始专注25分钟' }).click()
    await expect(page.locator('.vhead h1')).toHaveText('专注')
    await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
    await expect(page.getByLabel('专注在哪一条').locator('option:checked')).toHaveText('读完三篇相关论文')
    // 底栏点了回到专注
    await page.locator('.ab[data-k="lists"]').click()
    await page.getByTestId('focus-bar').click()
    await expect(page.locator('.vhead h1')).toHaveText('专注')
  } finally {
    await run.close()
  }
})

test('右键「开始专注 25 分钟」；别的设备记的也算进今天', async () => {
  const run = await launch()
  const { page } = run
  await armMenus(run)
  try {
    await row(page, '交论文初稿').click({ button: 'right' })
    expect((await openedMenu(run)).map((i) => i.label)).toEqual(['今天', '明天', '周二', '—', '开始专注 25 分钟', '打开笔记，到这一行', '—', '删除'])
    await pickMenu(run, '开始专注 25 分钟')
    await expect(page.locator('.vhead h1')).toHaveText('专注')
    await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
    await expect(page.getByLabel('专注在哪一条').locator('option:checked')).toHaveText('交论文初稿')
    await expect(page.getByTestId('focus-bar')).toBeVisible()
    // iPhone 上今天早上记的一条（Git 拉下来的）
    mkdirSync(join(run.vault, '.canvas-tasks/专注/iphone'), { recursive: true })
    writeFileSync(join(run.vault, '.canvas-tasks/专注/iphone/2026-11.csv'), '开始,结束,分钟,🆔,标题,笔记\n2026-11-22T08:10,2026-11-22T08:35,25,,复习 Lecture05 的神经元结构图,课程/ecp/Lecture05 笔记.md\n')
    await expect(page.locator('.rec')).toHaveText(['08:10–08:35复习 Lecture05 的神经元结构图25分钟'])
    await expect(page.locator('.fl .dsec').nth(1)).toHaveText('今天专注了25分钟')
    await expect(page.locator('.store')).toHaveText(`记在库里 ${CSV}，一行一次；每台设备记自己那一份，两边不冲突。`)
  } finally {
    await run.close()
  }
})
