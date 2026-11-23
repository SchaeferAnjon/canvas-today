/**
 * 设置 › 软件家族（task-59o3v，和画布笔记同一个页面）：第五页；没装 / 装了；「下载」「打开」只记下来；
 * 拨「用画布笔记打开」写进库里的联动.json，「打开笔记，到这一行」跟着换；「去库 ›」「去外观 ›」翻过去闪一下；
 * 画布笔记和画布今日同时开着同一个库：哪边拨了，另一边读到的是同一个值。
 */
import { _electron as electron, expect, type Page, test } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'
import { launch, row, type Running } from './app'

const dlg = (page: Page) => page.getByRole('dialog', { name: '设置' })
const nav = (page: Page) => dlg(page).getByRole('navigation', { name: '设置分页' })
const card = (page: Page, name: string) => dlg(page).getByRole('group', { name, exact: true })
const toast = (page: Page) => dlg(page).getByTestId('settings-toast')
const screenLog = (run: { app: Running['app'] }) => run.app.evaluate(() => (globalThis as unknown as { cnScreen: string[] }).cnScreen.slice())
const linksOf = (vault: string) => {
  const f = join(vault, '.canvas-notes/联动.json')
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Record<string, boolean>) : {}
}

let dir = ''
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ct-family-'))
})
test.afterEach(() => rmSync(dir, { recursive: true, force: true }))
const installedFile = () => join(dir, 'installed.json')
const install = (apps: Record<string, string>) => writeFileSync(installedFile(), JSON.stringify(apps))

async function openFamily(page: Page) {
  await page.locator('.ab[data-k="settings"]').click()
  await nav(page).getByRole('button', { name: '软件家族' }).click()
  await expect(dlg(page).getByRole('heading', { name: '软件家族' })).toBeVisible()
}

test('侧栏第五页「软件家族」：画布笔记一张表三行、MeetCaption 一张，其余七个收在下面；没装时开关写「装了以后能开」，点「下载」开官网、装好了再看一下就出开关', async () => {
  install({})
  const run = await launch({ env: { CT_FAMILY_INSTALLED_FILE: installedFile() } })
  const { page } = run
  try {
    await page.locator('.ab[data-k="settings"]').click()
    await expect(nav(page).getByRole('button')).toHaveText(['一般', '外观', '日历和提醒事项', '库', '软件家族'])
    await nav(page).getByRole('button', { name: '软件家族' }).click()
    await expect(dlg(page).locator('.sa-head')).toContainText('同一个人做的几个软件：装了的能互相接上，没装的先看看能做什么')
    expect(await dlg(page).locator('.fm-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-app')))).toEqual(['canvas-notes', 'meetcaption'])
    expect(await dlg(page).locator('.fm-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-app')))).toEqual(['pararead', 'bookmarkkeeper', 'chatcards', 'askfree', 'getnewword', 'typeright', 'dispatch'])
    const cn = card(page, '画布笔记')
    expect(await cn.locator('.fm-link').evaluateAll((els) => els.map((e) => e.getAttribute('data-row')))).toEqual(['same-vault', 'cn-open', 'cn-look'])
    await expect(cn.locator('[data-row="same-vault"] .sa-ds')).toHaveText('画布今日自己就能用这个库；装了画布笔记能在同一个库里写笔记')
    await expect(cn.locator('[data-row="cn-open"] .fm-val')).toHaveText('装了以后能开')
    await expect(cn.locator('[data-row="cn-look"]').getByRole('button', { name: '去外观' })).toBeVisible()

    await cn.getByRole('button', { name: '下载' }).click()
    await expect.poll(() => screenLog(run)).toContain('用浏览器打开 https://canvas-note.us-cloud.uk')
    await expect(cn.locator('.fm-wait')).toContainText('等你装好')
    install({ 'canvas-notes': '0.5.1' })
    await cn.getByRole('button', { name: '装好了，再看一下' }).click()
    await expect(toast(page)).toContainText('认出来了：画布笔记 0.5.1已装，联动的开关能开了')
    await expect(cn.getByRole('switch', { name: '「打开笔记，到这一行」用画布笔记打开' })).toHaveAttribute('aria-checked', 'true')
    await expect(cn.locator('[data-row="same-vault"] .sa-ds')).toHaveText('画布笔记也在用「测试库」：清单里每一条就是那边笔记里的一行')
    // 装了以后「用同一个库」那一行能去库
    await cn.locator('[data-row="same-vault"]').getByRole('button', { name: '去库' }).click()
    await expect(nav(page).getByRole('button', { name: '库' })).toHaveAttribute('aria-current', 'page')
    await expect(dlg(page).locator('[data-row="vault"]')).toHaveClass(/sa-flash/)
    await nav(page).getByRole('button', { name: '软件家族' }).click()
    await card(page, '画布笔记').getByRole('button', { name: '去外观' }).click()
    await expect(dlg(page).locator('[data-row="followNotes"]')).toHaveClass(/sa-flash/)
  } finally {
    await run.close()
  }
})

test('装了画布笔记：「打开」打开它（只记下来）；关掉「用画布笔记打开」写进库里的联动.json，「打开笔记，到这一行」改用系统默认的软件；撤回回来', async () => {
  install({ 'canvas-notes': '0.5.1' })
  const run = await launch({ env: { CT_FAMILY_INSTALLED_FILE: installedFile() } })
  const { page } = run
  try {
    await openFamily(page)
    const cn = card(page, '画布笔记')
    await cn.getByRole('button', { name: '打开' }).click()
    await expect.poll(() => screenLog(run)).toContain('打开 /Applications/canvas-notes.app')
    await expect(toast(page)).toContainText('打开了画布笔记')
    const sw = cn.getByRole('switch', { name: '「打开笔记，到这一行」用画布笔记打开' })
    await sw.click()
    await expect(toast(page)).toContainText('已存 · 「打开笔记，到这一行」改用系统默认的软件')
    await expect.poll(() => linksOf(run.vault)).toEqual({ 'cn-open': false })
    await page.keyboard.press('Escape')

    await row(page, '交论文初稿').click()
    await page.locator('[data-part="详情"]').getByRole('button', { name: '打开笔记，到这一行' }).click()
    await expect(page.locator('.toast')).toContainText('用系统默认的软件打开了《小论文计划》')
    await expect.poll(async () => (await screenLog(run)).at(-1)).toBe(`打开 ${join(run.vault, '写作/小论文计划.md')}`)

    // 撤回：开回来，又交给画布笔记
    await openFamily(page)
    await card(page, '画布笔记').getByRole('switch', { name: '「打开笔记，到这一行」用画布笔记打开' }).click()
    await expect.poll(() => linksOf(run.vault)).toEqual({ 'cn-open': true })
    await card(page, '画布笔记').getByRole('switch', { name: '「打开笔记，到这一行」用画布笔记打开' }).click()
    await expect.poll(() => linksOf(run.vault)).toEqual({ 'cn-open': false })
    await toast(page).getByRole('button', { name: '撤回' }).click()
    await expect.poll(() => linksOf(run.vault)).toEqual({ 'cn-open': true })
    await page.keyboard.press('Escape')
    await row(page, '交论文初稿').click()
    await page.locator('[data-part="详情"]').getByRole('button', { name: '打开笔记，到这一行' }).click()
    await expect.poll(async () => (await screenLog(run)).at(-1)).toBe('用浏览器打开 canvas-notes://open?file=%E5%86%99%E4%BD%9C%2F%E5%B0%8F%E8%AE%BA%E6%96%87%E8%AE%A1%E5%88%92.md&line=11')
  } finally {
    await run.close()
  }
})

test('画布笔记和画布今日同时开着同一个库：画布笔记里拨了，画布今日一两秒内读到同一个值；画布今日拨了，画布笔记的家族页跟着变', async () => {
  install({ 'canvas-notes': '0.5.1', 'canvas-today': '0.3.1' })
  const run = await launch({ env: { CT_FAMILY_INSTALLED_FILE: installedFile() } })
  const notesData = join(dir, 'notes-user-data')
  mkdirSync(notesData)
  const notesMain = join(__dirname, '../../notes/out/main/index.js')
  if (!existsSync(notesMain)) throw new Error('先编好画布笔记（apps/notes 下 electron-vite build）')
  const notes = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [notesMain],
    env: { ...process.env, CN_E2E: '1', CN_VAULT: run.vault, CN_USER_DATA: notesData, CN_NO_AX: '1', CN_QUICK_KEY: 'Alt+Command+Shift+F18', CN_TRASH_DIR: join(dir, 'trash'), CN_ICLOUD_CONTAINER: join(dir, 'icloud'), CN_FAMILY_INSTALLED_FILE: installedFile() },
  })
  try {
    const np = await notes.firstWindow()
    await expect(np.locator('.vault b')).toHaveText('测试库')
    await np.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))))
    // 画布笔记：设置 › 软件家族，关掉「待办旁边放『在画布今日里打开』」
    await np.keyboard.press('Meta+Comma')
    await dlg(np).getByRole('navigation', { name: '设置分页' }).getByRole('button', { name: '软件家族', exact: true }).click()
    await card(np, '画布今日').getByRole('switch', { name: '待办旁边放「在画布今日里打开」' }).click()
    await expect.poll(() => linksOf(run.vault)).toEqual({ 'ct-open': false })
    // 画布今日读到同一个值（它自己的主进程读库里那份）
    await expect.poll(() => run.page.evaluate(async () => (await window.cnFamily.get()).links)).toEqual({ 'ct-open': false })

    // 画布今日：关掉「用画布笔记打开」；画布笔记读到同一个值，开着的家族页那个开关也还是关的（文件里两样都在）
    await openFamily(run.page)
    await card(run.page, '画布笔记').getByRole('switch', { name: '「打开笔记，到这一行」用画布笔记打开' }).click()
    await expect.poll(() => linksOf(run.vault)).toEqual({ 'cn-open': false, 'ct-open': false })
    await expect.poll(() => np.evaluate(async () => (await window.cnFamily.get()).links)).toEqual({ 'cn-open': false, 'ct-open': false })
    await expect(card(np, '画布今日').getByRole('switch', { name: '待办旁边放「在画布今日里打开」' })).toHaveAttribute('aria-checked', 'false')
    // 画布笔记那边再拨回来：画布今日开着的页面没有这一行，但它读到的跟着变
    await card(np, '画布今日').getByRole('switch', { name: '待办旁边放「在画布今日里打开」' }).click()
    await expect.poll(() => run.page.evaluate(async () => (await window.cnFamily.get()).links)).toEqual({ 'cn-open': false, 'ct-open': true })
    expect(readFileSync(join(run.vault, '.canvas-notes/联动.json'), 'utf8')).toBe('{\n  "cn-open": false,\n  "ct-open": true\n}\n')
  } finally {
    await notes.close()
    await run.close()
  }
})
