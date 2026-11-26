/**
 * 「今天做什么」直接拖进「今天的时间」（用户：「这种在收件箱的任务，我可以在这里直接拖动到日历里」）：真拖真点。
 * 从列表拖一条到 15:00：拖着时时间轴上有落点虚线框（钟点 + 长度），放下那一行写上今天 15:00、块长照估时（没估一小时）；
 * 和系统日历的日程重叠时提示条说一句；拖到「全天」只写日子；拖出去不改文件；提示条撤销回原样；
 * 键盘：Tab 到那一条、⌥⌘T 弹定日子和钟点的小框（日子先填今天），选钟点就排进去；已排的块拖动改钟点。
 */
import { expect, type Locator, type Page, test } from '@playwright/test'
import { commits, launch, LOOK, quit } from './app'

const NOW = '2026-11-25T10:10:00'
const DAY = '2026-11-25'

const FILES: Record<string, string> = {
  '收件箱/待办.md': '# 待办\n\n- [ ] 给房东退租合同 📅 2026-11-25 20:00\n- [ ] 做一个类似于 folo 那样的软件 [估时:: 2小时]\n- [ ] 买打印纸\n- [ ] 回导师邮件\n',
  '课程/ecp/作业.md': '# 作业\n\n- [ ] 交 ecp 作业 3 📅 2026-11-27\n',
}
const CAL = {
  calAuth: 'full',
  calendars: [{ id: 'C-uni', title: '课程表', color: '#7C6FAE', source: 'iCloud' }],
  events: [{ id: 'e2', title: 'Environmental Humanities in Japan', calendar: 'C-uni', allDay: false, start: '2026-11-25T14:15', end: '2026-11-25T15:45' }],
}

/** 时间线上 hh:mm 那一刻的 y（格子从 0 点起，一小时 data-hour 高） */
async function yAt(col: Locator, hhmm: string): Promise<number> {
  const hour = Number(await col.getAttribute('data-hour'))
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return (h + m / 60) * hour + 4
}

/** 按住一条挪到时间线的某一刻；hold 在松手前跑；out 时挪到左栏上松手（拖出去） */
async function dragRow(page: Page, src: Locator, col: Locator, at: string | 'allday' | 'out', hold?: () => Promise<void>) {
  await src.scrollIntoViewIfNeeded()
  const a = (await src.boundingBox())!
  await page.mouse.move(a.x + 60, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + 80, a.y + a.height / 2 + 10, { steps: 4 })
  if (at === 'out') {
    const l = (await page.locator('.body > .left').boundingBox())!
    await page.mouse.move(l.x + l.width / 2, l.y + l.height - 40, { steps: 10 })
  } else if (at === 'allday') {
    const b = (await page.locator(`.pday [data-drop="allday:${DAY}"]`).boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
  } else {
    await col.evaluate((el, y) => el.closest('.cal-week')!.scrollTo({ top: Math.max(0, y - 120) }), await yAt(col, at))
    const b = (await col.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + (await yAt(col, at)), { steps: 10 })
  }
  await hold?.()
  await page.mouse.up()
}

test('「今天做什么」的一条直接拖进「今天的时间」：落点虚线框、写上钟点、块长照估时、重叠提示、全天、拖出去不改、撤销、键盘、已排的拖动改钟点', async () => {
  test.setTimeout(240_000)
  const settings = { ...LOOK('mint', 'b'), calendar: { show: true }, plan: { onOpen: true, tray: true, journal: null } }
  const run = await launch({ files: FILES, reminders: CAL, settings, now: NOW, size: { width: 1470, height: 956 } })
  const { page } = run
  const inbox = () => run.read('收件箱/待办.md')
  try {
    await page.locator('.pstep[data-step="pick"]').click()
    await expect(page.locator('.phead h1')).toContainText('今天做什么')
    const col = page.locator(`.pday .cal-col[data-drop="day:${DAY}"]`)
    const hour = Number(await col.getAttribute('data-hour'))
    const folo = page.locator('[data-part="收件箱"] .prow[data-drag]', { hasText: '做一个类似于 folo 那样的软件' })
    await expect(folo).toBeVisible()

    // ---------- 拖到 15:00：拖着时落点虚线框写着 15:00–17:00、高两小时 ----------
    await dragRow(page, folo, col, '15:00', async () => {
      const slot = col.locator('.cal-slot')
      await expect(slot).toHaveText('15:00–17:00')
      expect(Math.round((await slot.boundingBox())!.height)).toBe(2 * hour - 2)
    })
    await expect.poll(inbox).toContain('- [ ] 做一个类似于 folo 那样的软件 [估时:: 2小时] 📅 2026-11-25 15:00\n')
    // 一次改动一次提交
    await expect.poll(() => commits(run.vault)[0]).toBe('画布今日：「做一个类似于 folo 那样的软件」改到 2026-11-25 15:00')
    const blk = page.locator('.pday .cal-blk[data-drag]', { hasText: '做一个类似于 folo 那样的软件' })
    await expect(blk).toContainText('15:00–17:00')
    expect(Math.round((await blk.boundingBox())!.height)).toBe(2 * hour - 2)
    // 和 14:15–15:45 的课重叠：提示条说一句，能撤销
    const toast = page.locator('.toast')
    await expect(toast).toContainText('做一个类似于 folo 那样的软件')
    await expect(toast).toContainText('重叠')
    await expect(toast).toContainText('Environmental Humanities in Japan')
    // 撤销：那一行回原样，块不见
    await toast.getByRole('button', { name: '撤回' }).click()
    await expect.poll(inbox).toContain('- [ ] 做一个类似于 folo 那样的软件 [估时:: 2小时]\n')
    await expect(blk).toHaveCount(0)

    // ---------- 没估时的：拖到 16:00，块一小时，不重叠不提 ----------
    const paper = page.locator('[data-part="收件箱"] .prow[data-drag]', { hasText: '买打印纸' })
    await dragRow(page, paper, col, '16:00')
    await expect.poll(inbox).toContain('- [ ] 买打印纸 📅 2026-11-25 16:00\n')
    const pblk = page.locator('.pday .cal-blk[data-drag]', { hasText: '买打印纸' })
    await expect(pblk).toContainText('16:00–17:00')
    expect(Math.round((await pblk.boundingBox())!.height)).toBe(hour - 2)
    await expect(toast).toContainText('买打印纸')
    await expect(toast).not.toContainText('重叠')
    // 估时没写进文件（按一小时算，不替人写）
    expect(inbox()).not.toContain('买打印纸 [估时')

    // ---------- 拖到「全天」：只写日子 ----------
    const hw = page.locator('[data-part="这周到期"] .prow[data-drag]', { hasText: '交 ecp 作业 3' })
    await dragRow(page, hw, col, 'allday')
    await expect.poll(() => run.read('课程/ecp/作业.md')).toContain('- [ ] 交 ecp 作业 3 📅 2026-11-25\n')
    await expect(page.locator(`.pday [data-drop="allday:${DAY}"] .cal-chip`, { hasText: '交 ecp 作业 3' })).toBeVisible()

    // ---------- 拖出去（左栏上松手）：不改文件、不出提示 ----------
    const before = inbox()
    const mail = page.locator('[data-part="收件箱"] .prow[data-drag]', { hasText: '回导师邮件' })
    await dragRow(page, mail, col, 'out', async () => {
      await expect(col.locator('.cal-slot')).toHaveCount(0)
    })
    await page.waitForTimeout(800)
    expect(inbox()).toBe(before)
    await expect(page.locator('.cal-ghost')).toHaveCount(0)
    await expect(mail).toBeVisible()

    // ---------- 键盘：Tab 到「回导师邮件」、⌥⌘T、钟点选 11:00 ----------
    await mail.focus()
    await expect(mail).toBeFocused()
    await page.keyboard.press('Meta+Alt+KeyT')
    const pick = page.locator('.cal-when')
    await expect(pick).toBeVisible()
    await pick.getByLabel('钟点').selectOption('11:00')
    await page.keyboard.press('Escape')
    await expect.poll(inbox).toContain('- [ ] 回导师邮件 📅 2026-11-25 11:00\n')
    await expect(page.locator('.pday .cal-blk[data-drag]', { hasText: '回导师邮件' })).toContainText('11:00–12:00')

    // ---------- 已排的块拖动改钟点：「买打印纸」16:00 → 18:00 ----------
    await dragRow(page, pblk, col, '18:00')
    await expect.poll(inbox).toContain('- [ ] 买打印纸 📅 2026-11-25 18:00\n')
    await expect(pblk).toContainText('18:00–19:00')
  } finally {
    await quit(run)
  }
})
