/**
 * 习惯打卡（task-ykkoz，v2 原型 habitView）：一个习惯一篇 习惯/<名字>.md，打卡是末尾加一行「- 2026-11-22 ✓」。
 * 真点：左图标栏「习惯」、今天的打卡框、补前几天的、撤销、加一个习惯、右键改重复和删除；外面改了（Git 拉下来）界面跟着变。
 */
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { commits, launch } from './app'
import { HABITS, VAULT } from './fixtures'
import { armMenus, openedMenu, openedSubMenu, pickMenu, pickSubMenu } from './menu'

const BEI = '习惯/背 30 个单词.md'

test('习惯：最近七天、连续几次；今天打卡写一行、撤销回到原来的字节；补前几天的；.gitattributes 加上 union 合并', async () => {
  const run = await launch({ files: { ...VAULT, ...HABITS } })
  const { page } = run
  try {
    await page.locator('.ab[data-k="habit"]').click()
    await expect(page.locator('.vhead h1')).toHaveText('习惯')
    await expect(page.locator('.vhead .t2')).toHaveText('最近七天 · 今天打卡')
    // 习惯是整页：没有左栏、没有右栏「详情」
    await expect(page.locator('aside.left')).toHaveCount(0)
    await expect(page.locator('aside.right')).toHaveCount(0)
    const rows = page.locator('.hab')
    await expect(rows).toHaveCount(3)
    await expect(rows.locator('.hn b')).toHaveText(['背 30 个单词', '跑步 3 公里', '早睡'])
    const bei = page.locator(`.hab[data-habit="${BEI}"]`)
    await expect(bei.locator('.hn span')).toHaveText('每天 · 连续2次 · 习惯/背 30 个单词.md')
    // 前六天（周一到周六）：周四没打
    await expect(bei.locator('.days button')).toHaveText(['一', '二', '三', '四', '五', '六'])
    expect(await bei.locator('.days button').evaluateAll((bs) => bs.map((b) => b.className))).toEqual(['y', 'y', 'y', 'x', 'y', 'y'])
    // 跑步：周一三五，今天周日写「休」
    const run3 = page.locator('.hab[data-habit="习惯/跑步 3 公里.md"]')
    expect(await run3.locator('.days button').evaluateAll((bs) => bs.map((b) => [b.className, b.textContent]))).toEqual([
      ['y', '一'],
      ['', ''],
      ['y', '三'],
      ['', ''],
      ['y', '五'],
      ['', ''],
    ])
    await expect(run3.locator('.hrest')).toHaveText('休')
    await expect(run3.locator('.hn span')).toHaveText('每周一、三、五 · 连续3次 · 习惯/跑步 3 公里.md')
    await expect(page.locator('.store')).toHaveText('每个习惯一篇 md，一天一行「- 2026-11-22 ✓」；两台同一天都打卡时两行都留（union 合并），读的时候按日子去重。')

    // 今天打卡
    const before = run.read(BEI)
    await bei.getByRole('button', { name: '今天打卡：背 30 个单词' }).click()
    await expect(page.locator('.toast')).toContainText('「背 30 个单词」今天打卡了')
    await expect(page.locator('.toast')).toContainText('习惯/背 30 个单词.md 末尾加了一行：- 2026-11-22 ✓')
    await expect.poll(() => run.read(BEI)).toBe(before + '- 2026-11-22 ✓\n')
    await expect(bei.locator('.hcheck')).toHaveAttribute('aria-pressed', 'true')
    await expect(bei.locator('.hn span')).toHaveText('每天 · 连续3次 · 习惯/背 30 个单词.md')
    await expect.poll(() => run.read('.gitattributes')).toBe('习惯/*.md merge=union\n')
    await expect.poll(() => commits(run.vault)[0]).toBe('画布今日：「背 30 个单词」打卡 2026-11-22')
    // git 认 union 合并
    expect(execFileSync('git', ['-C', run.vault, 'check-attr', 'merge', '--', BEI], { encoding: 'utf8' }).trim()).toBe(`${BEI}: merge: union`)

    // 撤销：回到原来的字节，.gitattributes 也拿掉
    await page.locator('.toast').getByRole('button', { name: '撤销' }).click()
    await expect.poll(() => run.read(BEI)).toBe(before)
    await expect.poll(() => existsSync(join(run.vault, '.gitattributes'))).toBe(false)
    await expect(bei.locator('.hcheck')).toHaveAttribute('aria-pressed', 'false')

    // 补周四的（点前几天的小方块）
    await bei.locator('.days button').nth(3).click()
    await expect(page.locator('.toast')).toContainText('「背 30 个单词」11月19日补了打卡')
    await expect.poll(() => run.read(BEI)).toBe(before + '- 2026-11-19 ✓\n')
    await expect(bei.locator('.days button').nth(3)).toHaveClass('y')
    await expect(bei.locator('.hn span')).toHaveText('每天 · 连续6次 · 习惯/背 30 个单词.md')
    // 再点一次：取消那一天的
    await bei.locator('.days button').nth(3).click()
    await expect(page.locator('.toast')).toContainText('「背 30 个单词」取消了11月19日的打卡')
    await expect.poll(() => run.read(BEI)).toBe(before)
  } finally {
    await run.close()
  }
})

test('习惯：加一个（工作日，今天周日是「休」）；右键改重复、删除再撤销；外面加了一行打卡，界面跟着变', async () => {
  const run = await launch({ files: { ...VAULT, ...HABITS } })
  const { page } = run
  await armMenus(run)
  try {
    // ⌘K「去哪」里也有习惯
    await page.keyboard.press('Meta+k')
    await page.locator('.pal input').fill('习惯')
    // 打了字第一行是「加一条「习惯」」（还有一行「问AI：习惯」），点「去哪」那一组里的「习惯」
    await page.locator('.pal .pr').filter({ hasNotText: '加一条' }).filter({ hasNotText: '问AI' }).filter({ hasText: '习惯' }).click()
    await expect(page.locator('.vhead h1')).toHaveText('习惯')
    const add = page.getByLabel('加一个习惯，回车')
    await add.click()
    await page.getByLabel('多久一次').selectOption('工作日')
    await page.keyboard.type('早起')
    await page.keyboard.press('Enter')
    await expect(page.locator('.toast')).toContainText('加了习惯「早起」')
    await expect(page.locator('.toast')).toContainText('建了 习惯/早起.md')
    await expect.poll(() => (existsSync(join(run.vault, '习惯/早起.md')) ? run.read('习惯/早起.md') : '')).toBe('---\n重复: 工作日\n开始: 2026-11-22\n---\n# 早起\n\n')
    await expect(add).toHaveValue('')
    const zao = page.locator('.hab[data-habit="习惯/早起.md"]')
    await expect(zao.locator('.hrest')).toHaveText('休')
    // 刚建的：前六天都还没开始，空着
    expect(await zao.locator('.days button').evaluateAll((bs) => bs.map((b) => b.className))).toEqual(['', '', '', '', '', ''])
    await expect.poll(() => commits(run.vault)[0]).toBe('画布今日：新习惯「早起」（工作日）')
    // 同名的再加一次：说一句，不覆盖
    await add.fill('早起')
    await add.press('Enter')
    await expect(page.locator('.toast')).toContainText('已经有「早起」这个习惯了')

    // 右键：打开笔记 · 重复 ▸ · 删除；改成每天
    await zao.click({ button: 'right' })
    expect((await openedMenu(run)).map((i) => i.label)).toEqual(['打开笔记', '重复', '—', '删除'])
    const sub = await openedSubMenu(run, '重复')
    expect(sub.map((i) => i.label)).toEqual(['每天', '工作日', '每周一、三、五', '每周二、四', '每周六、日', '每2天', '每3天'])
    expect(sub.find((i) => i.checked)?.label).toBe('工作日')
    await pickSubMenu(run, '重复', '每天')
    await expect(page.locator('.toast')).toContainText('「早起」改成每天')
    await expect.poll(() => run.read('习惯/早起.md')).toBe('---\n重复: 每天\n开始: 2026-11-22\n---\n# 早起\n\n')
    await expect(zao.getByRole('button', { name: '今天打卡：早起' })).toBeVisible()

    // 删除再撤销
    await zao.click({ button: 'right' })
    await pickMenu(run, '删除')
    await expect(page.locator('.toast')).toContainText('删掉了习惯「早起」')
    await expect.poll(() => existsSync(join(run.vault, '习惯/早起.md'))).toBe(false)
    await expect(zao).toHaveCount(0)
    await page.locator('.toast').getByRole('button', { name: '撤销' }).click()
    await expect.poll(() => existsSync(join(run.vault, '习惯/早起.md'))).toBe(true)
    await expect(zao).toHaveCount(1)

    // 右键「打开笔记」交给画布笔记
    await page.locator('.hab[data-habit="习惯/早睡.md"]').click({ button: 'right' })
    await pickMenu(run, '打开笔记')
    await expect
      .poll(() => run.app.evaluate(() => (globalThis as unknown as { cnScreen: string[] }).cnScreen.at(-1)))
      .toBe(`用浏览器打开 canvas-notes://open?file=${encodeURIComponent('习惯/早睡.md')}`)

    // 外面（另一台设备、Git 拉下来）在早睡末尾加了今天的一行：界面跟着打上勾
    run.write('习惯/早睡.md', readFileSync(join(run.vault, '习惯/早睡.md'), 'utf8') + '- 2026-11-22 ✓\n')
    await expect(page.locator('.hab[data-habit="习惯/早睡.md"] .hcheck')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.hab[data-habit="习惯/早睡.md"] .hn span')).toHaveText('每天 · 连续2次 · 习惯/早睡.md')
  } finally {
    await run.close()
  }
})
