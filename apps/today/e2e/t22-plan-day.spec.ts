/**
 * 排一天（方向 B，设计页 45-画布今日特色）：真点真拖。
 * 早上：打开就是第 1 步、剩下的一条条定（今天做 / 改天 / 不做了，改进原来那一行）；第 2 步估时、从收件箱挑；第 3 步拖进日历空档、拉下沿改时长；
 * 「开工」以后：现在那一块、菜单栏那一行、推到后面；晚上收工写进日记（照库里已有日记的位置），能撤销；重开软件排好的块还在、停在「开工」。
 * CT_SHOTS=<目录> 时每一屏截一张（交付页用）。
 */
import { expect, type Page, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dragTo, launch, LOOK, quit } from './app'
import { CAL_SEED, VAULT } from './fixtures'

const SHOTS = process.env.CT_SHOTS
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(SHOTS, name + '.png') })
}

/** 库里多两篇日记（照用户真库的样子：日记/年/日子.md），收工该写到同一个地方 */
const DIARY: Record<string, string> = {
  '日记/2026/2026-11-20.md': '# 2026-11-20 星期五\n\n上午去图书馆。\n',
  '日记/2026/2026-11-21.md': '# 2026-11-21 星期六\n\n休息。\n',
  '日记/2026/2026-11-22.md': '# 2026-11-22 星期日\n\n写了周报。\n',
}

/** 截图用：CT_SHOT_SKIN=petrol、CT_SHOT_FRAME=a 换主题和风格（交付页的深色、VS Code 风格那几张） */
const SKIN = (process.env.CT_SHOT_SKIN ?? 'sky') as 'sky' | 'petrol'
const FRAME = (process.env.CT_SHOT_FRAME ?? 'b') as 'a' | 'b'
const CAL = { reminders: { ...CAL_SEED, calAuth: 'full' }, settings: { ...LOOK(SKIN, FRAME), calendar: { show: true }, plan: { onOpen: true, tray: true, journal: null } } }
const MON = '2026-11-23T08:30:00'

const trayTitle = (run: Awaited<ReturnType<typeof launch>>) => run.app.evaluate(() => (globalThis as unknown as { ctTrayTitle: () => string }).ctTrayTitle())

test('排一天：早上定剩下的、估时、拖进空档、改时长、开工、收工写进日记、重开还在', async () => {
  test.setTimeout(180_000)
  let run = await launch({ ...CAL, files: { ...VAULT, ...DIARY }, now: MON })
  const { root } = run
  let page = run.page
  try {
    // ---------- 打开就是排一天第 1 步：过期没做完的 ----------
    await expect(page.locator('.ab[data-k="plan"]')).toHaveClass(/on/)
    await expect(page.locator('.pstep.on')).toHaveAttribute('data-step', 'left')
    await expect(page.locator('.phead h1')).toContainText('昨天剩下的')
    const left = page.locator('[data-part="剩下的一条"]')
    await expect(left.filter({ hasText: '交 ecp 作业 2' })).toContainText('过期2天')
    // 昨天的不写「昨天的」（一屏都是剩下的），更早的写过期几天，都不用红字
    await expect(left.filter({ hasText: '取快递' }).locator('.pmeta')).not.toContainText('过期')
    await expect(page.locator('[data-part="系统日历按账户"] .pcal')).toHaveCount(3)
    await shot(page, '01-left')

    // 今天做：那一行 📅 改成今天
    await left.filter({ hasText: '取快递' }).getByRole('button', { name: '今天做' }).click()
    await expect(page.locator('.toast')).toContainText('取快递')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 取快递 📅 2026-11-23')
    await expect(left.filter({ hasText: '取快递' })).toHaveCount(0)
    // 不做了：[-] 加 ❌ 今天，能撤销
    await left.filter({ hasText: '写第一批交回' }).getByRole('button', { name: '不做了' }).click()
    await expect.poll(() => run.read('项目/画布今日.md')).toContain('- [-] 写第一批交回 📅 2026-11-22 18:00 ⏫ ❌ 2026-11-23')
    await expect(page.locator('.toast')).toContainText('写第一批交回」不做了')
    await page.locator('.toast').getByRole('button', { name: '撤回' }).click()
    await expect.poll(() => run.read('项目/画布今日.md')).toContain('- [ ] 写第一批交回 📅 2026-11-22 18:00 ⏫\n')
    await left.filter({ hasText: '写第一批交回' }).getByRole('button', { name: '不做了' }).click()
    await expect.poll(() => run.read('项目/画布今日.md')).toContain('❌ 2026-11-23')
    // 改天：弹定日子的选择器，点「明天」
    await left.filter({ hasText: '浇花' }).getByRole('button', { name: '改天' }).click()
    const picker = page.locator('.cal-when')
    await expect(picker).toBeVisible()
    await picker.locator('.cal-when-qi', { hasText: '明天' }).click()
    if (await picker.isVisible()) await page.keyboard.press('Escape')
    await expect.poll(() => run.read('生活/家务.md')).toContain('- [ ] 浇花 📅 2026-11-24')
    await shot(page, '02-left-decided')

    // ---------- 第 2 步：今天做什么（估时、从收件箱挑） ----------
    await page.getByRole('button', { name: '下一步' }).click()
    await expect(page.locator('.phead h1')).toContainText('今天做什么')
    const today = page.locator('[data-part="今天的"] .prow')
    await expect(today.filter({ hasText: '取快递' })).toBeVisible()
    await expect(page.getByTestId('plan-cap')).toContainText('除去1个日程')
    // 估时：读第三章 30 分钟 → [估时:: 30分钟]
    await today.filter({ hasText: '读第三章' }).getByRole('group', { name: '估时：读第三章' }).getByRole('button', { name: '30分' }).click()
    await expect.poll(() => run.read('阅读/杀死一只知更鸟.md')).toContain('- [ ] 读第三章 [估时:: 30分钟] 📅 2026-11-23')
    await expect(today.filter({ hasText: '读第三章' }).getByRole('button', { name: '30分' })).toHaveAttribute('aria-pressed', 'true')
    // 从收件箱挑一条「今天做」
    await page.locator('[data-part="收件箱"] .prow', { hasText: '买打印纸' }).getByRole('button', { name: '今天做' }).click()
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 买打印纸 📅 2026-11-23')
    await expect(today.filter({ hasText: '买打印纸' })).toBeVisible()
    await today.filter({ hasText: '买打印纸' }).getByRole('button', { name: '15分' }).click()
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 买打印纸 [估时:: 15分钟] 📅 2026-11-23')
    await shot(page, '03-pick')

    // ---------- 第 3 步：拖进日历空档 ----------
    await page.getByRole('button', { name: '下一步' }).click()
    await expect(page.locator('.phead h1')).toContainText('排进时间')
    const col = page.locator('.pday .cal-col[data-drop="day:2026-11-23"]')
    await expect(col).toBeVisible()
    // 组会 9:30–10:30 在格子上（系统日历的颜色）
    await expect(page.locator('.pday .cal-blk.ev', { hasText: '组会' })).toBeVisible()
    const chip = page.locator('.pchip[data-drag]', { hasText: '读第三章' })
    await expect(chip).toContainText('30分')
    // 拖到 11:00：格子从 0 点起，一小时 40 高
    await col.scrollIntoViewIfNeeded()
    await dragTo(page, chip, col, 11 * 40 + 4)
    await expect.poll(() => run.read('阅读/杀死一只知更鸟.md')).toContain('- [ ] 读第三章 [估时:: 30分钟] 📅 2026-11-23 11:00')
    const blk = page.locator('.pday .cal-blk[data-drag]', { hasText: '读第三章' })
    await expect(blk).toBeVisible()
    await expect(blk).toContainText('11:00–11:30')
    // 写进笔记的样子
    await expect(page.locator('[data-part="写进笔记的样子"] code')).toContainText('📅 2026-11-23 11:00')
    // 拉下沿：30 分钟拉到 1 小时 30 分钟
    const rs = blk.locator('.cal-rs')
    const b = (await rs.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 20, { steps: 3 })
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 40, { steps: 3 })
    await page.mouse.up()
    await expect.poll(() => run.read('阅读/杀死一只知更鸟.md')).toContain('- [ ] 读第三章 [估时:: 1小时30分钟] 📅 2026-11-23 11:00')
    await expect(blk).toContainText('11:00–12:30')
    // 再拖一条：取快递放到 13:00（没估，按一小时）
    await dragTo(page, page.locator('.pchip[data-drag]', { hasText: '取快递' }), col, 13 * 40 + 4)
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 取快递 📅 2026-11-23 13:00')
    await expect(page.getByTestId('plan-day-sum')).toContainText('排了4条')
    await shot(page, '04-place')

    // 「AI 帮我排」：开右栏 AI 对话（task-ykkoz 那一套），问的话带着今天没排的几条和估时
    await page.locator('.tabs [data-ai="plan"]').click()
    await expect(page.locator('aside.right [data-k="ai"]')).toBeVisible()
    await expect(page.locator('aside.right')).toContainText('把今天要做的这几条排进今天空着的时间')
    // 右栏 AI 开着时中间窄了：时间线收到 240，按钮换到下一行（截一张）
    await shot(page, '04b-ai-open')
    await page.locator('.pstep[data-step="pick"]').click()
    await shot(page, '03b-pick-ai-open')
    await page.locator('.pstep[data-step="place"]').click()
    await page.locator('.abar.r .ab[data-k="ai"]').click()

    // ---------- 开工：现在那一块、菜单栏那一行 ----------
    await page.getByRole('button', { name: '开工', exact: true }).click()
    await expect(page.locator('.pstep.on')).toHaveAttribute('data-step', 'now')
    await expect(page.locator('[data-part="现在这一块"]')).toContainText('现在没有排着的事')
    // 不在哪一块里：菜单栏照旧写今天还有几条（快速加一条那条线），下一块在小窗里
    await expect(page.getByTestId('plan-tray-line')).toHaveText('现在不在哪一块里，菜单栏写今天还有几条')
    expect(await trayTitle(run)).toMatch(/^\d+$/)
    // 拨钟到 11:10：现在是「读第三章」，菜单栏写还剩几分
    await run.app.evaluate(() => (globalThis as unknown as { ctSetClock: (s: string) => void }).ctSetClock('2026-11-23T11:10:00'))
    await expect(page.locator('[data-part="现在这一块"]')).toContainText('读第三章', { timeout: 30_000 })
    await expect(page.locator('[data-part="现在这一块"]')).toContainText('现在 · 11:00–12:30')
    await expect.poll(() => trayTitle(run)).toBe('读第三章 · 还剩80分')
    await shot(page, '05-now')
    // 推到后面：原来那一块结束（12:30）以后放得下 1 小时 30 分钟的空档（13:00 取快递、15:00 交论文初稿各占一小时，16:00 起）
    await page.getByRole('button', { name: '推到后面' }).click()
    await expect.poll(() => run.read('阅读/杀死一只知更鸟.md')).toContain('📅 2026-11-23 16:00')
    await expect(page.locator('.toast')).toContainText('推到16:00')
    // 做完了：取快递
    await run.app.evaluate(() => (globalThis as unknown as { ctSetClock: (s: string) => void }).ctSetClock('2026-11-23T13:20:00'))
    await expect(page.locator('[data-part="现在这一块"]')).toContainText('取快递', { timeout: 30_000 })
    await page.locator('[data-part="现在这一块"]').getByRole('button', { name: '做完了' }).click()
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [x] 取快递 📅 2026-11-23 13:00 ✅ 2026-11-23')

    // ---------- 收工：没做完的挪去明天，写进日记 ----------
    await run.app.evaluate(() => (globalThis as unknown as { ctSetClock: (s: string) => void }).ctSetClock('2026-11-23T18:30:00'))
    await page.locator('.pstep[data-step="close"]').click()
    await expect(page.locator('.phead h1')).toContainText('收工')
    await expect(page.locator('[data-part="今天做完的"]')).toContainText('取快递')
    const notDone = page.locator('[data-part="没做完的"] .prow')
    await notDone.filter({ hasText: '买打印纸' }).getByRole('button', { name: '明天' }).click()
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 买打印纸 [估时:: 15分钟] 📅 2026-11-24')
    const pre = page.locator('[data-part="写进日记的样子"]')
    await expect(pre).toContainText('新建今天的日记 · 日记/2026/2026-11-23.md')
    // 预览只露前 4 行，「还有N行」点开
    await expect(pre.locator('pre')).not.toContainText('做完：取快递')
    await pre.locator('.pmore').click()
    await expect(pre.locator('pre')).toContainText('- 做完：取快递（[[收件箱/待办]]）')
    await expect(pre.locator('pre')).toContainText('- 挪到11月24日：买打印纸（[[收件箱/待办]]）')
    await shot(page, '06-close')
    await page.getByRole('button', { name: '收工，写进日记' }).click()
    await expect(page.locator('.toast')).toContainText('收工了，写进了日记《2026-11-23》')
    // 还没写出来时是空串（expect.poll 里抛错不会再等）
    const diary = () => (existsSync(join(run.vault, '日记/2026/2026-11-23.md')) ? run.read('日记/2026/2026-11-23.md') : '')
    await expect.poll(diary).toContain('## 收工 18:30')
    // 收工以后：左栏「收工」打勾，按钮换成打开日记
    await expect(page.locator('.pstep[data-step="close"]')).toHaveClass(/done/)
    await expect(page.getByRole('button', { name: '打开日记《2026-11-23》' })).toBeVisible()
    expect(diary()).toContain('# 2026-11-23 周一')
    expect(diary()).toContain('- 做完：取快递（[[收件箱/待办]]）')
    expect(diary()).toContain('- 挪到11月24日：买打印纸（[[收件箱/待办]]）')
    expect(diary()).toContain('- 没做完：读第三章（[[杀死一只知更鸟]]）')
    // 日记里不写成「- [ ]」：画布今日不会把它再收成一条待办
    expect(diary()).not.toMatch(/- \[[ x]\]/)
    // 提交了（机器忙时几次改动并成一次提交，说明里的字不一定是这一句：看这一篇进没进提交）
    await expect.poll(() => execFileSync('git', ['-C', run.vault, 'log', '--format=%s', '--', '日记/2026/2026-11-23.md'], { encoding: 'utf8' }).trim()).not.toBe('')
    // 撤销：日记那一篇没了（原来就没有）；再收一次
    await page.locator('.toast').getByRole('button', { name: '撤回' }).click()
    await expect.poll(() => existsSync(join(run.vault, '日记/2026/2026-11-23.md'))).toBe(false)
    await page.getByRole('button', { name: '收工，写进日记' }).click()
    await expect.poll(diary).toContain('## 收工 18:30')
    await shot(page, '07-closed')

    // ---------- 重开：排好的块还在（库里那一行），停在「开工」 ----------
    await quit(run)
    run = await launch({ ...CAL, root, now: '2026-11-23T16:10:00' })
    page = run.page
    await expect(page.locator('.pstep.on')).toHaveAttribute('data-step', 'now')
    await expect(page.locator('[data-part="现在这一块"]')).toContainText('读第三章')
    await expect(page.locator('.pday .cal-blk[data-drag]', { hasText: '读第三章' })).toContainText('16:00–17:30')
    expect(await trayTitle(run)).toBe('读第三章 · 还剩80分')
  } finally {
    await run.close()
  }
})

test('⌘K「排今天」打开排一天；设置里关掉「打开时先排一天」后照旧打开「今天」', async () => {
  const run = await launch({ ...CAL, now: MON })
  const { page } = run
  try {
    await expect(page.locator('.ab[data-k="plan"]')).toHaveClass(/on/)
    await page.locator('.ab[data-k="lists"]').click()
    await page.keyboard.press('Meta+k')
    await page.locator('.pal input').fill('排今天')
    await expect(page.locator('.pr.on')).toContainText('排一天')
    await page.keyboard.press('Enter')
    await expect(page.locator('.ab[data-k="plan"]')).toHaveClass(/on/)
    await expect(page.locator('.phead h1')).toContainText('昨天剩下的')
    // 设置 › 排一天：关掉打开时先排一天
    await page.keyboard.press('Meta+,')
    await page.locator('.si', { hasText: '排一天' }).click()
    await page.getByRole('switch', { name: '打开时先排一天' }).click()
    await expect.poll(() => JSON.parse(readFileSync(join(run.userData, 'settings.json'), 'utf8')).plan.onOpen).toBe(false)
    // 日记放在哪：库里没有日记，放在「周记」旁边
    await expect(page.getByLabel('收工写进哪里的日记')).toBeVisible()
    await expect(page.locator('[data-row="planJournal"]')).toContainText('周记')
  } finally {
    await run.close()
  }
})
