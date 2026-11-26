/**
 * 一批 bug（bug 一批 1125b，对标清单 B1–B9）：每条真点、真按一遍。
 * 1 输入框右键给标准编辑菜单（⌘K 框、「加一条」框、AI 输入框）；2 答着时点「+」那一问照样答完；3 回答按 Markdown 画；
 * 4 ⌘K 搜得到清单；5 浮岛书桌有背景时设置弹窗是半透明玻璃；6 设置 › AI 两行都列；7「显示」菜单（放大、缩小、原大、全屏）；
 * 8 出错记进 main.log、「帮助 › 打开日志文件夹」；9 提示条鼠标停在上面不收、移开再计时。
 */
import { expect, type Page, test } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { launch, LOOK, type Running } from './app'
import { armMenus, openedMenu } from './menu'

const panel = (page: Page) => page.locator('[data-part="AI 对话"]')
const dlg = (page: Page) => page.getByRole('dialog', { name: '设置' })
async function openAi(page: Page) {
  await page.locator('.abar.r .ab[data-k="ai"]').click()
  await expect(panel(page)).toBeVisible()
}
async function say(page: Page, text: string) {
  const ta = panel(page).locator('.aim-in textarea')
  await ta.fill(text)
  await ta.press('Enter')
}
/** 菜单里的字（分隔线、灰的都算），读完收起 */
async function menuLabels(run: Running) {
  const m = await openedMenu(run)
  await run.app.evaluate(() => {
    const g = globalThis as unknown as { ctMenu: { cb?: () => void } | null }
    const open = g.ctMenu
    g.ctMenu = null
    open?.cb?.()
  })
  return m.map((x) => x.label)
}
const EDIT_ZH = ['撤销', '重做', '—', '剪切', '拷贝', '粘贴', '—', '全选']

test('1 输入框右键：⌘K 框、「加一条」框、AI 输入框都弹标准编辑菜单；英文界面是英文', async () => {
  const run = await launch()
  const { page } = run
  try {
    await armMenus(run)
    // ⌘K 框
    await page.keyboard.press('Meta+k')
    await page.locator('.pal input').fill('交论文')
    await page.locator('.pal input').click({ button: 'right' })
    expect(await menuLabels(run)).toEqual(EDIT_ZH)
    await page.keyboard.press('Escape')
    // 「加一条」框
    await page.locator('#qa').click({ button: 'right' })
    expect(await menuLabels(run)).toEqual(EDIT_ZH)
    // AI 输入框
    await openAi(page)
    await panel(page).locator('.aim-in textarea').fill('hello')
    await panel(page).locator('.aim-in textarea').click({ button: 'right' })
    expect(await menuLabels(run)).toEqual(EDIT_ZH)
    // 英文界面
    await page.evaluate(() => window.ct.setSettings({ lang: 'en' }))
    await expect(page.locator('#qa')).toHaveAttribute('placeholder', /Add/)
    await page.locator('#qa').click({ button: 'right' })
    expect(await menuLabels(run)).toEqual(['Undo', 'Redo', '—', 'Cut', 'Copy', 'Paste', '—', 'Select All'])
  } finally {
    await run.close()
  }
})

test('2 答着时点「+」开新对话：原来那一问不掐，切回去接着答完；新对话里同时再问一句也答', async () => {
  const run = await launch({ env: { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '2500' } })
  const { page } = run
  try {
    await openAi(page)
    const p = panel(page)
    await say(page, '把收件箱里的按优先级排好')
    await expect(p.locator('.thinking')).toBeVisible()
    await p.getByRole('button', { name: '新对话' }).click()
    // 新的一段是空的，没有「正在想」
    await expect(p.locator('.aim-empty')).toBeVisible()
    await expect(p.locator('.thinking')).toHaveCount(0)
    await expect(p.locator('.aim-h .ttl')).toHaveText('新对话')
    // 新对话里再问一句：两段同时答
    await say(page, '你好')
    await expect(p.locator('.thinking')).toBeVisible()
    await expect(p.locator('.aim-a .txt').last()).toContainText('我看了你这两周的', { timeout: 15_000 })
    // 切回去：那一问答完了（改动卡在）
    await p.locator('.aim-h .ttl').click()
    await p.locator('.aim-h .aim-menu .it', { hasText: '把收件箱里的按优先级排好' }).click()
    await expect(p.locator('.aim-u')).toHaveText('把收件箱里的按优先级排好')
    await expect(p.locator('.aim-a .txt')).toContainText('导师在等回信', { timeout: 15_000 })
    await expect(p.locator('[data-part="改动卡"]')).toBeVisible()
  } finally {
    await run.close()
  }
})

test('2b 答着时切到别的对话再切回来：还在想（「正在想」照样在），答完接着出', async () => {
  const run = await launch({ env: { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '400' } })
  const { page } = run
  try {
    await openAi(page)
    const p = panel(page)
    await say(page, '你好')
    await expect(p.locator('.aim-a .txt')).toContainText('我看了你这两周的')
    await run.app.evaluate(() => (process.env.CT_AI_FAKE_MS = '3000'))
    await p.getByRole('button', { name: '新对话' }).click()
    await say(page, '把收件箱里的按优先级排好')
    await expect(p.locator('.thinking')).toBeVisible()
    await p.locator('.aim-h .ttl').click()
    await p.locator('.aim-h .aim-menu .it', { hasText: '你好' }).click()
    await expect(p.locator('.aim-u')).toHaveText('你好')
    await expect(p.locator('.thinking')).toHaveCount(0)
    await p.locator('.aim-h .ttl').click()
    await p.locator('.aim-h .aim-menu .it', { hasText: '把收件箱里的按优先级排好' }).click()
    await expect(p.locator('.thinking')).toBeVisible()
    await expect(p.locator('.aim-a .txt')).toContainText('导师在等回信', { timeout: 15_000 })
    await expect(p.locator('.thinking')).toHaveCount(0)
  } finally {
    await run.close()
  }
})

test('3 AI 回答按 Markdown 画：粗体、列表、行内代码不露 ** - `', async () => {
  const run = await launch({ env: { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '300' } })
  const { page } = run
  try {
    await openAi(page)
    const p = panel(page)
    await say(page, '（测试：Markdown）')
    const a = p.locator('.aim-a').last()
    await expect(a.locator('.md')).toBeVisible()
    await expect(a.locator('.md strong, .md b').first()).toHaveText('先做')
    await expect(a.locator('.md li')).toHaveText(['交论文初稿', '补实验图'])
    await expect(a.locator('.md code').first()).toHaveText('📅 2026-11-23')
    expect(await a.locator('.md').innerText()).not.toMatch(/\*\*|^- /m)
    // 段落和列表之间隔 8（不挤成一块）
    const gap = await a.locator('.md').evaluate((el) => el.querySelector('ul')!.getBoundingClientRect().top - el.querySelector('p')!.getBoundingClientRect().bottom)
    expect(gap).toBeGreaterThanOrEqual(7.5)
  } finally {
    await run.close()
  }
})

test('4 ⌘K 搜得到清单：打「小论文」有「小论文计划」，点了打开那一篇', async () => {
  const run = await launch()
  const { page } = run
  try {
    await page.keyboard.press('Meta+k')
    await page.locator('.pal input').fill('小论文')
    const hit = page.locator('.pal .pr', { hasText: '小论文计划' }).filter({ hasNotText: '加一条' }).filter({ hasNotText: '问AI' })
    await expect(hit.first()).toBeVisible()
    await expect(page.locator('.pal .pg', { hasText: '清单' })).toBeVisible()
    // 组和组之间画横线（组名不是第一行时）
    expect(await page.locator('.pal .pg', { hasText: '清单' }).evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px')
    await page.locator('.pal .pg', { hasText: '清单' }).locator('xpath=following-sibling::button[1]').click()
    await expect(page.locator('.pal')).toHaveCount(0)
    await expect(page.locator('.nav.on')).toHaveAttribute('data-k', 'list:写作/小论文计划.md')
    await expect(page.locator('.center')).toContainText('交论文初稿')
  } finally {
    await run.close()
  }
})

test('5 浮岛书桌有背景图时设置弹窗是半透明玻璃（同画布笔记），纯色时照旧实底', async () => {
  const run = await launch({ settings: { ...LOOK('sky', 'b') } })
  const { page } = run
  try {
    const bg = () => page.locator('.set').evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, blur: getComputedStyle(el).backdropFilter }))
    const alpha = (c: string) => {
      const m = /rgba?\(([^)]+)\)/.exec(c) ?? /color\(srgb ([^)]+)\)/.exec(c)
      const parts = m![1]!.split(/[ ,/]+/).filter(Boolean)
      return parts.length > 3 ? Number(parts[3]) : 1
    }
    await expect(page.locator('html')).toHaveAttribute('data-glass', '')
    await page.locator('.ab[data-k="settings"]').click()
    await expect(dlg(page)).toBeVisible()
    const g = await bg()
    expect(alpha(g.bg)).toBeLessThan(1)
    expect(g.blur).toContain('blur')
    await page.keyboard.press('Escape')
    await page.evaluate(() => window.ct.setSettings({ appearance: { followSystem: false, skin: 'sky', day: 'sky', night: 'petrol', frame: 'b', winBg: 'none' } } as never))
    await expect(page.locator('html')).not.toHaveAttribute('data-glass', '')
    await page.locator('.ab[data-k="settings"]').click()
    expect(alpha((await bg()).bg)).toBe(1)
  } finally {
    await run.close()
  }
})

test('6 设置 › AI：「AI 对话」「小活」两行都列，各写画布笔记设置里那一行现在是什么', async () => {
  const run = await launch({
    prepare: (vault) => {
      const ai = join(dirname(vault), 'notes-data', 'ai')
      mkdirSync(ai, { recursive: true })
      writeFileSync(join(ai, 'settings.json'), JSON.stringify({ prefs: { default: { engine: 'claude', model: 'opus', effort: 'high' }, features: { quick: { engine: 'claude', model: 'haiku' } } } }))
    },
  })
  const { page } = run
  try {
    const chat = await page.evaluate(() => window.ct.chatDefault())
    const quick = await page.evaluate(() => window.ct.aiInfo())
    expect(chat.full).not.toBe(quick.full)
    await page.locator('.ab[data-k="settings"]').click()
    await dlg(page).getByRole('navigation', { name: '设置分页' }).getByRole('button', { name: 'AI', exact: true }).click()
    await expect(dlg(page).locator('[data-row="aiChat"]')).toContainText('「AI对话」')
    await expect(dlg(page).locator('[data-row="aiChat"]')).toContainText(chat.full)
    await expect(dlg(page).locator('[data-row="aiFollow"]')).toContainText('「小活」')
    await expect(dlg(page).locator('[data-row="aiFollow"]')).toContainText(quick.full)
  } finally {
    await run.close()
  }
})

test('7 「显示」菜单：放大、缩小、原大、全屏；点放大真放大、点原大回来', async () => {
  const run = await launch()
  const { page, app } = run
  try {
    const items = await app.evaluate(({ Menu }) => {
      const view = Menu.getApplicationMenu()!.items.find((i) => i.label === '显示')
      return view?.submenu?.items.map((i) => ({ label: i.label, role: i.role ?? '', accel: i.accelerator ?? '' })) ?? null
    })
    expect(items?.filter((i) => i.label !== '').map((i) => i.role)).toEqual(['zoomin', 'zoomout', 'resetzoom', 'togglefullscreen'])
    const click = (role: string) =>
      app.evaluate(({ Menu, BrowserWindow }, role) => {
        const view = Menu.getApplicationMenu()!.items.find((i) => i.label === '显示')!
        const it = view.submenu!.items.find((i) => i.role === role)!
        const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('index.html'))!
        ;(it.click as unknown as (e: unknown, w: unknown, wc: unknown) => void)({}, w, w.webContents)
      }, role)
    const zoom = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('index.html'))!.webContents.getZoomLevel())
    const z0 = await zoom()
    await click('zoomin')
    await expect.poll(zoom).toBeGreaterThan(z0)
    await click('resetzoom')
    await expect.poll(zoom).toBe(z0)
    await click('zoomout')
    await expect.poll(zoom).toBeLessThan(z0)
    await click('resetzoom')
  } finally {
    await run.close()
  }
})

test('8 出错记进 main.log（界面没接住的错、界面进程没了）；「帮助 › 打开日志文件夹」打开那个文件夹', async () => {
  const run = await launch()
  const { page, app, userData } = run
  try {
    const logs = join(userData, 'logs')
    const log = () => {
      try {
        return readFileSync(join(logs, 'main.log'), 'utf8')
      } catch {
        return ''
      }
    }
    await page.evaluate(() => setTimeout(() => {
      throw new Error('测试：界面没接住的错')
    }))
    await page.evaluate(() => void Promise.reject(new Error('测试：没人接的 Promise')))
    await expect.poll(log).toContain('测试：界面没接住的错')
    await expect.poll(log).toContain('测试：没人接的 Promise')
    // 帮助 › 打开日志文件夹（测试模式下 shell.openPath 是记录器）
    await app.evaluate(({ Menu }) => {
      const help = Menu.getApplicationMenu()!.items.find((i) => i.label === '帮助')!
      help.submenu!.items.find((i) => i.label === '打开日志文件夹')!.click()
    })
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { cnScreen: string[] }).cnScreen.join('\n'))).toContain(`打开 ${logs}`)
    // 界面进程没了也记一行
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('index.html'))!.webContents.forcefullyCrashRenderer())
    await expect.poll(log).toContain('[render-process-gone]')
  } finally {
    await run.close()
  }
})

test('9 提示条：鼠标停在上面不收，移开再计时 5 秒多收起', async () => {
  test.setTimeout(60_000)
  const run = await launch()
  const { page } = run
  try {
    await page.locator('#qa').click()
    await page.keyboard.type('买牛奶')
    await page.keyboard.press('Enter')
    const toast = page.locator('.toast')
    await expect(toast).toContainText('加上了「买牛奶」')
    await toast.hover()
    await page.waitForTimeout(7000)
    await expect(toast).toBeVisible()
    await page.mouse.move(5, 400)
    await page.waitForTimeout(3000)
    await expect(toast).toBeVisible()
    await expect(toast).toHaveCount(0, { timeout: 5000 })
  } finally {
    await run.close()
  }
})
