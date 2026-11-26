/**
 * 画布今日对标画布笔记第一批（对标清单页 161 的 U5、U6、U7、U8、U9、U12）：一律真点、真按键、真在设置里录键；
 * 从别的软件拖进来是在窗口上派发带 DataTransfer 的 dragover / drop（无头窗口里没法从另一个软件真拖，派发的事件和真拖进来时界面收到的一样）。
 */
import { expect, type Page, test } from '@playwright/test'
import { launch, nav, quit, row } from './app'

const dlg = (p: Page) => p.getByRole('dialog', { name: '设置' })
const screen = (run: { app: import('@playwright/test').ElectronApplication }) => run.app.evaluate(() => (globalThis as unknown as { cnScreen: string[] }).cnScreen)

/** 在 sel 那一格上派发一次从外面拖进来（dragover 再 drop），带这几种字 */
async function dropOn(page: Page, sel: string, data: Record<string, string>) {
  await page.evaluate(
    ({ sel, data }) => {
      const el = document.querySelector<HTMLElement>(sel)!
      const r = el.getBoundingClientRect()
      const at = { clientX: r.left + r.width / 2, clientY: r.top + Math.min(r.height / 2, 12), bubbles: true, cancelable: true }
      const dt = new DataTransfer()
      for (const [k, v] of Object.entries(data)) dt.setData(k, v)
      const hit = document.elementFromPoint(at.clientX, at.clientY)!
      hit.dispatchEvent(new DragEvent('dragover', { ...at, dataTransfer: dt }))
      hit.dispatchEvent(new DragEvent('drop', { ...at, dataTransfer: dt }))
    },
    { sel, data },
  )
}

test('U12 打勾：原处留一行「已完成 · 撤回」，点撤回文件回到原样；不点 2 秒后从「今天」拿掉，只在「已完成」里', async () => {
  const run = await launch()
  const { page } = run
  try {
    const before = run.read('收件箱/待办.md')
    await row(page, '取快递').locator('.cb').click()
    const just = page.locator('.center .row.just', { hasText: '取快递' })
    await expect(just).toContainText('已完成 · 撤回')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [x] 取快递 📅 2026-11-22 ✅ 2026-11-22')
    await just.getByRole('button', { name: '撤回' }).click()
    await expect.poll(() => run.read('收件箱/待办.md')).toBe(before)
    await expect(page.locator('.center .row:not(.just)', { hasText: '取快递' })).toBeVisible()
    // 再勾一次，不点：2 秒后没了，「今天」里也没有「今天勾掉的」那组
    await row(page, '取快递').locator('.cb').click()
    await expect(page.locator('.center .row', { hasText: '取快递' })).toHaveCount(0, { timeout: 4000 })
    await expect(page.locator('.center .grp', { hasText: '今天勾掉的' })).toHaveCount(0)
    await nav(page, 'done').click()
    await expect(page.locator('.center .row.done', { hasText: '取快递' })).toBeVisible()
  } finally {
    await run.close()
  }
})

test('U7 重开回到上次那一格：日历月看法、一篇清单；开着「打开时先排一天」时先排一天', async () => {
  let run = await launch()
  const root = run.root
  try {
    await run.page.locator('.abar.l .ab[data-k="calendar"]').click()
    await run.page.locator('.center').getByRole('tab', { name: '月', exact: true }).click()
    await quit(run)
    run = await launch({ root })
    await expect(run.page.locator('.abar.l .ab[data-k="calendar"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(run.page.locator('.center').getByRole('tab', { name: '月', exact: true })).toHaveAttribute('aria-selected', 'true')
    // 清单里的一篇
    await run.page.locator('.abar.l .ab[data-k="lists"]').click()
    await nav(run.page, 'list:写作/小论文计划.md').click()
    await quit(run)
    run = await launch({ root })
    await expect(nav(run.page, 'list:写作/小论文计划.md')).toHaveClass(/\bon\b/)
    await expect(run.page.locator('.center .vhead h1')).toHaveText('小论文计划')
    // 打开「打开时先排一天」：先排一天
    await run.page.keyboard.press('Meta+,')
    await dlg(run.page).getByRole('button', { name: '排一天' }).click()
    await dlg(run.page).getByRole('switch', { name: '打开时先排一天' }).click()
    await quit(run)
    run = await launch({ root })
    await expect(run.page.locator('.abar.l .ab[data-k="plan"]')).toHaveAttribute('aria-pressed', 'true')
  } finally {
    await run.close()
  }
})

test('U5 快捷键：搜索换成 ⌥⌘P 当场生效、菜单跟着换；撞了说撞了谁，换给这一条；回到默认；录键时 esc 取消', async () => {
  const run = await launch()
  const { page, app } = run
  try {
    await page.keyboard.press('Meta+,')
    await dlg(page).getByRole('button', { name: '快捷键', exact: true }).click()
    await expect(dlg(page).getByRole('heading', { name: '快捷键' })).toBeVisible()
    // 每条命令一行，没有默认键的写「没有」
    await expect(dlg(page).getByRole('button', { name: '改 搜索、加一条 的快捷键' })).toHaveText('⌘K')
    await expect(dlg(page).getByRole('button', { name: '改 排一天 的快捷键' })).toHaveText('没有')
    await expect(dlg(page).locator('[data-row="k-undo"] .sa-keyb.fixed')).toHaveText('⌘Z')
    // 录键时 esc 取消，设置不关
    await dlg(page).getByRole('button', { name: '改 搜索、加一条 的快捷键' }).click()
    await expect(dlg(page).getByRole('button', { name: '改 搜索、加一条 的快捷键' })).toHaveText('按新的组合键…')
    await page.keyboard.press('Escape')
    await expect(dlg(page).getByRole('button', { name: '改 搜索、加一条 的快捷键' })).toHaveText('⌘K')
    // 换成 ⌥⌘P
    await dlg(page).getByRole('button', { name: '改 搜索、加一条 的快捷键' }).click()
    await page.keyboard.press('Alt+Meta+p')
    await expect(dlg(page).getByRole('button', { name: '改 搜索、加一条 的快捷键' })).toHaveText('⌥⌘P')
    await expect(page.getByTestId('settings-toast')).toContainText('「搜索、加一条」换成 ⌥⌘P')
    await expect.poll(() => JSON.parse(run.read('../user-data/settings.json')).keys).toEqual({ search: '⌥⌘P' })
    // 菜单「编辑 › 搜索、加一条…」的键跟着换
    const accel = () => app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.flatMap((m) => m.submenu?.items ?? []).find((i) => i.label === '搜索、加一条…')?.accelerator ?? null)
    await expect.poll(accel).toBe('Alt+Command+P')
    // 不给系统的键
    await dlg(page).getByRole('button', { name: '改 排一天 的快捷键' }).click()
    await page.keyboard.press('Meta+q')
    await expect(dlg(page).locator('[data-row="k-go-plan"]')).toContainText('⌘Q 是退出，换一个')
    // 撞了「设置」：换给这一条
    await dlg(page).getByRole('button', { name: '改 排一天 的快捷键' }).click()
    await page.keyboard.press('Meta+,')
    await expect(dlg(page).locator('[data-row="k-go-plan"]')).toContainText('⌘, 已经给了「设置」')
    await dlg(page).locator('[data-row="k-go-plan"]').getByRole('button', { name: '换给这一条' }).click()
    await expect(dlg(page).getByRole('button', { name: '改 排一天 的快捷键' })).toHaveText('⌘,')
    await expect(dlg(page).getByRole('button', { name: '改 设置 的快捷键' })).toHaveText('没有')
    await expect(page.getByTestId('settings-toast')).toContainText('「排一天」换成 ⌘,，「设置」没有快捷键了')
    // 搜这一页：只剩打中的
    await dlg(page).getByRole('textbox', { name: '搜快捷键' }).fill('左栏')
    await expect(dlg(page).locator('.sa-row')).toHaveCount(1)
    await dlg(page).getByRole('textbox', { name: '搜快捷键' }).fill('')
    // 关上设置，真按：⌘K 不再开搜索，⌥⌘P 开；⌘, 去排一天
    await dlg(page).getByRole('button', { name: '关上设置' }).click()
    await page.keyboard.press('Meta+k')
    await page.waitForTimeout(200)
    await expect(page.locator('.pal')).toHaveCount(0)
    await page.keyboard.press('Alt+Meta+p')
    await expect(page.locator('.pal')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Meta+,')
    await expect(page.locator('.abar.l .ab[data-k="plan"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(dlg(page)).toHaveCount(0)
    // 回到默认
    await page.locator('.abar.l .ab[data-k="settings"]').click()
    await dlg(page).getByRole('button', { name: '快捷键', exact: true }).click()
    await dlg(page).getByRole('button', { name: '搜索、加一条 回到默认' }).click()
    await expect(dlg(page).getByRole('button', { name: '改 搜索、加一条 的快捷键' })).toHaveText('⌘K')
    await dlg(page).getByRole('button', { name: '设置 回到默认' }).click()
    await expect(dlg(page).getByRole('button', { name: '改 设置 的快捷键' })).toHaveText('⌘,')
    // 一般页的快速加一条撞了软件里的键：照现在谁用着说
    await dlg(page).getByRole('button', { name: '一般' }).click()
    await dlg(page).getByRole('button', { name: '改快速加一条的快捷键' }).click()
    await page.keyboard.press('Meta+\\')
    await expect(dlg(page).locator('[data-row="quickKey"]').getByRole('alert')).toHaveText('⌘\\ 已经给了「收起 / 展开左栏」，换一个')
  } finally {
    await run.close()
  }
})

test('U6 设置搜索：打「提醒」侧栏换成搜到的几项，回车翻到那一页、那一行闪；英文也认；esc 先清空', async () => {
  const run = await launch()
  const { page } = run
  try {
    await page.keyboard.press('Meta+,')
    const box = dlg(page).getByRole('textbox', { name: '搜设置' })
    await box.fill('提醒')
    const res = dlg(page).getByRole('list', { name: '搜到的设置' })
    await expect(res).toBeVisible()
    await expect(res.locator('.sa-rrow').first()).toContainText('提醒所有带钟点的待办')
    await expect(res.locator('.sa-rrow').first()).toContainText('日历和提醒事项 › 到点提醒')
    await box.press('Enter')
    await expect(dlg(page).getByRole('heading', { name: '日历和提醒事项' })).toBeVisible()
    await expect(dlg(page).locator('[data-row="remindAll"]')).toHaveClass(/sa-flash/)
    // 英文
    await box.fill('shortcut search')
    await res.locator('.sa-rrow').first().click()
    await expect(dlg(page).getByRole('heading', { name: '快捷键' })).toBeVisible()
    await expect(dlg(page).locator('[data-row="k-search"]')).toHaveClass(/sa-flash/)
    // 没有的：给几个试试
    await box.fill('没有这种xyz')
    await expect(dlg(page).locator('.sa-rempty')).toContainText('没找到「没有这种xyz」。')
    await dlg(page).locator('.sa-rempty').getByRole('button', { name: '主题' }).click()
    await expect(box).toHaveValue('主题')
    // esc 先清空，再按一次才关设置
    await box.press('Escape')
    await expect(box).toHaveValue('')
    await expect(dlg(page)).toBeVisible()
  } finally {
    await run.close()
  }
})

test('U8 ⌘ 悬停：弹出这一条在笔记里的上下文，那一行亮着；松开 ⌘ 不收；⌘ 停到另一条换过去；esc、点外面收起；「在画布笔记里打开」', async () => {
  const run = await launch()
  const { page } = run
  try {
    const a = (await row(page, '读完三篇相关论文').boundingBox())!
    await page.mouse.move(a.x + 80, a.y + a.height / 2)
    await page.keyboard.down('Meta')
    const pk = page.locator('.pk')
    await expect(pk).toBeVisible()
    await expect(pk.locator('.pk-t')).toHaveText('小论文计划')
    await expect(pk.locator('.pk-sub')).toContainText('写作 · 第7行')
    await expect(pk.locator('.pk-l.hit')).toContainText('读完三篇相关论文')
    // 开头的「# 小论文计划」不再画一遍（头上有笔记名），正文从下面那句起
    await expect(pk.locator('.pk-l.h1')).toHaveCount(0)
    await expect(pk.locator('.pk-l:not(.gap)').first()).toHaveText('截稿前把实验和初稿弄完，周五交给导师。')
    // 浮窗左边对齐这一条标题的起点
    const rt = (await row(page, '读完三篇相关论文').locator('.rt').boundingBox())!
    expect(Math.abs((await pk.boundingBox())!.x - rt.x)).toBeLessThan(2)
    await expect(pk.locator('.pk-l.task.done')).toContainText(['Attention Is All You Need'])
    // 松开 ⌘、鼠标移开都不收
    await page.keyboard.up('Meta')
    await page.mouse.move(a.x + 80, a.y + 200)
    await page.waitForTimeout(300)
    await expect(pk).toBeVisible()
    // 按着 ⌘ 停到另一条（浮窗没盖住的那一截）：换成那一条
    const b = (await row(page, '复习 Lecture05').boundingBox())!
    const box = (await pk.boundingBox())!
    expect(b.x + b.width - 30).toBeGreaterThan(box.x + box.width)
    await page.keyboard.down('Meta')
    await page.mouse.move(b.x + b.width - 30, b.y + b.height / 2)
    await expect(pk.locator('.pk-t')).toHaveText('Lecture05 笔记')
    await expect(pk.locator('.pk-l.hit')).toContainText('复习 Lecture05 的神经元结构图')
    await page.keyboard.up('Meta')
    // esc 收起
    await page.keyboard.press('Escape')
    await expect(pk).toHaveCount(0)
    // 再弹，点外面收起
    await page.mouse.move(a.x + 80, a.y + a.height / 2)
    await page.keyboard.down('Meta')
    await expect(pk).toBeVisible()
    await page.keyboard.up('Meta')
    await page.locator('.center .vhead h1').click()
    await expect(pk).toHaveCount(0)
    // 不按 ⌘ 停着不弹
    await page.mouse.move(b.x + 80, b.y + b.height / 2)
    await page.waitForTimeout(300)
    await expect(pk).toHaveCount(0)
    // 「在画布笔记里打开」：到那一行
    await page.keyboard.down('Meta')
    await expect(pk).toBeVisible()
    await page.keyboard.up('Meta')
    await pk.getByRole('button', { name: '在画布笔记里打开' }).click()
    await expect(pk).toHaveCount(0)
    await expect.poll(async () => (await screen(run)).join('\n')).toMatch(/Lecture05/)
  } finally {
    await run.close()
  }
})

test('U9 从别的软件拖进来：一段字一行一条进指到的那篇清单；网址带字写成链接进「今天」；拖着时那一格亮、旁边写松手加进哪；撤回一次撤掉几条', async () => {
  const run = await launch()
  const { page } = run
  try {
    const before = run.read('写作/小论文计划.md')
    // 拖着：指到左栏「小论文计划」亮一圈、写松手加进哪
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.nav[data-k="list:写作/小论文计划.md"]')!
      const r = el.getBoundingClientRect()
      const dt = new DataTransfer()
      dt.setData('text/plain', '甲')
      document.elementFromPoint(r.left + 40, r.top + 10)!.dispatchEvent(new DragEvent('dragover', { clientX: r.left + 40, clientY: r.top + 10, bubbles: true, cancelable: true, dataTransfer: dt }))
    })
    await expect(page.locator('.nav[data-k="list:写作/小论文计划.md"]')).toHaveClass(/cal-over/)
    await expect(page.locator('.drop-tag')).toHaveText('松手加进「小论文计划」')
    await expect(page.locator('.drop-tag')).toHaveCount(0, { timeout: 2000 })
    // 放下一段三行的字（带列表记号）
    await dropOn(page, '.nav[data-k="list:写作/小论文计划.md"]', { 'text/plain': '- 查参考文献格式\n\n- 问师兄要数据\n* 画流程图' })
    await expect(page.locator('.toast')).toContainText('从别处拖进来加了3条')
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain('- [ ] 查参考文献格式\n- [ ] 问师兄要数据\n- [ ] 画流程图\n')
    // 撤回一次三条都撤掉
    await page.locator('.toast').getByRole('button', { name: '撤回' }).click()
    await expect.poll(() => run.read('写作/小论文计划.md')).toBe(before)
    // 网址（浏览器拖一个链接：uri-list + html 里的 <a>），放在「今天」中间：进收件箱、定今天
    await dropOn(page, '.center .mbody', { 'text/uri-list': 'https://example.com/paper', 'text/plain': 'https://example.com/paper', 'text/html': '<a href="https://example.com/paper">一篇要读的论文</a>' })
    await expect(page.locator('.toast')).toContainText('一篇要读的论文')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] [一篇要读的论文](https://example.com/paper) 📅 2026-11-22\n')
    // 拖一个文件（没有字）：不翻页，说一句
    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['x'], 'a.pdf', { type: 'application/pdf' }))
      const el = document.querySelector('.center .mbody')!
      el.dispatchEvent(new DragEvent('drop', { clientX: 600, clientY: 300, bubbles: true, cancelable: true, dataTransfer: dt }))
    })
    await expect(page.locator('.toast')).toContainText('拖进来的没有能加的字')
    await expect(page.locator('.win')).toBeVisible()
    // 拖进输入框的字照旧进输入框（不加待办）
    await page.locator('#qa').click()
    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.setData('text/plain', '不该加')
      document.querySelector('#qa')!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    })
    await page.waitForTimeout(300)
    expect(run.read('收件箱/待办.md')).not.toContain('不该加')
  } finally {
    await run.close()
  }
})
