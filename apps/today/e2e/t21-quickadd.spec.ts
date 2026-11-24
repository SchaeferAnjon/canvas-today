/**
 * 全局快速加一条 + 菜单栏常驻（画布今日特色第一条线）：测试模式不注册真的全局键，globalThis.ctQuick.press() 当作按了 ⌥⇧T；
 * ctQuick.front(名字) 假装弹之前前台是哪个软件，收起时还焦点给了谁记在 ctQuick.restored()。CT_TAKEN_KEYS 假装几组键被别的软件占了。
 * 小框、小窗都不上屏，在里面真打字、真按键、真点。
 */
import { expect, type Page, test } from '@playwright/test'
import { commits, launch, nav, row, type Running } from './app'
import { CAL_SEED } from './fixtures'

/** 那组键：设置里想要的、注册上了没有 */
const keyState = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctQuick: { state(): { wanted: string; registered: boolean } } }).ctQuick.state())
const press = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctQuick: { press(): Promise<void> } }).ctQuick.press())
const isOpen = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctQuick: { isOpen(): boolean } }).ctQuick.isOpen())
const front = (run: Running, name: string) => run.app.evaluate((_e, n) => (globalThis as unknown as { ctQuick: { front(n: string): void } }).ctQuick.front(n), name)
const restored = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctQuick: { restored(): string[] } }).ctQuick.restored())
const notifs = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctNotifs: { title: string; body: string; actions: string[] }[] }).ctNotifs)
const act = (run: Running, n: number, a: string) => run.app.evaluate((_e, [n, a]) => (globalThis as unknown as { ctNotifAct: (n: number, a: string) => void }).ctNotifAct(n as number, a as string), [n, a] as const)
const trayTitle = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctTrayTitle: () => string }).ctTrayTitle())

/** 小框那一页（第一次按时才建） */
async function quickPage(run: Running): Promise<Page> {
  await expect.poll(() => run.app.windows().some((w) => w.url().endsWith('/quick.html'))).toBe(true)
  const p = run.app.windows().find((w) => w.url().endsWith('/quick.html'))!
  await expect(p.locator('.qp textarea')).toBeVisible()
  return p
}

async function trayPage(run: Running): Promise<Page> {
  await run.app.evaluate(() => (globalThis as unknown as { ctTrayOpen: () => number }).ctTrayOpen())
  await expect.poll(() => run.app.windows().some((w) => w.url().endsWith('/tray.html'))).toBe(true)
  const p = run.app.windows().find((w) => w.url().endsWith('/tray.html'))!
  await expect(p.locator('.trh b')).toBeVisible()
  return p
}

test('在别的软件里按 ⌥⇧T：弹出小框，边打边认出日子钟点提醒优先级和清单，回车写进那一篇、收起、焦点还给原来的软件、弹通知能撤销', async () => {
  const run = await launch()
  try {
    expect(await keyState(run)).toEqual({ wanted: '⌥⇧T', registered: true })
    await front(run, 'Google Chrome')
    await press(run)
    const qp = await quickPage(run)
    expect(await isOpen(run)).toBe(true)
    const box = qp.getByLabel('快速加一条')
    await expect(box).toBeFocused()
    await expect(qp.locator('#qgot')).toHaveText('写日子、钟点、提醒、重复、#清单、!优先级都认；没写日子的进收件箱，不定日子')
    await expect(qp.locator('.qdest')).toContainText('写进《待办》收件箱没写#清单，放收件箱')
    // 真打字（一个键一个键）：下面一行跟着认
    await box.pressSequentially('明天下午三点 交实验报告 提前1小时提醒 #小论文计划 !高')
    const got = qp.locator('#qgot')
    await expect(got).toContainText('认出来：')
    await expect(got.locator('.chip')).toHaveText(['明天 15:00', '提前1小时', '高', '#小论文计划'])
    await expect(got).toContainText('· 「交实验报告」')
    await expect(qp.locator('.qdest b')).toHaveText('《小论文计划》')
    await expect(qp.locator('.qdest')).toContainText('写作')
    await expect(qp.locator('.qdest .qwhy')).toHaveText('按「#小论文计划」认出')
    await expect(qp.locator('.qfoot')).toContainText('在任何软件里按 ⌥⇧T')
    const before = commits(run.vault).length
    await box.press('Enter')
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain('- [ ] 交实验报告 📅 2026-11-23 15:00 🔔 提前1小时 ⏫')
    // 别的行一个字没动：只多了这一行
    expect(run.read('写作/小论文计划.md').replace(/- \[ \] 交实验报告[^\n]*\n/, '')).toBe(
      '# 小论文计划\n\n截稿前把实验和初稿弄完，周五交给导师。\n\n## 这周\n\n- [ ] 读完三篇相关论文 📅 2026-11-22 🔼\n    - [x] Attention Is All You Need\n    - [ ] BERT\n    - [ ] ViT\n- [ ] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 ⏫\n- [x] 和导师约时间 ✅ 2026-11-21\n\n## 下周\n\n- [ ] 补实验图 📅 2026-11-25 🔼\n- [ ] 改摘要\n',
    )
    expect(await isOpen(run)).toBe(false)
    expect(await restored(run)).toEqual(['Google Chrome'])
    const n = await notifs(run)
    expect(n.at(-1)).toMatchObject({ title: '加上了「交实验报告」', body: '写进《小论文计划》 · 明天 15:00', actions: ['撤回'] })
    await expect.poll(() => commits(run.vault)[0]).toBe('画布今日：加了「交实验报告」')
    expect(commits(run.vault).length).toBe(before + 1)
    // 主窗口跟着有了（左栏「明天」）
    await nav(run.page, 'tomorrow').click()
    await expect(row(run.page, '交实验报告')).toBeVisible()
    // 通知上点「撤销」：那一行拿掉，文件回到原来的样子
    await act(run, n.length - 1, 'done')
    await expect.poll(() => run.read('写作/小论文计划.md')).not.toContain('交实验报告')
    await expect(row(run.page, '交实验报告')).toHaveCount(0)
    // 再按一次：上次的字清掉了
    await press(run)
    await expect(box).toHaveValue('')
    await expect(box).toBeFocused()
  } finally {
    await run.close()
  }
})

test('Esc 关掉不写；中文输入法选字时按回车不加；英文也认', async () => {
  const run = await launch()
  try {
    await front(run, 'Mail')
    await press(run)
    const qp = await quickPage(run)
    const box = qp.getByLabel('快速加一条')
    const inbox = run.read('收件箱/待办.md')
    await box.pressSequentially('买牛奶')
    // 输入法还在选字（isComposing）时的回车：不加
    await box.evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true, cancelable: true })))
    await qp.waitForTimeout(300)
    expect(await isOpen(run)).toBe(true)
    expect(run.read('收件箱/待办.md')).toBe(inbox)
    await box.press('Escape')
    await expect.poll(() => isOpen(run)).toBe(false)
    expect(await restored(run)).toEqual(['Mail'])
    expect(run.read('收件箱/待办.md')).toBe(inbox)
    await press(run)
    await expect(box).toHaveValue('')
    await box.pressSequentially('tomorrow 3pm call mom !high')
    await expect(qp.locator('#qgot .chip')).toHaveText(['明天 15:00', '高'])
    await box.press('Enter')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] call mom 📅 2026-11-23 15:00 ⏫\n')
  } finally {
    await run.close()
  }
})

test('主窗口关了照样能用：按键、回车写进收件箱；⇧↵ 加上并在画布今日里打开那一条', async () => {
  const run = await launch()
  try {
    await press(run)
    const qp = await quickPage(run)
    await qp.getByLabel('快速加一条').press('Escape')
    // 关掉主窗口（软件常驻，小框还在）
    await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/index.html'))!.close())
    await expect.poll(() => run.app.windows().filter((w) => w.url().endsWith('/index.html')).length).toBe(0)
    await press(run)
    const box = qp.getByLabel('快速加一条')
    await box.pressSequentially('每周五 整理读书笔记')
    await expect(qp.locator('#qgot .chip')).toHaveText(['周五', '每周五'])
    await box.press('Enter')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 整理读书笔记 📅 2026-11-27 🔁 每周五\n')
    expect(await isOpen(run)).toBe(false)
    // ⇧↵：加上并打开（主窗口重新建出来，选中刚加的那一条）
    await press(run)
    await box.pressSequentially('后天 换灯泡')
    await box.press('Shift+Enter')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 换灯泡 📅 2026-11-24\n')
    await expect.poll(() => run.app.windows().some((w) => w.url().endsWith('/index.html'))).toBe(true)
    const main = run.app.windows().find((w) => w.url().endsWith('/index.html'))!
    await expect(main.locator('[data-part="详情"] .dtitle input')).toHaveValue('换灯泡')
  } finally {
    await run.close()
  }
})

test('一次贴进几行：一行一条各认各的、各进各的笔记；#清单 模糊找、⌘↵ 换一篇', async () => {
  const run = await launch()
  try {
    await press(run)
    const qp = await quickPage(run)
    const box = qp.getByLabel('快速加一条')
    // 模糊找：「#杀死」对上《杀死一只知更鸟》
    await box.pressSequentially('读第五章 #杀死')
    await expect(qp.locator('.qdest b')).toHaveText('《杀死一只知更鸟》')
    await expect(qp.locator('.qdest .qwhy')).toHaveText('按「#杀死」认出')
    // ⌘↵ 换一篇：换到收件箱（#杀死 留在标题里）
    await box.press('Meta+Enter')
    await expect(qp.locator('.qdest b')).toHaveText('《待办》')
    await expect(qp.locator('.qdest .qwhy')).toHaveText('自己换的')
    // 换进收件箱：#杀死 留在标题里，认出来那一行照写进去的样子写
    await expect(qp.locator('#qgot')).toContainText('· 「读第五章 #杀死」')
    await expect(qp.locator('#qgot .chip')).toHaveCount(0)
    await qp.getByRole('button', { name: /换一篇/ }).click()
    await expect(qp.locator('.qdest b')).toHaveText('《杀死一只知更鸟》')
    await box.press('Meta+Enter')
    await box.press('Enter')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 读第五章 #杀死\n')
    expect(run.read('阅读/杀死一只知更鸟.md')).not.toContain('读第五章')
    await expect.poll(() => commits(run.vault)[0]).toBe('画布今日：加了「读第五章 #杀死」')
    // 贴进三行（先试一下没对上的 #清单）
    await press(run)
    const before = commits(run.vault).length
    await box.fill('读第五章 #没有这篇')
    await expect(qp.locator('.qdest .qwhy')).toHaveText('没对上「没有这篇」这篇，#没有这篇留在标题里')
    await expect(qp.locator('#qgot')).toContainText('· 「读第五章 #没有这篇」')
    await box.fill('明天 买牛奶 #家务\n周三下午3点 交第三章习题 #作业 !高\n\n整理桌面')
    await expect(qp.locator('.qmulti .qr')).toHaveCount(3)
    await expect(qp.locator('.qmulti .qr').nth(0)).toHaveText(/买牛奶明天家务/)
    await expect(qp.locator('.qmulti .qr').nth(1)).toHaveText(/交第三章习题周三 15:00高作业/)
    await expect(qp.locator('.qmulti .qr').nth(2)).toHaveText(/整理桌面待办/)
    await expect(qp.locator('.qdest')).toContainText('写进3篇各自按#清单放，没写的进收件箱')
    await expect(qp.locator('.qfoot')).toContainText('加上3条')
    await box.press('Enter')
    await expect.poll(() => run.read('生活/家务.md')).toContain('- [ ] 买牛奶 📅 2026-11-23\n')
    await expect.poll(() => run.read('课程/线性代数/作业.md')).toContain('- [ ] 交第三章习题 📅 2026-11-25 15:00 ⏫\n')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 整理桌面\n')
    const n = await notifs(run)
    expect(n.at(-1)).toMatchObject({ title: '加上了3条', body: '各自写进对应的笔记' })
    // 三条一次提交
    await expect.poll(() => commits(run.vault).length).toBe(before + 1)
    expect(commits(run.vault)[0]).toContain('买牛奶')
    expect(commits(run.vault)[0]).toContain('整理桌面')
  } finally {
    await run.close()
  }
})

test('菜单栏：图标旁边写今天还有几条；小窗里下一件、勾掉写回、今天勾掉的划掉能改回、点一条打开、底下快速加一条', async () => {
  const run = await launch({ now: '2026-11-22T12:00:00', reminders: { ...CAL_SEED, calAuth: 'full' }, settings: { calendar: { show: true } } })
  const { page } = run
  try {
    const tray = await trayPage(run)
    const n0 = Number((await tray.locator('.trn').innerText()).match(/\d+/)![0])
    expect(n0).toBeGreaterThan(3)
    await expect.poll(() => trayTitle(run)).toBe(String(n0))
    await expect(tray.locator('.trh b')).toHaveText('今天')
    await expect(tray.locator('.trh')).toContainText('11月22日 周日')
    // 下一件：16:00 和爸妈视频（家里的日历），比 18:00 的待办早
    const next = tray.locator('[data-part="下一件"]')
    await expect(next.locator('b')).toHaveText('16:00 和爸妈视频')
    await expect(next).toContainText('家里 · 还有4小时')
    // 勾掉「取快递」：写回那一篇，数少一条，划掉留在下面
    await tray.locator('.row', { hasText: '取快递' }).locator('.cb').click()
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [x] 取快递 📅 2026-11-22 ✅ 2026-11-22')
    await expect(tray.locator('.trn')).toHaveText(`还有${n0 - 1}条`)
    await expect.poll(() => trayTitle(run)).toBe(String(n0 - 1))
    await expect(tray.locator('.row.done', { hasText: '取快递' })).toBeVisible()
    await expect(tray.locator('.trsay')).toHaveText('勾掉了「取快递」')
    // 点划掉的那一条的勾：改回没做完
    await tray.locator('.row.done', { hasText: '取快递' }).locator('.cb').click()
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 取快递 📅 2026-11-22\n')
    await expect.poll(() => trayTitle(run)).toBe(String(n0))
    // 点一条：画布今日里打开，选中它
    await tray.locator('.row', { hasText: '交 ecp 作业 2' }).locator('.rt').click()
    await expect(page.locator('[data-part="详情"] .dtitle input')).toHaveValue('交 ecp 作业 2')
    // 底下「加一条」：弹全局小框
    await expect(tray.locator('.tradd')).toHaveText('加一条，或在哪都能按 ⌥⇧T')
    await tray.locator('.tradd').click()
    await expect.poll(() => isOpen(run)).toBe(true)
    const qp = await quickPage(run)
    await qp.getByLabel('快速加一条').pressSequentially('下午五点 打电话给房东')
    await qp.getByLabel('快速加一条').press('Enter')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 打电话给房东 📅 2026-11-22 17:00\n')
    await expect(tray.locator('.row', { hasText: '打电话给房东' })).toBeVisible()
    await expect.poll(() => trayTitle(run)).toBe(String(n0 + 1))
  } finally {
    await run.close()
  }
})

test('快捷键被别的软件占了：小窗和设置里说出来，点一组推荐的就换上；录键时系统和软件自己的键不给', async () => {
  const run = await launch({ env: { CT_TAKEN_KEYS: '⌥⇧T' } })
  const { page } = run
  try {
    expect(await keyState(run)).toEqual({ wanted: '⌥⇧T', registered: false })
    // 打开时主窗口说一次
    await expect(page.locator('.toast')).toContainText('⌥⇧T 被别的软件占了，快速加一条只能从菜单栏打开')
    const tray = await trayPage(run)
    await expect(tray.locator('.tradd')).toHaveText('加一条')
    await expect(tray.locator('.trtaken')).toHaveText('⌥⇧T 被别的软件占了 ·去设置换')
    // 「去设置换」：主窗口开到设置 › 一般
    await tray.locator('.trtaken').getByRole('button', { name: '去设置换' }).click()
    const s = page.locator('.set')
    const r = s.locator('[data-row="quickKey"]')
    await expect(r.locator('.sa-lb')).toHaveText('快速加一条的快捷键')
    await expect(r.getByRole('button', { name: '改快速加一条的快捷键' })).toHaveText('⌥⇧T')
    await expect(r.getByRole('alert')).toContainText('⌥⇧T 被别的软件占了，画布今日收不到；换一组：')
    await expect(r.getByRole('alert').getByRole('button')).toHaveText(['⌃⌥N', '⌃⌥⌘T'])
    await r.getByRole('alert').getByRole('button', { name: '⌃⌥N' }).click()
    await expect(r.getByRole('button', { name: '改快速加一条的快捷键' })).toHaveText('⌃⌥N')
    await expect(r.getByRole('alert')).toHaveCount(0)
    await expect.poll(() => keyState(run)).toEqual({ wanted: '⌃⌥N', registered: true })
    await expect(tray.locator('.tradd')).toHaveText('加一条，或在哪都能按 ⌃⌥N')
    // 录键：⌘K 是画布今日自己的，不给
    await r.getByRole('button', { name: '改快速加一条的快捷键' }).click()
    await expect(r.getByRole('button', { name: '改快速加一条的快捷键' })).toHaveText('按一组新的键…')
    await page.keyboard.press('Meta+K')
    await expect(r.getByRole('alert')).toHaveText('⌘K 是画布今日的「搜索、加一条」，换一组')
    await expect(page.locator('.pal')).toHaveCount(0)
    // 只按 ⌥ 加字母：打字时会按到，不给
    await r.getByRole('button', { name: '改快速加一条的快捷键' }).click()
    await page.keyboard.press('Alt+KeyT')
    await expect(r.getByRole('alert')).toHaveText('要带上 ⌘ 或 ⌃，或者 ⌥⇧ 一起按，不然打字时会按到')
    // ⌥Space 能给，先说常被谁占着
    await r.getByRole('button', { name: '改快速加一条的快捷键' }).click()
    await page.keyboard.press('Alt+Space')
    await expect(r.getByRole('alert')).toHaveText('⌥Space 常被Raycast、ChatGPT、Todoist占着；注册不上时这里会说')
    await expect.poll(() => keyState(run)).toEqual({ wanted: '⌥Space', registered: true })
    // 换回 ⌥⇧T（被占的那组）：又说被占了；提示条上「撤回」回到 ⌥Space
    await r.getByRole('button', { name: '改快速加一条的快捷键' }).click()
    await page.keyboard.press('Alt+Shift+KeyT')
    await expect(r.getByRole('alert')).toContainText('⌥⇧T 被别的软件占了')
    await s.getByTestId('settings-toast').getByRole('button', { name: '撤回' }).click()
    await expect(r.getByRole('button', { name: '改快速加一条的快捷键' })).toHaveText('⌥Space')
    await expect.poll(() => keyState(run)).toEqual({ wanted: '⌥Space', registered: true })
  } finally {
    await run.close()
  }
})
