/**
 * 系统日历只读（task-ykkoz，v2 原型「连接系统日历和提醒事项」）：小助手 --memory 的假日历（不碰用户真的日历）。
 * 真点：日历左栏的连接卡（先问日历、再问提醒事项）、日程画进周和月、拖日程说只读、日历 App 里加了一个跟着出来、
 * 设置里关掉再打开；没给权限时卡上说清楚、能打开系统设置。
 */
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { launch } from './app'
import { CAL_SEED } from './fixtures'

test('连接卡：一颗按钮先问日历再问提醒事项；日程只读画进周、月、小月历；拖日程说只读；日历 App 里加的跟着出来', async () => {
  const run = await launch({ reminders: CAL_SEED })
  const { page } = run
  try {
    await page.locator('.ab[data-k="calendar"]').click()
    await expect(page.locator('.vhead .t2')).toHaveText('11月22日 – 11月28日 · 还没连接系统日历')
    const card = page.locator('[data-part="连接系统日历"]')
    await expect(card.locator('b')).toHaveText('连接系统日历和提醒事项')
    await expect(card.locator('li')).toHaveText(['系统问能不能访问日历：点「允许完全访问」', '系统问能不能访问提醒事项：点「好」'])
    await expect(page.locator('.cal-blk.ev')).toHaveCount(0)
    await card.getByRole('button', { name: '连接系统日历和提醒事项' }).click()
    await expect(page.locator('.toast')).toContainText('连上了系统日历和提醒事项')
    await expect(page.locator('.toast')).toContainText('日程只读显示；带提醒的')
    // 系统各问了一次（日历、提醒事项）
    const calls = (JSON.parse(readFileSync(run.remFile, 'utf8')) as { calls: string[] }).calls
    expect(calls.filter((c) => c === 'calRequest')).toHaveLength(1)
    expect(calls.filter((c) => c === 'request')).toHaveLength(1)
    // 左栏：系统日历带锁、提醒事项「画布今日」两边同步
    const panel = page.locator('[data-part="系统日历"]')
    await expect(panel.locator('.sec').first()).toHaveText('系统日历iCloud')
    await expect(panel.locator('.calrow .nm')).toHaveText(['工作', '家里', '课程表', '画布今日'])
    await expect(panel.locator('.hint')).toHaveText('别的提醒事项列表不收进来。日历里的日程在系统「日历」里改。')
    await expect(page.getByTestId('cal-status')).toHaveText('日历、提醒事项已连接')
    await expect(page.locator('.vhead .t2')).toHaveText('11月22日 – 11月28日 · 系统日历的日程只读，待办能拖')
    // 周：日程用它日历的颜色画在那一天、那个钟点；全天的在「全天」那一行
    const video = page.locator('.cal-col[data-drop="day:2026-11-22"] .cal-blk.ev', { hasText: '和爸妈视频' })
    await expect(video).toBeVisible()
    await expect(video.locator('.bm')).toHaveText('16:00 · 家里')
    expect(await video.evaluate((e) => [getComputedStyle(e).borderLeftColor, e.style.top, e.style.height])).toEqual(['rgb(176, 128, 90)', '640px', '38px'])
    await expect(page.locator('.cal-allday [data-drop="allday:2026-11-23"] .cal-chip.ev')).toHaveText('交房租')
    // 拖日程：不动，说只读（组会和 9 点的「发给导师」叠着，各占半格：从块的正中按下）
    const meet = (await page.locator('.cal-blk.ev', { hasText: '组会' }).boundingBox())!
    const to = (await page.locator('.cal-col[data-drop="day:2026-11-26"]').boundingBox())!
    await page.mouse.move(meet.x + meet.width / 2, meet.y + meet.height / 2)
    await page.mouse.down()
    await page.mouse.move(meet.x + meet.width / 2 + 20, meet.y + meet.height / 2 + 10, { steps: 4 })
    await page.mouse.move(to.x + to.width / 2, to.y + 12 * 40, { steps: 10 })
    await page.mouse.up()
    await expect(page.locator('.toast')).toContainText('系统日历里的日程是只读的')
    await expect(page.locator('.toast')).toContainText('在系统「日历」App 里改')
    await expect(page.locator('.cal-col[data-drop="day:2026-11-23"] .cal-blk.ev', { hasText: '组会' })).toBeVisible()
    // 小月历：有日程的日子带点（27 号只有牙医）
    await expect(page.locator('.cal-mini-g button', { hasText: /^27$/ })).toHaveClass(/has/)
    // 日历 App 里加了一个：跟着出来
    await run.app.evaluate(() =>
      (globalThis as unknown as { ctRem: { external: (p: Record<string, unknown>) => Promise<unknown> } }).ctRem.external({ op: 'addEvent', calendar: 'C-work', title: '答辩彩排', start: '2026-11-26T13:00', end: '2026-11-26T14:00' }),
    )
    await expect(page.locator('.cal-col[data-drop="day:2026-11-26"] .cal-blk.ev', { hasText: '答辩彩排' })).toBeVisible()
    // 月：日程在格子里，前面
    await page.getByRole('tab', { name: '月' }).click()
    await expect(page.locator('.vhead .t2')).toHaveText('2026年11月 · 系统日历的日程只读，待办能拖着改日子')
    await expect(page.locator('.cal-mcell[data-drop="mday:2026-11-27"] .cal-chip.ev')).toHaveText('牙医10:00')
    await expect(page.locator('.cal-mcell[data-drop="mday:2026-11-23"] .cal-chip').first()).toHaveText('交房租')
  } finally {
    await run.close()
  }
})

test('设置：关掉就不画、底栏只剩提醒事项；再打开不再问；没给权限时卡上说清楚、能打开系统设置', async () => {
  const run = await launch({ reminders: { ...CAL_SEED, calDenyRequest: true } })
  const { page } = run
  try {
    await page.locator('.ab[data-k="calendar"]').click()
    const card = page.locator('[data-part="连接系统日历"]')
    await card.getByRole('button', { name: '连接系统日历和提醒事项' }).click()
    await expect(page.locator('.toast')).toContainText('没连上：没给访问日历的权限')
    await expect(card).toContainText('没给画布今日访问日历，日程画不出来。')
    await card.getByRole('button', { name: '打开系统设置' }).click()
    await expect
      .poll(() => run.app.evaluate(() => (globalThis as unknown as { cnScreen: string[] }).cnScreen.at(-1)))
      .toBe('用浏览器打开 x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars')
    // 到系统设置里打开了（假日历这边直接改成给了权限），回来在设置里打开开关
    await run.app.evaluate(async () => {
      const g = globalThis as unknown as { ctRem: { set: (p: Record<string, unknown>) => Promise<unknown> } }
      await g.ctRem.set({ calAuth: 'full' })
    })
    await page.keyboard.press('Meta+,')
    const s = page.getByRole('dialog', { name: '设置' })
    await s.getByRole('navigation').getByRole('button', { name: '日历和提醒事项' }).click()
    await expect(s.getByRole('heading', { name: '日历和提醒事项' })).toBeVisible()
    const row = s.locator('[data-row="cal"]')
    await expect(row.getByRole('switch', { name: '显示系统日历的日程' })).toHaveAttribute('aria-checked', 'false')
    await row.getByRole('switch', { name: '显示系统日历的日程' }).click()
    await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await expect(row.locator('.sa-ds')).toHaveText('3个日历的日程只读画在日历里')
    await expect(page.getByTestId('cal-status')).toHaveText('日历已连接')
    await page.keyboard.press('Escape')
    await expect(page.locator('.cal-blk.ev', { hasText: '和爸妈视频' })).toBeVisible()
    const asked = () => (JSON.parse(readFileSync(run.remFile, 'utf8')) as { calls: string[] }).calls.filter((c) => c === 'calRequest').length
    const before = asked()
    // 关掉：不画了
    await page.keyboard.press('Meta+,')
    await s.getByRole('navigation').getByRole('button', { name: '日历和提醒事项' }).click()
    await row.getByRole('switch').click()
    await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    await expect(row.locator('.sa-ds')).toHaveText('系统「日历」里的日程只读画在日历里，排时间时会避开')
    await page.keyboard.press('Escape')
    await expect(page.locator('.cal-blk.ev')).toHaveCount(0)
    await expect(page.getByTestId('cal-status')).toHaveCount(0)
    // 再打开：不再问系统
    await page.keyboard.press('Meta+,')
    await s.getByRole('navigation').getByRole('button', { name: '日历和提醒事项' }).click()
    await row.getByRole('switch').click()
    await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
    await expect(page.locator('.cal-blk.ev', { hasText: '和爸妈视频' })).toBeVisible()
    expect(asked()).toBe(before)
  } finally {
    await run.close()
  }
})
