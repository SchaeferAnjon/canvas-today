/**
 * 提醒事项（task-b9y8i，用户选 A）：带 🔔 的待办镜像进 iCloud 提醒事项的「画布今日」列表，镜像了的本机不再排通知；
 * 在提醒事项里勾掉、改时间、改标题写回库里那一行，删掉那条只去掉 🔔；导入提醒事项一次搬家、能撤回。
 * 小助手是真的那个程序（native/reminders），但带 --memory：提醒事项是临时目录里的假的（reminders-mem.json），不碰真的。
 * 「在提醒事项 App 里改」用 globalThis.ctRem.external(...) 让小助手像人一样改（改完它照样发「外面改了」）。
 */
import { expect, type Page, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { commits, launch, LOOK, quit, type Running, row } from './app'
import { armMenus, pickMenu } from './menu'
import type { NotifShot } from '../src/shared/api'

interface MemItem {
  rid: string
  title: string
  due?: string | null
  completed?: boolean
  priority?: number
  alarms?: unknown[]
  url?: string | null
  notes?: string | null
  list?: string
}
const mem = (run: Running): { auth: string; lists: { id: string; title: string }[]; items: MemItem[]; calls: string[] } =>
  existsSync(run.remFile) ? JSON.parse(readFileSync(run.remFile, 'utf8')) : { auth: 'notDetermined', lists: [], items: [], calls: [] }
const item = (run: Running, title: string) => mem(run).items.find((i) => i.title === title)
const external = (run: Running, p: Record<string, unknown>) => run.app.evaluate((_e, p) => (globalThis as unknown as { ctRem: { external: (p: unknown) => Promise<unknown> } }).ctRem.external(p), p)
const notifs = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctNotifs: NotifShot[] }).ctNotifs)
const setClock = (run: Running, at: string) => run.app.evaluate((_e, at) => (globalThis as unknown as { ctSetClock: (s: string) => void }).ctSetClock(at), at)
const idOf = (text: string, title: string) => new RegExp(`${title}[^\\n]*🆔 ([a-z0-9]{6})`).exec(text)?.[1]
const uncommitted = (run: Running) => execFileSync('git', ['-C', run.vault, 'status', '--porcelain'], { encoding: 'utf8' })

const L = {
  zh: {
    settings: '设置',
    calRem: '日历和提醒事项',
    connect: '连接提醒事项',
    mirror: '镜像进提醒事项',
    offSub: '画布今日',
    connected: /已连接iCloud/,
    remind: '提醒',
    rings: '提醒事项里响',
    deleted: '在提醒事项里删掉了「交论文初稿」',
    deletedSub: '库里这一条还在，去掉了提醒，到点不响',
    connectedToast: '连上了提醒事项：4条带提醒的待办放进了「画布今日」',
    status: '提醒事项已连接',

  },
  en: {
    settings: 'Settings',
    calRem: 'Calendar & Reminders',
    connect: 'Connect Reminders',
    mirror: 'Mirror to Reminders',
    offSub: 'Canvas Today',
    connected: /Connected to iCloud/,
    remind: 'Remind',
    rings: 'Rings in Reminders',
    deleted: 'Deleted in Reminders: “交论文初稿”',
    deletedSub: 'its reminder was removed',
    connectedToast: 'Connected to Reminders: 4 to-dos with a reminder are in “Canvas Today”',
    status: 'Reminders connected',

  },
}

/** 打开设置、翻到「日历和提醒事项」那一页（设置照画布笔记分了页） */
async function remPage(page: Page, l: (typeof L)['zh'] = L.zh) {
  await page.locator('.ab[data-k="settings"]').click()
  // B 里是弹窗、A 里是中间一个标签（task-ykkoz）
  const s = page.locator('.set')
  await s.getByRole('navigation').getByRole('button', { name: l.calRem }).click()
  return s
}

async function connect(page: Page, l: (typeof L)['zh']) {
  const s = await remPage(page, l)
  const r = s.locator('[data-row="rem"]')
  await expect(r).toContainText(l.offSub)
  await r.getByRole('button', { name: l.connect }).click()
  await expect(r).toContainText(l.connected, { timeout: 10_000 })
  await expect(s.getByRole('switch', { name: l.mirror })).toHaveAttribute('aria-checked', 'true')
  return s
}

for (const lang of ['zh', 'en'] as const) {
  test(`${lang}：连上提醒事项 → 带提醒的镜像过去、本机不再排通知 → 在提醒事项里勾掉、改时间、改标题写回那一行 → 删掉只去 🔔 → 我们这边勾掉、删掉同步过去`, async () => {
    const l = L[lang]
    // 这一条测的是写了 🔔 的那几条；「提醒所有带钟点的待办」（默认开）另在 t23
    const run = await launch({ settings: { ...(lang === 'zh' ? LOOK('sky', 'b', 'zh') : LOOK('petrol', 'a', 'en')), remindAll: false } })
    const { page } = run
    try {
      const s = await connect(page, l)
      // 设置开着：软件的话说在设置底下那一条
      await expect(s.getByTestId('settings-toast')).toContainText(l.connectedToast)
      // 原来带 🔔 的四条：先给没 🆔 的加上编号，再镜像过去（一个列表「画布今日」，英文界面也认这个名字）
      await expect.poll(() => mem(run).items.length, { timeout: 10_000 }).toBe(4)
      expect(mem(run).lists.map((x) => x.title)).toEqual([lang === 'zh' ? '画布今日' : 'Canvas Today'])
      const paperId = idOf(run.read('写作/小论文计划.md'), '交论文初稿')!
      expect(paperId).toBeTruthy()
      expect(item(run, '交论文初稿')).toMatchObject({
        due: '2026-11-23 15:00',
        alarms: [{ offset: -3600 }],
        priority: 1,
        completed: false,
        url: `canvas-today://task/${paperId}`,
        notes: `来自《小论文计划》· 写作\ncanvas-notes://open?file=${encodeURIComponent('写作/小论文计划.md')}&line=11\ncanvas-today://task/${paperId}`,
      })
      expect(item(run, '交期中报告')).toMatchObject({ due: '2026-12-05 23:00', alarms: [{ at: '2026-12-04T20:00' }], priority: 1 })
      expect(item(run, '交房租')).toMatchObject({ due: '2026-12-01', alarms: [{ at: '2026-12-01T09:00' }] })
      // 加编号的那一下提交了，只改了那几行的行尾
      await expect.poll(() => uncommitted(run), { timeout: 10_000 }).toBe('')
      expect(run.read('写作/小论文计划.md')).toContain(`- [ ] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 ⏫ 🆔 ${paperId}\n`)
      await page.keyboard.press('Escape')
      await expect(page.locator('.status')).toContainText(l.status)

      // 设一个提醒：假提醒事项里多一条对的
      await row(page, '复习 Lecture05').click()
      const d = page.locator('[data-part="详情"]')
      await d.getByLabel(l.remind, { exact: true }).selectOption('提前10分钟')
      await expect.poll(() => mem(run).items.length, { timeout: 10_000 }).toBe(5)
      const lecId = idOf(run.read('课程/ecp/Lecture05 笔记.md'), '复习 Lecture05 的神经元结构图')!
      expect(item(run, '复习 Lecture05 的神经元结构图')).toMatchObject({ due: '2026-11-22 11:00', alarms: [{ offset: -600 }], priority: 0, url: `canvas-today://task/${lecId}` })
      await expect(d).toContainText(l.rings)

      // 本机不再排通知：拨到 10:49:58（10:50 该响），等过了也不弹
      await setClock(run, '2026-11-22T10:49:58')
      await page.waitForTimeout(3500)
      expect(await notifs(run)).toEqual([])

      // 在提醒事项里勾掉 → 库里那一行变 [x] ✅（用提醒事项里勾掉的那天），提交说清楚
      await external(run, { op: 'complete', task: lecId, at: '2026-11-22T10:51' })
      await expect.poll(() => run.read('课程/ecp/Lecture05 笔记.md'), { timeout: 10_000 }).toContain(`- [x] 复习 Lecture05 的神经元结构图 📅 2026-11-22 11:00 🔔 提前10分钟 🆔 ${lecId} ✅ 2026-11-22\n`)
      await expect.poll(() => commits(run.vault).join('\n'), { timeout: 10_000 }).toContain('画布今日：在提醒事项里勾掉「复习 Lecture05 的神经元结构图」')

      // 在提醒事项里改时间、改标题 → 写回 📅 和标题（只改那几个字）
      const tripId = idOf(run.read('生活/冰岛行程.md'), '订冰岛租车')!
      await external(run, { op: 'setDue', task: tripId, due: '2026-11-25 19:00' })
      await expect.poll(() => run.read('生活/冰岛行程.md'), { timeout: 10_000 }).toContain(`- [ ] 订冰岛租车 📅 2026-11-25 19:00 🔔 准时 🆔 ${tripId}\n`)
      await external(run, { op: 'setTitle', task: tripId, title: '订冰岛租车（四驱）' })
      await expect.poll(() => run.read('生活/冰岛行程.md'), { timeout: 10_000 }).toContain(`- [ ] 订冰岛租车（四驱） 📅 2026-11-25 19:00 🔔 准时 🆔 ${tripId}\n`)

      // 在提醒事项里删掉那条 → 库里这一条留着，只去掉 🔔，提示一次（带撤销）
      await external(run, { op: 'delete', task: paperId })
      await expect.poll(() => run.read('写作/小论文计划.md'), { timeout: 10_000 }).toContain(`- [ ] 交论文初稿 📅 2026-11-23 15:00 ⏫ 🆔 ${paperId}\n`)
      await expect(page.locator('.toast')).toContainText(l.deleted)
      await expect(page.locator('.toast')).toContainText(l.deletedSub)

      // 我们这边：勾掉 → 那边也勾上；改标题 → 那边跟着改；删掉 → 那边也删掉
      await page.locator('.nav[data-k="week"]').click()
      await row(page, '订冰岛租车（四驱）').locator('.cb').click()
      await expect.poll(() => item(run, '订冰岛租车（四驱）')?.completed, { timeout: 10_000 }).toBe(true)
      await page.locator('.nav[data-k="list:课程/线性代数/作业.md"]').click()
      await row(page, '交期中报告').click()
      const title = d.locator('.dtitle input')
      // 详情换到这一条以后再改名（人不会在点下的同一帧里打字）
      await expect(title).toHaveValue('交期中报告')
      await title.fill('交期中报告（终稿）')
      await title.press('Enter')
      await expect.poll(() => item(run, '交期中报告（终稿）')?.due, { timeout: 10_000 }).toBe('2026-12-05 23:00')
      await armMenus(run)
      await row(page, '交期中报告（终稿）').click({ button: 'right' })
      await pickMenu(run, lang === 'zh' ? '删除' : 'Delete')
      await expect.poll(() => mem(run).items.some((i) => i.title.startsWith('交期中报告')), { timeout: 10_000 }).toBe(false)
      // 底栏还写着连着
      await expect(page.locator('.status')).toContainText(l.status)
      // 设置里写着有几条在提醒事项里响
      await remPage(page, l)
      await expect(s.locator('[data-row="rem"]')).toContainText(l.connected)
    } finally {
      await run.close()
    }
  })
}

const SEED = {
  lists: [
    { id: 'L-shop', title: '购物', icloud: true, color: '#FF9500' },
    { id: 'L-work', title: '工作', icloud: true, color: '#34C759' },
  ],
  items: [
    { rid: 's1', list: 'L-shop', title: '牛奶', due: '2026-11-23', alarms: [{ at: '2026-11-23T09:00' }], created: 1 },
    { rid: 's2', list: 'L-shop', title: '鸡蛋', priority: 1, created: 2 },
    { rid: 's3', list: 'L-shop', title: '面包', completed: true, completedAt: '2026-11-20T08:00', created: 3 },
    { rid: 'w1', list: 'L-work', title: '交周报', due: '2026-11-27 17:00', alarms: [{ offset: -3600 }], rules: [{ freq: 'weekly', interval: 1, days: [{ day: 6, week: 0 }] }], notes: '发给王老师', created: 4 },
    { rid: 'w2', list: 'L-work', title: '月底对账', due: '2026-11-27', rules: [{ freq: 'monthly', interval: 1, days: [{ day: 6, week: -1 }] }], created: 5 },
  ],
}

const IMP = {
  zh: {
    importBtn: '导入…',
    dlg: '导入提醒事项',
    preview: '先看看会搬什么',
    go: '导入4条',
    toast: '导入了2个列表4条',
    undo: '撤回',
    withDel: '搬完删掉提醒事项里的原条目',
    confirm: '把提醒事项里这4条删掉？',
    del: '删掉4条',
    delToast: '提醒事项里删掉了4条原条目',
    recur: '1条的重复对不上',
    lost: '子任务会搬成并列的几条',
    skip: '已完成的1条不带',
    twice: '2条带提醒的会加上 🆔、镜像进「画布今日」；原条目不删的话，到点会响两次',
  },
  en: {
    importBtn: 'Import…',
    dlg: 'Import from Reminders',
    preview: 'Preview',
    go: 'Import 4',
    toast: 'Imported 4 from 2 lists',
    undo: 'Undo',
    withDel: 'Delete them from Reminders afterwards',
    confirm: 'Delete these 4 from Reminders?',
    del: 'Delete 4',
    delToast: 'Deleted 4 from Reminders',
    recur: '1 repeat doesn’t fit',
    lost: 'Subtasks become separate to-dos',
    skip: '1 completed left out',
    twice: '2 with a reminder get a 🆔 and mirror to “Canvas Today”; keep the originals and they’ll ring twice',
  },
}

/** 导入写成的两篇：带 🔔 的那两条导入时就有了 🆔（编号是随机的） */
const SHOP = /^# 购物\n\n- \[ \] 牛奶 📅 2026-11-23 🔔 准时 🆔 [a-z0-9]{6}\n- \[ \] 鸡蛋 ⏫\n$/
const WORK = /^# 工作\n\n- \[ \] 月底对账 📅 2026-11-27\n {4}> 原来的重复：每月最后一个周五\n- \[ \] 交周报 📅 2026-11-27 17:00 🔔 提前1小时 🔁 每周五 🆔 [a-z0-9]{6}\n {4}> 发给王老师\n$/
/** 种子里那两个列表还剩哪几条 */
const seeded = (run: Running) => mem(run).items.filter((i) => i.list === 'L-shop' || i.list === 'L-work')

for (const lang of ['zh', 'en'] as const) {
  test(`${lang}：导入提醒事项：选列表 → 先看看 → 一次提交写成 收件箱/从提醒事项/<列表名>.md → 撤回 → 再导一次、搬完删掉原条目（删前再问一次）`, async () => {
    const l = L[lang]
    const t = IMP[lang]
    const run = await launch({ settings: lang === 'zh' ? LOOK('sky', 'a', 'zh') : LOOK('petrol', 'b', 'en'), reminders: SEED })
    const { page } = run
    try {
      const s = await connect(page, l)
      await s.getByRole('button', { name: t.importBtn }).click()
      const dlg = page.getByRole('dialog', { name: t.dlg })
      await expect(dlg).toBeVisible()
      // 镜像的那个列表不在里面；每个列表写着几条、几条已完成
      await expect(dlg.getByRole('checkbox')).toHaveCount(2)
      await expect(dlg.getByRole('checkbox', { name: /购物/ })).toContainText(lang === 'zh' ? '2条 · 1条已完成' : '2 · 1 completed')
      await dlg.getByRole('checkbox', { name: /购物/ }).click()
      await dlg.getByRole('checkbox', { name: /工作/ }).click()
      await dlg.getByRole('button', { name: t.preview }).click()
      // 先给你看：写成哪一篇、头几行
      await expect(dlg).toContainText('收件箱/从提醒事项/购物.md')
      await expect(dlg).toContainText('收件箱/从提醒事项/工作.md')
      await expect(dlg).toContainText('- [ ] 交周报 📅 2026-11-27 17:00 🔔 提前1小时 🔁 每周五')
      await expect(dlg).toContainText(t.recur)
      await expect(dlg).toContainText(t.lost)
      await expect(dlg).toContainText(t.skip)
      await expect(dlg).toContainText(t.twice)
      // 连上时给原来带 🔔 的几条加编号的那一次已经提交了：下面只多导入那一次
      await expect.poll(() => uncommitted(run), { timeout: 10_000 }).toBe('')
      const before = commits(run.vault).length
      const mirrorBefore = mem(run).items.length - seeded(run).length
      await dlg.getByRole('button', { name: t.go }).click()
      await expect(dlg).toHaveCount(0)
      await expect(page.locator('.toast')).toContainText(t.toast)
      expect(run.read('收件箱/从提醒事项/购物.md')).toMatch(SHOP)
      expect(run.read('收件箱/从提醒事项/工作.md')).toMatch(WORK)
      await expect.poll(() => commits(run.vault).length, { timeout: 10_000 }).toBe(before + 1)
      expect(commits(run.vault)[0]).toBe('画布今日：导入提醒事项：2 个列表 4 条')
      // 左栏「有待办的笔记」里出现了；带提醒的两条镜像进了「画布今日」（文件不用再改）
      await expect(page.locator('.nav[data-k="list:收件箱/从提醒事项/工作.md"]')).toBeVisible()
      await expect.poll(() => mem(run).items.length - seeded(run).length, { timeout: 10_000 }).toBe(mirrorBefore + 2)
      expect(uncommitted(run)).toBe('')
      // 撤回：两篇都没了，镜像过去的那两条也跟着删了，提醒事项里原来的一条没动
      await page.locator('.toast').getByRole('button', { name: t.undo }).click()
      await expect.poll(() => existsSync(join(run.vault, '收件箱/从提醒事项/购物.md'))).toBe(false)
      await expect.poll(() => existsSync(join(run.vault, '收件箱/从提醒事项/工作.md'))).toBe(false)
      await expect.poll(() => mem(run).items.length - seeded(run).length, { timeout: 10_000 }).toBe(mirrorBefore)
      expect(seeded(run).length).toBe(5)

      // 再导一次，这次搬完删掉原条目：删之前再问一次
      await remPage(page, l)
      await s.getByRole('button', { name: t.importBtn }).click()
      await dlg.getByRole('checkbox', { name: /购物/ }).click()
      await dlg.getByRole('checkbox', { name: /工作/ }).click()
      await dlg.getByRole('switch', { name: t.withDel }).click()
      await dlg.getByRole('button', { name: t.preview }).click()
      await dlg.getByRole('button', { name: t.go }).click()
      const ask = page.getByRole('alertdialog', { name: t.confirm })
      await expect(ask).toBeVisible()
      // 先提交、再问：问的时候库里已经有了，提醒事项里一条没删
      expect(run.read('收件箱/从提醒事项/购物.md')).toMatch(SHOP)
      expect(seeded(run).length).toBe(5)
      await ask.getByRole('button', { name: t.del }).click()
      await expect(page.locator('.toast')).toContainText(t.delToast)
      // 搬过的四条删了，没搬的（已完成的面包）还在
      await expect.poll(() => seeded(run).map((i) => i.title)).toEqual(['面包'])
    } finally {
      await run.close()
    }
  })
}

test('没开 iCloud 提醒事项：不镜像、本机照响；顶上提示一次（能点掉，重开不再出）', async () => {
  const run = await launch({ reminders: { icloud: false }, now: '2026-11-24T19:58:00' })
  const { page } = run
  try {
    const s = await remPage(page)
    const r = s.locator('[data-row="rem"]')
    await r.getByRole('button', { name: '连接提醒事项' }).click()
    await expect(r).toContainText('没开iCloud提醒事项：不镜像，这台Mac自己响')
    expect(mem(run).lists).toEqual([])
    await page.keyboard.press('Escape')
    const banner = page.locator('[data-part="没开iCloud提醒事项"]')
    await expect(banner).toContainText('没开iCloud提醒事项：手机上只有打开过画布今日、同步过的提醒才响')
    await banner.getByRole('button', { name: '怎么打开' }).click()
    await expect(page.locator('.toast')).toContainText('系统设置 › 你的名字 › iCloud')
    // 本机照响：20:00 的「订冰岛租车 🔔 准时」
    await setClock(run, '2026-11-24T19:59:58')
    await expect.poll(async () => (await notifs(run)).map((n) => n.title), { timeout: 10_000 }).toContain('订冰岛租车')
    await banner.getByRole('button', { name: '关闭' }).click()
    await expect(banner).toHaveCount(0)
    await quit(run)
    const again = await launch({ root: run.root, now: '2026-11-24T19:58:00' })
    try {
      await expect(again.page.locator('.win')).toBeVisible()
      await again.page.waitForTimeout(1500)
      await expect(again.page.locator('[data-part="没开iCloud提醒事项"]')).toHaveCount(0)
    } finally {
      await again.close()
    }
  } catch (e) {
    await run.close().catch(() => {})
    throw e
  }
})

test('没给权限（系统问的时候点了「不允许」）：设置里说清楚、留「连接提醒事项」，本机照响', async () => {
  const run = await launch({ reminders: { denyRequest: true } })
  const { page } = run
  try {
    const r = (await remPage(page)).locator('[data-row="rem"]')
    await r.getByRole('button', { name: '连接提醒事项' }).click()
    await expect(r).toContainText('没给画布今日访问提醒事项，现在是这台Mac自己响')
    await expect(page.getByTestId('settings-toast')).toContainText('没连上')
    await r.getByRole('button', { name: '打开系统设置' }).click()
    const said = await run.app.evaluate(() => (globalThis as unknown as { cnScreen: string[] }).cnScreen)
    expect(said.join('\n')).toContain('x-apple.systempreferences:com.apple.preference.security?Privacy_Reminders')
    expect(mem(run).items).toEqual([])
    expect(mem(run).calls.filter((c) => c === 'request')).toEqual(['request'])
  } finally {
    await run.close()
  }
})

test('关掉镜像：提醒事项里镜像的删掉、本机照响；再打开又放回去；重开软件还记得、到点不响两次', async () => {
  const run = await launch({ now: '2026-11-24T19:58:00' })
  const { page } = run
  try {
    const s = await connect(page, L.zh)
    await expect.poll(() => mem(run).items.length, { timeout: 10_000 }).toBe(4)
    await s.getByRole('switch', { name: '镜像进提醒事项' }).click()
    await expect.poll(() => mem(run).items.length, { timeout: 10_000 }).toBe(0)
    await expect(page.getByTestId('settings-toast')).toContainText('镜像关了：提醒事项里删掉了4条')
    await expect(s.locator('[data-row="rem"]')).toContainText('镜像关着')
    await expect(page.locator('.status')).not.toContainText('提醒事项已连接')
    // 本机照响：20:00 的那条
    await setClock(run, '2026-11-24T19:59:58')
    await expect.poll(async () => (await notifs(run)).map((n) => n.title), { timeout: 10_000 }).toContain('订冰岛租车')
    await s.getByRole('switch', { name: '镜像进提醒事项' }).click()
    await expect.poll(() => mem(run).items.length, { timeout: 10_000 }).toBe(4)
    await quit(run)
    // 重开：一打开就记得哪些镜像着（第一次同步完之前也不自己响）
    const again = await launch({ root: run.root, now: '2026-12-04T19:59:57' })
    try {
      await again.page.waitForTimeout(4000)
      expect((await notifs(again)).map((n) => n.title)).not.toContain('交期中报告')
      expect(mem(again).items.length).toBe(4)
      expect(mem(again).calls.filter((c) => c === 'request').length).toBe(1)
    } finally {
      await again.close()
    }
  } catch (e) {
    await run.close().catch(() => {})
    throw e
  }
})

test('重复的只镜像下一次那一条：在这边勾掉「交房租」，提醒事项里那条勾上、下个月那条另建一条；在提醒事项里勾掉下个月那条，库里再生成下一次', async () => {
  const run = await launch({ settings: { remindAll: false } })
  const { page } = run
  try {
    await connect(page, L.zh)
    await expect.poll(() => mem(run).items.length, { timeout: 10_000 }).toBe(4)
    await page.keyboard.press('Escape')
    const first = idOf(run.read('生活/家务.md'), '交房租')!
    await page.locator('.nav[data-k="list:生活/家务.md"]').click()
    await row(page, '交房租').locator('.cb').click()
    await expect.poll(() => run.read('生活/家务.md'), { timeout: 10_000 }).toMatch(/- \[ \] 交房租 📅 2027-01-01 🔔 准时 🔁 每月1日 ⏫ 🆔 [a-z0-9]{6}\n/)
    const next = /- \[ \] 交房租 📅 2027-01-01[^\n]*🆔 ([a-z0-9]{6})/.exec(run.read('生活/家务.md'))![1]!
    expect(next).not.toBe(first)
    await expect
      .poll(() => mem(run).items.filter((i) => i.title === '交房租').map((i) => [i.url, i.due, i.completed]), { timeout: 10_000 })
      .toEqual([
        [`canvas-today://task/${first}`, '2026-12-01', true],
        [`canvas-today://task/${next}`, '2027-01-01', false],
      ])
    // 反过来：在提醒事项里勾掉下个月那条 → 库里那一行勾掉、再下个月的生成，又镜像一条
    await external(run, { op: 'complete', task: next, at: '2026-11-22T11:00' })
    await expect.poll(() => run.read('生活/家务.md'), { timeout: 10_000 }).toMatch(/- \[ \] 交房租 📅 2027-02-01 🔔 准时 🔁 每月1日 ⏫ 🆔 [a-z0-9]{6}\n/)
    await expect.poll(() => mem(run).items.filter((i) => i.title === '交房租' && !i.completed).map((i) => i.due), { timeout: 10_000 }).toEqual(['2027-02-01'])
  } finally {
    await run.close()
  }
})

test('只读的那篇（换行不规整）里带提醒、没 🆔 的：加不上编号就不镜像，提示一次，不一直转圈问小助手', async () => {
  const run = await launch({ files: { '收件箱/待办.md': '# 待办\n\n- [ ] 取快递 📅 2026-11-25 18:00 🔔 准时\n', '收件箱/只读.md': '# 只读\n\n- [ ] 买票 📅 2026-11-25 🔔 准时\n说明\r里有单独的回车\n' } })
  try {
    await connect(run.page, L.zh)
    await expect.poll(() => mem(run).items.map((i) => i.title), { timeout: 10_000 }).toEqual(['取快递'])
    // 「连上了」是点了按钮的结果，先出；同步时说的这一句排在它后面（不被盖掉）
    await expect(run.page.getByTestId('settings-toast')).toContainText('连上了提醒事项：1条')
    await expect(run.page.getByTestId('settings-toast')).toContainText('《只读》只读，提醒事项里改的没写回', { timeout: 10_000 })
    const n = mem(run).calls.filter((c) => c === 'fetch').length
    await run.page.waitForTimeout(3000)
    expect(mem(run).calls.filter((c) => c === 'fetch').length - n).toBeLessThan(3)
    expect(run.read('收件箱/只读.md')).toBe('# 只读\n\n- [ ] 买票 📅 2026-11-25 🔔 准时\n说明\r里有单独的回车\n')
  } finally {
    await run.close()
  }
})

test('两台设备各镜像出一份：靠 🆔 认出、留先建的', async () => {
  const files = { '收件箱/待办.md': '# 待办\n\n- [ ] 取快递 📅 2026-11-25 18:00 🔔 准时 🆔 kd0001\n' }
  const mark = 'canvas-today://task/kd0001'
  const run = await launch({
    files,
    reminders: {
      lists: [{ id: 'L-ct', title: '画布今日', icloud: true }],
      items: [
        { rid: 'from-iphone', list: 'L-ct', title: '取快递', due: '2026-11-25 18:00', alarms: [{ offset: 0 }], url: mark, notes: `来自《待办》· 收件箱\n${mark}`, created: 1000 },
        { rid: 'from-other-mac', list: 'L-ct', title: '取快递', due: '2026-11-25 18:00', alarms: [{ offset: 0 }], url: mark, notes: `来自《待办》· 收件箱\n${mark}`, created: 2000 },
      ],
    },
  })
  try {
    await connect(run.page, L.zh)
    await expect.poll(() => mem(run).items.map((i) => i.rid), { timeout: 10_000 }).toEqual(['from-iphone'])
  } finally {
    await run.close()
  }
})

test('在提醒事项「画布今日」列表里新建的：写进 收件箱/待办.md、那一条补上链接成镜像（不删不重建）、勾掉写回；别的列表不碰；设置里写着', async () => {
  const files = { '收件箱/待办.md': '# 待办\n\n- [ ] 交水电费 📅 2026-11-30\n' }
  const run = await launch({
    files,
    reminders: {
      lists: [
        { id: 'L-ct', title: '画布今日', icloud: true },
        { id: 'L-shop', title: '购物', icloud: true },
      ],
      items: [{ rid: 'shop1', list: 'L-shop', title: '鸡蛋', created: 1 }],
    },
  })
  const { page } = run
  try {
    const s = await connect(page, L.zh)
    // 设置里写一句：在这个列表里新建的也会写进哪一篇
    await expect(s.locator('[data-row="remList"]')).toContainText('在提醒事项「画布今日」列表里新建的，也会写进 收件箱/待办.md')
    await page.keyboard.press('Escape')

    // 像在 iPhone 提醒事项里加了两条：一条带闹钟和备注、一条什么都没有
    const a = await external(run, { op: 'add', list: 'L-ct', fields: { title: '交论文初稿', due: '2026-11-25 15:00', alarms: [{ offset: -3600 }], priority: 1, notes: '找王老师签字' } })
    const b = await external(run, { op: 'add', list: 'L-ct', fields: { title: '买牛奶' } })
    const ridA = (a as { rid: string }).rid
    const ridB = (b as { rid: string }).rid
    await expect.poll(() => run.read('收件箱/待办.md'), { timeout: 10_000 }).toMatch(/- \[ \] 买牛奶 🆔 [a-z0-9]{6}\n/)
    const text = run.read('收件箱/待办.md')
    expect(text).toMatch(/^# 待办\n\n- \[ \] 交水电费 📅 2026-11-30\n/)
    expect(text).toMatch(/- \[ \] 交论文初稿 📅 2026-11-25 15:00 🔔 提前1小时 ⏫ 🆔 [a-z0-9]{6}\n {4}> 找王老师签字\n/)
    const idA = idOf(text, '交论文初稿')!
    const idB = idOf(text, '买牛奶')!
    await expect.poll(() => uncommitted(run), { timeout: 10_000 }).toBe('')
    expect(commits(run.vault).join('\n')).toContain('画布今日：从提醒事项加了')

    // 提醒事项里还是原来那两条（rid 没变，没删了重建），补上了链接；标题、到期、闹钟、优先级没动，备注上面人写的留着
    await expect.poll(() => mem(run).items.find((i) => i.rid === ridB)?.url, { timeout: 10_000 }).toBe(`canvas-today://task/${idB}?from=reminders`)
    const ra = mem(run).items.find((i) => i.rid === ridA)!
    expect(ra).toMatchObject({ title: '交论文初稿', due: '2026-11-25 15:00', alarms: [{ offset: -3600 }], priority: 1, url: `canvas-today://task/${idA}?from=reminders` })
    expect(ra.notes).toMatch(/^找王老师签字\n来自《待办》· 收件箱\ncanvas-notes:\/\/open\?.*\ncanvas-today:\/\/task\/[a-z0-9]{6}\?from=reminders$/)
    expect(mem(run).items.filter((i) => i.list === 'L-ct').map((i) => i.rid).sort()).toEqual([ridA, ridB].sort())
    // 别的列表不碰
    const shop = mem(run).items.find((i) => i.rid === 'shop1')!
    expect([shop.title, shop.url ?? null, shop.notes ?? null]).toEqual(['鸡蛋', null, null])
    expect(run.read('收件箱/待办.md')).not.toContain('鸡蛋')

    // 在提醒事项里勾掉没写 🔔 的那条 → 库里那一行勾上
    await external(run, { op: 'complete', task: idB, at: '2026-11-24T10:00' })
    await expect.poll(() => run.read('收件箱/待办.md'), { timeout: 10_000 }).toContain(`- [x] 买牛奶 🆔 ${idB} ✅ 2026-11-24\n`)
    // 再同步几遍：库里只有这一份，提醒事项里也还是这两条
    await page.waitForTimeout(1500)
    expect(run.read('收件箱/待办.md').match(/买牛奶/g)).toHaveLength(1)
    expect(mem(run).items.filter((i) => i.list === 'L-ct')).toHaveLength(2)
    // 我们这边改标题 → 提醒事项那条跟着改
    await page.locator('.nav[data-k="week"]').click()
    await row(page, '交论文初稿').click()
    const title = page.locator('[data-part="详情"] .dtitle input')
    await expect(title).toHaveValue('交论文初稿')
    await title.fill('交论文终稿')
    await title.press('Enter')
    await expect.poll(() => mem(run).items.find((i) => i.rid === ridA)?.title, { timeout: 10_000 }).toBe('交论文终稿')
  } finally {
    await run.close()
  }
})
