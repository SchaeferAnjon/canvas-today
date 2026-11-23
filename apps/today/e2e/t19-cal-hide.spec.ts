/**
 * 系统日历「不在这里显示」（task-ov5bb，用户「这里的系统日历能不能选择右键不显示? 因为显示了之后 效果是这样的」）：
 * 假日历多一个「提醒事项」（系统把排了时间的提醒画成日程，和待办重复）。真点：左栏右键 → 不在这里显示 → 周、全天、月、小月历的点都没了；
 * 点色块藏起、再点显示；右键「在这里显示」「全部显示」；重开软件还记得；画布笔记那边改了共用的 calendars.json 这边几秒内跟上（id 找不到时认名字 + 来源）。
 */
import { expect, type Page, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, quit } from './app'
import { CAL_REM_SEED } from './fixtures'
import { armMenus, openedMenu, pickMenu } from './menu'

const row = (page: Page, name: string) => page.locator('[data-part="系统日历"] .calrow', { hasText: name })
const remBlk = (page: Page, title: string) => page.locator('.cal-blk.ev', { hasText: title })

test('右键「不在这里显示」：周、全天、月、小月历里那个日历都没了；点色块切换；右键给「在这里显示」「全部显示」；重开还记得；画布笔记那边改了跟上', async () => {
  let run = await launch({ reminders: CAL_REM_SEED, settings: { calendar: { show: true } } })
  const shared = join(run.root, 'notes-data', 'calendars.json')
  const root = run.root
  try {
    const { page } = run
    await page.locator('.ab[data-k="calendar"]').click()
    await expect(page.locator('[data-part="系统日历"] .calrow .nm')).toHaveText(['提醒事项', '工作', '家里', '课程表'])
    // 改前：「提醒事项」把排了时间的提醒画成粉块，和待办重复
    await expect(remBlk(page, '交实验报告')).toBeVisible()
    await expect(page.locator('.cal-col[data-drop="day:2026-11-23"] .cal-blk.ev', { hasText: '交论文初稿' })).toBeVisible()
    await expect(page.locator('.cal-allday [data-drop="allday:2026-11-26"] .cal-chip.ev')).toHaveText('续签证材料')
    await expect(page.locator('.cal-mini-g button', { hasText: /^30$/ })).toHaveClass(/has/)

    // 右键：菜单只有「不在这里显示」（还没有藏起的，不给「全部显示」）
    await armMenus(run)
    await row(page, '提醒事项').click({ button: 'right' })
    expect((await openedMenu(run)).map((i) => i.label)).toEqual(['不在这里显示'])
    await pickMenu(run, '不在这里显示')
    await expect(row(page, '提醒事项')).toHaveClass(/off/)
    await expect(row(page, '提醒事项').locator('.calsw')).toHaveAttribute('aria-pressed', 'false')
    await expect(row(page, '提醒事项').locator('.calsw')).toHaveAttribute('aria-label', '在这里显示「提醒事项」')
    // 周：提醒那几块没了，待办自己的白块、别的日历的日程还在
    await expect(remBlk(page, '交实验报告')).toHaveCount(0)
    await expect(page.locator('.cal-col[data-drop="day:2026-11-23"] .cal-blk.ev', { hasText: '交论文初稿' })).toHaveCount(0)
    await expect(page.locator('.cal-col[data-drop="day:2026-11-23"] .cal-blk:not(.ev)', { hasText: '交论文初稿' })).toBeVisible()
    await expect(remBlk(page, '和爸妈视频')).toBeVisible()
    // 全天那一行、小月历的点
    await expect(page.locator('.cal-allday [data-drop="allday:2026-11-26"] .cal-chip.ev')).toHaveCount(0)
    await expect(page.locator('.cal-allday [data-drop="allday:2026-11-23"] .cal-chip.ev')).toHaveText('交房租')
    await expect(page.locator('.cal-mini-g button', { hasText: /^30$/ })).not.toHaveClass(/has/)
    await expect(page.locator('.cal-mini-g button', { hasText: /^27$/ })).toHaveClass(/has/)
    // 记进共用文件（按 id，带名字和来源兜底）
    expect(JSON.parse(readFileSync(shared, 'utf8'))).toEqual({ hidden: [{ id: 'C-rem', title: '提醒事项', source: 'iCloud' }] })
    // 月：也不画
    await page.getByRole('tab', { name: '月' }).click()
    await expect(page.locator('.cal-mcell[data-drop="mday:2026-11-27"] .cal-chip.ev')).toHaveText('牙医10:00')
    await expect(page.locator('.cal-mcell .cal-chip.ev', { hasText: '打电话给银行' })).toHaveCount(0)
    await expect(page.locator('.cal-mcell .cal-chip.ev', { hasText: '买牛奶' })).toHaveCount(0)
    await page.getByRole('tab', { name: '周' }).click()

    // 点「家里」的色块：藏起；右键它：在这里显示 · 全部显示
    await row(page, '家里').locator('.calsw').click()
    await expect(row(page, '家里')).toHaveClass(/off/)
    await expect(remBlk(page, '和爸妈视频')).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: '设置' })).toHaveCount(0)
    await row(page, '家里').click({ button: 'right' })
    expect((await openedMenu(run)).map((i) => i.label)).toEqual(['在这里显示', '—', '全部显示'])
    await pickMenu(run, '在这里显示')
    await expect(row(page, '家里')).not.toHaveClass(/off/)
    await expect(remBlk(page, '和爸妈视频')).toBeVisible()
    // 点「提醒事项」的色块：回来了
    await row(page, '提醒事项').locator('.calsw').click()
    await expect(row(page, '提醒事项')).not.toHaveClass(/off/)
    await expect(remBlk(page, '交实验报告')).toBeVisible()
    await expect(page.locator('.cal-mini-g button', { hasText: /^30$/ })).toHaveClass(/has/)
    // 藏起两个，右键「全部显示」：都回来
    await row(page, '提醒事项').locator('.calsw').click()
    await row(page, '课程表').locator('.calsw').click()
    await expect(remBlk(page, 'ecp 课')).toHaveCount(0)
    await row(page, '工作').click({ button: 'right' })
    expect((await openedMenu(run)).map((i) => i.label)).toEqual(['不在这里显示', '—', '全部显示'])
    await pickMenu(run, '全部显示')
    await expect(page.locator('[data-part="系统日历"] .calrow.off')).toHaveCount(0)
    await expect(remBlk(page, 'ecp 课')).toBeVisible()
    await expect(remBlk(page, '交实验报告')).toBeVisible()
    expect(JSON.parse(readFileSync(shared, 'utf8'))).toEqual({ hidden: [] })

    // 藏起「提醒事项」，退出、重开：还记得
    await row(page, '提醒事项').locator('.calsw').click()
    await expect(remBlk(page, '交实验报告')).toHaveCount(0)
    await quit(run)
    run = await launch({ root })
    const p2 = run.page
    await p2.locator('.ab[data-k="calendar"]').click()
    await expect(row(p2, '工作')).toBeVisible()
    await expect(row(p2, '提醒事项')).toHaveClass(/off/)
    await expect(remBlk(p2, '组会')).toBeVisible()
    await expect(remBlk(p2, '交实验报告')).toHaveCount(0)

    // 画布笔记那边「全部显示」（写同一份文件）：几秒内跟上
    writeFileSync(shared, JSON.stringify({ hidden: [] }))
    await expect(row(p2, '提醒事项')).not.toHaveClass(/off/, { timeout: 5000 })
    await expect(remBlk(p2, '交实验报告')).toBeVisible()
    // 别的 id（另一台 Mac 上记的、日历重建过）：认名字 + 来源
    writeFileSync(shared, JSON.stringify({ hidden: [{ id: 'SOME-OTHER-ID', title: '提醒事项', source: 'iCloud' }] }))
    await expect(row(p2, '提醒事项')).toHaveClass(/off/, { timeout: 5000 })
    await expect(remBlk(p2, '交实验报告')).toHaveCount(0)
    // 点色块显示：兜底认出来的那条也拿掉
    await row(p2, '提醒事项').locator('.calsw').click()
    await expect(remBlk(p2, '交实验报告')).toBeVisible()
    expect(JSON.parse(readFileSync(shared, 'utf8'))).toEqual({ hidden: [] })
  } finally {
    await run.close()
  }
})

test('设置里「N个日历的日程只读画在日历里」只数显示着的；英文界面的右键菜单', async () => {
  const run = await launch({ reminders: CAL_REM_SEED, settings: { calendar: { show: true }, lang: 'en' } })
  const { page } = run
  try {
    await page.locator('.ab[data-k="calendar"]').click()
    await armMenus(run)
    await row(page, '提醒事项').click({ button: 'right' })
    expect((await openedMenu(run)).map((i) => i.label)).toEqual(['Hide Here'])
    await pickMenu(run, 'Hide Here')
    await expect(row(page, '提醒事项')).toHaveClass(/off/)
    await row(page, '工作').click({ button: 'right' })
    expect((await openedMenu(run)).map((i) => i.label)).toEqual(['Hide Here', '—', 'Show All'])
    await pickMenu(run, 'Hide Here')
    await expect(row(page, '工作').locator('.calsw')).toHaveAttribute('aria-label', 'Show “工作” here')
    await page.keyboard.press('Meta+,')
    const s = page.getByRole('dialog', { name: 'Settings' })
    await s.getByRole('navigation').getByRole('button', { name: 'Calendar & Reminders' }).click()
    await expect(s.locator('[data-row="cal"] .sa-ds')).toHaveText('Events from 2 calendars show read-only')
  } finally {
    await run.close()
  }
})
