/**
 * 检查更新的界面（真的下载、安装在打好的包上测，见 docs/DEVELOPMENT.md「画布今日 › 发版」）：
 * 开发版和测试不查更新：设置 › 版本和更新写「开发版，不自动更新」、没有「现在查一次」，软件菜单里「检查更新…」是灰的；
 * 主进程推来「下好了」时底栏最右端出「● 重启更新到 x」、设置里那一行能点「重启更新」「看看改了什么」；推来装不上的错时底栏出「● 更新没装上」，点开是设置、写着原因和「再查一次」。
 */
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UpdateState } from '../src/shared/api'
import { launch, type Running } from './app'

/** 装着的这一版（package.json 的 version；发版时改它，测试不跟着改） */
const V = (JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as { version: string }).version

const push = (run: Running, st: Partial<UpdateState>) =>
  run.app.evaluate(({ BrowserWindow }, st) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('ct:update', { phase: 'idle', current: '0.1.0', version: '', percent: 0, error: '', checkedAt: 0, inApps: true, ...st })
  }, st)

test('开发版不查更新；下好了底栏出「重启更新到 x」，装不上时出「更新没装上」；自动检查的开关记在设置文件里', async () => {
  const run = await launch()
  const { page, app } = run
  try {
    const menu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items[0]!.submenu!.items.map((i) => ({ label: i.label, enabled: i.enabled })))
    expect(menu.find((i) => i.label === '检查更新…')).toEqual({ label: '检查更新…', enabled: false })
    expect(menu.some((i) => i.label === '设置…')).toBe(true)

    await page.keyboard.press('Meta+,')
    const s = page.getByRole('dialog', { name: '设置' })
    await expect(s.getByTestId('update-line')).toHaveText(`版本${V} · 开发版，不自动更新`)
    await expect(s.getByRole('button', { name: '现在查一次' })).toHaveCount(0)
    await expect(page.getByTestId('update-bar')).toHaveCount(0)
    const auto = s.getByRole('switch', { name: '自动检查更新' })
    await expect(auto).toHaveAttribute('aria-checked', 'true')
    await auto.click()
    await expect(auto).toHaveAttribute('aria-checked', 'false')
    await expect.poll(() => JSON.parse(readFileSync(join(run.userData, 'settings.json'), 'utf8')).autoUpdate).toBe(false)

    // 正在下载：进度条和百分比，没有能点的
    await push(run, { phase: 'downloading', version: '0.1.1', percent: 40 })
    await expect(s.getByTestId('update-line')).toHaveText(`版本${V} · 正在下载新版本0.1.1 · 40%`)
    await expect(s.locator('.ubar > i')).toHaveAttribute('style', /width: 40%/)
    await expect(s.getByTestId('update-line').getByRole('button')).toHaveCount(0)

    // 下好了：设置里那一行「重启更新」、「看看改了什么」打开发布页；底栏最右端「重启更新到 0.1.1」
    await push(run, { phase: 'ready', version: '0.1.1', percent: 100 })
    await expect(s.getByTestId('update-line')).toHaveText(`版本${V} · 新版本0.1.1已下好 · 重启更新 · 看看改了什么`)
    await expect(s.getByRole('button', { name: '重启更新' })).toBeVisible()
    await s.getByRole('button', { name: '看看改了什么' }).click()
    await expect
      .poll(() => app.evaluate(() => (globalThis as unknown as { cnScreen: string[] }).cnScreen))
      .toContain(`用浏览器打开 https://github.com/SchaeferAnjon/canvas-today/releases/tag/v${V}`)
    await page.keyboard.press('Escape')
    const bar = page.getByTestId('update-bar')
    await expect(bar).toHaveText('重启更新到0.1.1')
    await expect(bar).toHaveAttribute('title', /下次退出时自动装上/)
    // 开发版里主进程的更新是 off：点了不重启，按钮回来
    await bar.click()
    await expect(bar).toBeEnabled()
    await expect(page.locator('.win')).toBeVisible()

    // 装不上（签名对不上）：底栏「更新没装上」，点开是设置，状态行写原因
    await push(run, { phase: 'error', version: '0.1.1', error: 'code failed to satisfy specified code requirement(s)' })
    await expect(bar).toHaveText('更新没装上')
    await bar.click()
    await expect(s.getByTestId('update-line')).toHaveText(`版本${V} · 没装上：新版本的签名和装着的这一版对不上，没有装；去GitHub发布页重新下载安装一次就好 · 再查一次`)
    await expect(s.getByRole('button', { name: '再查一次' })).toBeVisible()
    // 查过、是最新的：「现在查一次」
    await push(run, { phase: 'latest', checkedAt: Date.now() })
    await expect(s.getByTestId('update-line')).toContainText('已是最新')
    await expect(s.getByRole('button', { name: '现在查一次' })).toBeVisible()

    // 英文
    await s.getByRole('radio', { name: 'English' }).click()
    await push(run, { phase: 'ready', version: '0.1.1', percent: 100 })
    await page.keyboard.press('Escape')
    await expect(bar).toHaveText('Restart to update to 0.1.1')
    const en = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items[0]!.submenu!.items.map((i) => i.label))
    expect(en).toContain('Check for Updates…')

    // 没网之类查不成的错：底栏不出东西
    await push(run, { phase: 'error', error: 'net::ERR_INTERNET_DISCONNECTED' })
    await expect(bar).toHaveCount(0)
  } finally {
    await run.close()
  }
})
