/**
 * 画布今日块颜色四处（2026-11-25 用户看了设计复审「可以」）：
 * 1) 待办块一圈强调色细边（日程块没有）；3) 月看法的待办小条左边一道强调色，一格最多三条、多了「还有N条」，点开列全、Esc 收起；
 * 4) 提示条不在窗口正中：排一天里在左边这一步那一栏的左下角，不压右边「今天的时间」；日历里在中间那一栏左下角。
 * （2 松林日程按色差分在 test/cal-colors.test.ts）
 */
import { expect, type Locator, type Page, test } from '@playwright/test'
import { launch, LOOK, quit } from './app'

const NOW = '2026-11-25T10:10:00'
const FILES: Record<string, string> = {
  '收件箱/待办.md':
    '# 待办\n\n- [ ] 给房东退租合同 📅 2026-11-25 20:00\n- [ ] 做一个类似于 folo 那样的软件 [估时:: 2小时]\n' +
    ['一', '二', '三', '四', '五'].map((n) => `- [ ] 周五的事${n} 📅 2026-11-27\n`).join(''),
}
const CAL = {
  calAuth: 'full',
  calendars: [{ id: 'C-uni', title: '课程表', color: '#7C6FAE', source: 'iCloud' }],
  events: [{ id: 'e2', title: 'Environmental Humanities in Japan', calendar: 'C-uni', allDay: false, start: '2026-11-25T14:15', end: '2026-11-25T15:45' }],
}
const box = async (l: Locator) => (await l.boundingBox())!
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function dragTo(page: Page, src: Locator, col: Locator, hhmm: string) {
  const hour = Number(await col.getAttribute('data-hour'))
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  const y = (h + m / 60) * hour + 4
  await col.evaluate((el, top) => el.closest('.cal-week')!.scrollTo({ top: Math.max(0, top - 120) }), y)
  const a = await box(src)
  const b = await box(col)
  // 按在这一条正中（周看法里块很窄）
  await page.mouse.move(a.x + Math.min(60, a.width / 2), a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + Math.min(60, a.width / 2) + 20, a.y + a.height / 2 + 10, { steps: 4 })
  await page.mouse.move(b.x + b.width / 2, b.y + y, { steps: 10 })
  await page.mouse.up()
}

for (const skin of ['petrol', 'mint'] as const) {
  test(`块颜色四处 · ${skin}：待办块细边、月看法三条加「还有N条」、提示条不挡日历`, async () => {
    test.setTimeout(180_000)
    const settings = { ...LOOK(skin, 'b'), calendar: { show: true }, plan: { onOpen: true, tray: true, journal: null } }
    const run = await launch({ files: FILES, reminders: CAL, settings, now: NOW, size: { width: 1470, height: 956 } })
    const { page } = run
    try {
      // ---------- 排一天：拖一条进时间线，提示条在左边这一步那一栏的左下角，不压「今天的时间」 ----------
      await page.locator('.pstep[data-step="pick"]').click()
      const col = page.locator('.pday .cal-col[data-drop="day:2026-11-25"]')
      await dragTo(page, page.locator('.prow[data-drag]', { hasText: '做一个类似于 folo 那样的软件' }), col, '15:00')
      await expect.poll(() => run.read('收件箱/待办.md')).toContain('📅 2026-11-25 15:00')
      const toast = page.locator('.toast')
      await expect(toast).toBeVisible()
      const tb = await box(toast)
      const pmain = await box(page.locator('.plan > .pmain'))
      expect(overlap(tb, await box(page.locator('.plan > .pday'))), '提示条压在「今天的时间」上').toBe(false)
      expect(Math.round(tb.x - pmain.x)).toBe(16)
      expect(tb.x + tb.width).toBeLessThanOrEqual(pmain.x + pmain.width)
      expect(Math.round(pmain.y + pmain.height - (tb.y + tb.height))).toBe(16)

      // ---------- 1) 待办块一圈强调色细边，日程块没有 ----------
      const task = page.locator('.pday .cal-blk[data-drag]', { hasText: '做一个类似于 folo 那样的软件' })
      expect(await task.evaluate((e) => getComputedStyle(e).boxShadow)).toMatch(/inset/)
      expect(await page.locator('.pday .cal-blk.ev').first().evaluate((e) => getComputedStyle(e).boxShadow)).not.toMatch(/inset/)

      // ---------- 日历：月看法，周五 5 条只露 3 条 +「还有2条」，点开 5 条都在，Esc 收起 ----------
      await page.locator('.ab[data-k="calendar"]').click()
      await page.locator('.cal-seg button', { hasText: '月' }).click()
      const cell = page.locator('.cal-mcell[data-drop="mday:2026-11-27"]')
      await expect(cell.locator('.cal-chip')).toHaveCount(3)
      const more = cell.getByRole('button', { name: '还有2条' })
      await expect(more).toBeVisible()
      // 3) 待办小条左边一道强调色
      expect(await cell.locator('.cal-chip').first().evaluate((e) => getComputedStyle(e).boxShadow)).toMatch(/2px 0px 0px 0px inset/)
      await more.click()
      const pop = page.locator('.cal-mpop')
      await expect(pop).toBeVisible()
      await expect(pop.locator('.cal-chip')).toHaveCount(5)
      await expect(pop).toContainText('周五的事五')
      await page.keyboard.press('Escape')
      await expect(pop).toHaveCount(0)
      await more.click()
      await expect(pop).toBeVisible()
      await page.mouse.click(5, 300)
      await expect(pop).toHaveCount(0)

      // ---------- 日历：周看法里拖一块，提示条在中间那一栏左下角，不在窗口正中 ----------
      await page.locator('.cal-seg button', { hasText: '周' }).click()
      const wcol = page.locator('.cal-wk .cal-col[data-drop="day:2026-11-26"]')
      await dragTo(page, page.locator('.cal-wk .cal-blk[data-drag]', { hasText: '做一个类似于 folo 那样的软件' }), wcol, '16:00')
      await expect.poll(() => run.read('收件箱/待办.md')).toContain('📅 2026-11-26 16:00')
      await expect(toast).toContainText('做一个类似于 folo 那样的软件')
      const tb2 = await box(toast)
      const center = await box(page.locator('.body > .center'))
      expect(Math.round(tb2.x - center.x)).toBe(16)
      expect(tb2.x + tb2.width / 2, '提示条不在窗口正中').toBeLessThan(1470 / 2 - 40)
    } finally {
      await quit(run)
    }
  })
}
