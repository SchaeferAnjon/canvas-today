/**
 * 英文界面走一遍：底栏「简体中文」点一下切 English（记在设置里，重开还是英文），清单、详情、日历、四象限、提示条、右键菜单都是英文；
 * 写进文件的照旧是中文写法（📅、🔔 提前1小时）。再切回中文。
 */
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, row } from './app'
import { armMenus, openedMenu, pickMenu } from './menu'

test('切 English：界面全换，快速加「hand in paper tomorrow 3pm」写进去的是中文写法', async () => {
  const run = await launch()
  const { page } = run
  await armMenus(run)
  try {
    await page.getByRole('button', { name: '切换界面语言' }).click()
    await expect(page.locator('.vhead h1')).toHaveText('Today')
    await expect(page.locator('.vhead .t2')).toHaveText(/^Nov 22 Sun · \d+$/)
    await expect(page.locator('.nav[data-k="inbox"] .nm')).toHaveText('Inbox')
    await expect(page.locator('.nav[data-k="week"] .nm')).toHaveText('Next 7 days')
    await expect(page.locator('.left .sec')).toHaveText('Notes with to-dos')
    await expect(page.locator('.center .grp').first()).toContainText('Overdue')
    await expect(page.locator('.status')).toContainText('All committed')
    await expect(page.locator('.status')).toContainText(/\d+ today/)
    await expect(page.locator('.srch .srch-t')).toHaveText('Search or add a to-do')
    expect(JSON.parse(readFileSync(join(run.userData, 'settings.json'), 'utf8')).lang).toBe('en')
    // 快速加
    await page.locator('#qa').fill('hand in paper tomorrow 3pm')
    await expect(page.locator('#qachips')).toContainText('Understood:')
    await expect(page.locator('#qachips .chip')).toHaveText('Tomorrow 15:00')
    await page.locator('#qa').press('Enter')
    await expect(page.locator('.toast')).toContainText('Added “hand in paper” · Tomorrow 15:00')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] hand in paper 📅 2026-11-23 15:00\n')
    // 详情
    await row(page, '交论文初稿').click()
    const d = page.locator('[data-part="详情"]')
    await expect(d.locator('.lb')).toHaveText(['Date', 'Time', 'Remind', 'Repeat', 'Priority'])
    await expect(d.getByLabel('Remind')).toHaveValue('提前1小时')
    await expect(d.getByLabel('Remind').locator('option:checked')).toHaveText('1 hour before')
    await expect(d.getByRole('button', { name: 'Open note at this line' })).toBeVisible()
    await expect(d.locator('.nh')).toContainText('line 11')
    // 右键菜单
    await row(page, '交论文初稿').click({ button: 'right' })
    const m = await openedMenu(run)
    expect(m.map((i) => i.label)).toEqual(['Today', 'Tomorrow', 'Tue', '—', 'Focus for 25 Minutes', 'Open Note at This Line', '—', 'Delete'])
    expect(m[0]!.sublabel).toBe('Nov 22')
    await pickMenu(run, 'Today')
    await expect(page.locator('.toast')).toContainText('“交论文初稿” moved to Today 15:00')
    // 日历、四象限
    await page.locator('.ab[data-k="calendar"]').click()
    await expect(page.locator('.vhead h1')).toHaveText('Calendar')
    await expect(page.locator('.cal-allday > div').first()).toHaveText('All day')
    await page.locator('.ab[data-k="quad"]').click()
    await expect(page.locator('.q.q1 .qh b')).toHaveText('Important and urgent')
    // 切回中文
    await page.getByRole('button', { name: 'Switch interface language' }).click()
    await expect(page.locator('.vhead h1')).toHaveText('四象限')
  } finally {
    await run.close()
  }
})
