/**
 * 外观整页和画布笔记是同一份（@cn/design/settings AppearancePage，task-wxr2a）：导入 VS Code 主题、导入的那一排、删掉；
 * 主题文件和画布笔记存在同一个文件夹（画布笔记设置目录 themes/），「和画布笔记一样」开着时画布笔记用着导入的那套也跟着用；
 * 画布今日没有的（首页样式、从电脑选窗口背景）不出现。
 */
import { expect, type Page, test } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, LOOK } from './app'

const FIX = join(__dirname, '../../notes/test/fixtures/vscode-themes')
const dlg = (page: Page) => page.getByRole('dialog', { name: '设置' })
const winVar = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--win').trim())

async function openLook(page: Page) {
  await page.locator('.ab[data-k="settings"]').click()
  await dlg(page).getByRole('navigation', { name: '设置分页' }).getByRole('button', { name: '外观' }).click()
  await expect(dlg(page).getByRole('heading', { name: '外观' })).toBeVisible()
}

test('导入 VS Code 主题：存进画布笔记的 themes/、马上用上、多一排「导入的」；跟着系统时进夜里用的下拉；删掉回到默认', async () => {
  const run = await launch({ settings: { ...LOOK('sky', 'b'), followNotes: false } })
  const { app, page, root } = run
  try {
    const src = join(root, 'downloads')
    mkdirSync(src)
    copyFileSync(join(FIX, 'monokai-color-theme.json'), join(src, 'monokai-color-theme.json'))
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog
    }, join(src, 'monokai-color-theme.json'))
    await openLook(page)
    const s = dlg(page)
    // 画布今日没有首页、窗口背景不能从电脑选：这两样不出，也不空着
    await expect(s.getByRole('heading', { name: /首页样式/ })).toHaveCount(0)
    await expect(s.getByRole('radio', { name: '从电脑选' })).toHaveCount(0)
    await expect(s.getByRole('radiogroup', { name: '窗口背景' }).getByRole('radio')).toHaveText(['不用图', '极光照片', '冰洞照片'])
    await expect(s.getByText('导入的VS Code主题')).toHaveCount(0)

    // 样子同画布笔记：导入按钮 30 高圆头、跟着系统那一行一块浅底
    const btn = s.getByRole('button', { name: '导入VS Code主题…' })
    expect(await btn.evaluate((b) => [getComputedStyle(b).height, getComputedStyle(b).borderRadius])).toEqual(['30px', '999px'])
    expect(await s.locator('[data-row="follow"]').evaluate((e) => [getComputedStyle(e).padding, getComputedStyle(e).borderRadius])).toEqual(['10px 12px', '12px'])

    await btn.click()
    await expect(s.getByTestId('settings-toast')).toHaveText('导入了「Monokai」，已经用上')
    await expect(s.getByText('导入的VS Code主题')).toBeVisible()
    const card = s.locator('[data-skin-card="vsc-monokai"]')
    await expect(card).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'vsc-monokai')
    await expect(page.locator('html')).toHaveAttribute('data-tone', 'dark')
    await expect.poll(() => winVar(page)).toBe('#272822')
    // 存在画布笔记的设置目录 themes/（两个软件一份），不进库
    expect(readdirSync(join(root, 'notes-data', 'themes'))).toEqual(['vsc-monokai.json'])
    expect(existsSync(join(root, 'user-data', 'themes'))).toBe(false)
    await expect(card).toHaveAttribute('aria-description', '导入的VS Code主题 · monokai-color-theme.json')

    // 跟着系统换浅深：右边多白天用、夜里用两个下拉，夜里用里有 Monokai
    await s.getByRole('switch', { name: '跟着系统换浅深' }).click()
    await expect(s.getByLabel('夜里用').locator('option')).toHaveText(['松林', '深湖', '可可', '墨夜', '石墨', 'Monokai'])
    await s.getByLabel('夜里用').selectOption({ label: 'Monokai' })
    await expect(s.getByTestId('settings-toast')).toContainText('「夜里用」改成「Monokai」')
    await s.getByRole('switch', { name: '跟着系统换浅深' }).click()

    // 删掉：卡片上的垃圾桶
    await card.hover()
    await s.getByRole('button', { name: '删掉 Monokai' }).click()
    await expect(s.getByTestId('settings-toast')).toHaveText('删掉了「Monokai」')
    await expect(s.locator('[data-skin-card="vsc-monokai"]')).toHaveCount(0)
    await expect(s.getByText('导入的VS Code主题')).toHaveCount(0)
    expect(readdirSync(join(root, 'notes-data', 'themes'))).toEqual([])
    await expect(page.locator('html')).not.toHaveAttribute('data-skin', 'vsc-monokai')
  } finally {
    await run.close()
  }
})

test('画布笔记那边导入的主题画布今日也有；「和画布笔记一样」开着、画布笔记用着导入的那套时跟着用', async () => {
  const run = await launch({ settings: { ...LOOK('sky', 'b'), followNotes: false } })
  const { page, root } = run
  try {
    await openLook(page)
    const s = dlg(page)
    // 画布笔记导入 Solarized：themes/ 里多一个文件（照画布笔记 ThemeStore 的样子），画布今日的外观页马上多一排
    const themes = join(root, 'notes-data', 'themes')
    mkdirSync(themes, { recursive: true })
    const vars = { win: '#002b36', bg: '#002b36', t1: '#93a1a1' }
    writeFileSync(join(themes, 'vsc-solarized-dark.json'), JSON.stringify({ id: 'vsc-solarized-dark', name: 'Solarized Dark', tone: 'dark', tab: 'bottom', vars, source: 'solarized-dark.json' }))
    await expect(s.locator('[data-skin-card="vsc-solarized-dark"]')).toBeVisible({ timeout: 5000 })
    // 画布笔记用上它，画布今日开「和画布笔记一样」：跟着用
    writeFileSync(join(root, 'notes-data', 'settings.json'), JSON.stringify({ appearance: { followSystem: false, skin: 'vsc-solarized-dark', frame: 'a', winBg: 'none' } }))
    await s.getByRole('switch', { name: '和画布笔记一样' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'vsc-solarized-dark')
    await expect(page.locator('html')).toHaveAttribute('data-tone', 'dark')
    await expect.poll(() => winVar(page)).toBe('#002b36')
    await expect(s.locator('[data-row="followNotes"]')).toContainText('现在：Solarized Dark · A 照 VS Code')
    // 跟着画布笔记时，主题这些都不出（跟着画布笔记的设置）
    await expect(s.getByRole('button', { name: '导入VS Code主题…' })).toHaveCount(0)
  } finally {
    await run.close()
  }
})

test('英文界面：导入按钮、说明、导入的一排都是英文', async () => {
  const run = await launch({ settings: { ...LOOK('sky', 'b', 'en'), followNotes: false } })
  const { app, page, root } = run
  try {
    const src = join(root, 'downloads')
    mkdirSync(src)
    copyFileSync(join(FIX, 'monokai-color-theme.json'), join(src, 'monokai-color-theme.json'))
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog
    }, join(src, 'monokai-color-theme.json'))
    await page.locator('.ab[data-k="settings"]').click()
    const s = page.getByRole('dialog', { name: 'Settings' })
    await s.getByRole('navigation', { name: 'Settings pages' }).getByRole('button', { name: 'Appearance' }).click()
    await expect(s.getByText('Pick a .json or .vsix; missing colors are derived from background and text')).toBeVisible()
    await s.getByRole('button', { name: 'Import VS Code theme…' }).click()
    await expect(s.getByTestId('settings-toast')).toHaveText('Imported “Monokai” and switched to it')
    await expect(s.getByText('Imported VS Code themes')).toBeVisible()
    await expect(s.locator('[data-skin-card="sky"]')).toHaveAttribute('aria-description', 'Cyan status bar; cards are outlined only')
  } finally {
    await run.close()
  }
})
