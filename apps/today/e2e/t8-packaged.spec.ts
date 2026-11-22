/**
 * 打好的 Canvas Today.app 在测试模式下起得来、能用（窗口不上屏）：开临时库、快速加一条、勾掉，文件里那一行跟着变、提交进库的 Git；
 * 版本号、Bundle ID、链接登记、图标都在包里，签名校验过得去。没打包时跳过。
 *   默认测 pnpm --filter @cn/today dist:mac 打的本机包（release/mac-arm64/）；
 *   CT_APP=<某个 .app> 测别的，比如发版脚本打的 release/<版本>/mac/mac-arm64/Canvas Today.app（发布包还要带着 app-update.yml）
 */
import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { LOOK } from './app'
import { NOW, PROTO } from './fixtures'

const BUNDLE = process.env.CT_APP ?? join(__dirname, '../release/mac-arm64/Canvas Today.app')
const APP = join(BUNDLE, 'Contents/MacOS/Canvas Today')
const VERSION = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')).version as string

test('打好的 Canvas Today.app：测试模式起得来，快速加、勾掉改的是文件里那一行，版本、名字、链接登记、图标、签名都对', async () => {
  test.skip(!existsSync(APP), '还没打包')
  const plist = readFileSync(join(BUNDLE, 'Contents/Info.plist'), 'utf8')
  expect(plist).toContain('<string>com.jiazonghan.canvastoday</string>')
  expect(plist).toContain('<string>canvas-today</string>')
  expect(plist).toContain('<string>Canvas Today</string>')
  expect(plist).toMatch(new RegExp(`<key>CFBundleShortVersionString</key>\\s*<string>${VERSION.replace(/\./g, '\\.')}</string>`))
  expect(existsSync(join(BUNDLE, 'Contents/Resources/icon.icns'))).toBe(true)
  if (process.env.CT_APP) expect(readFileSync(join(BUNDLE, 'Contents/Resources/app-update.yml'), 'utf8')).toContain('repo: canvas-today')
  execFileSync('codesign', ['--verify', '--deep', '--strict', BUNDLE])
  // 提醒事项小助手在包里（和主程序一起签名）、两种架构都有；系统问权限时的说明中文、英文都有
  const helper = join(BUNDLE, 'Contents/MacOS/canvas-today-reminders')
  expect(existsSync(helper)).toBe(true)
  expect(execFileSync('lipo', ['-archs', helper], { encoding: 'utf8' }).trim().split(/\s+/).sort()).toEqual(['arm64', 'x86_64'])
  execFileSync('codesign', ['--verify', '--strict', helper])
  for (const k of ['NSRemindersFullAccessUsageDescription', 'NSRemindersUsageDescription', 'NSCalendarsFullAccessUsageDescription', 'NSCalendarsUsageDescription']) expect(plist).toContain(`<key>${k}</key>`)
  expect(readFileSync(join(BUNDLE, 'Contents/Resources/zh_CN.lproj/InfoPlist.strings'), 'utf8')).toContain('画布今日把带提醒的待办放进提醒事项的「画布今日」列表')
  expect(readFileSync(join(BUNDLE, 'Contents/Resources/en.lproj/InfoPlist.strings'), 'utf8')).toContain('into the “Canvas Today” list in Reminders')

  const root = mkdtempSync(join(tmpdir(), 'ct-pkg-'))
  const vault = join(root, '测试库')
  execFileSync('git', ['init', '-q', '-b', 'main', vault])
  for (const [p, t] of Object.entries(PROTO)) {
    mkdirSync(dirname(join(vault, p)), { recursive: true })
    writeFileSync(join(vault, p), t)
  }
  execFileSync('git', ['-C', vault, '-c', 'user.name=Test', '-c', 'user.email=t@example.com', 'add', '-A'])
  execFileSync('git', ['-C', vault, '-c', 'user.name=Test', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', '样本'])
  mkdirSync(join(root, 'ud'))
  writeFileSync(join(root, 'ud', 'settings.json'), JSON.stringify(LOOK('sky', 'b')))
  const app = await electron.launch({
    executablePath: APP,
    // 提醒事项：用包里自己的小助手（不给 CT_REMINDERS_HELPER），带 --memory 的假提醒事项
    env: { ...process.env, CT_E2E: '1', CT_VAULT: vault, CT_USER_DATA: join(root, 'ud'), CT_NOTES_DATA: join(root, 'nd'), CT_NOW: NOW, CT_DEVICE: 'mac-test', CT_COMMIT_MS: '200', CT_REMINDERS_MEMORY: join(root, 'rem.json'), CT_REMINDERS_HELPER: '' },
  })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('.vhead h1')).toHaveText('今天')
    expect(await app.evaluate(({ app }) => [app.isPackaged, app.getName(), app.getVersion()])).toEqual([true, 'Canvas Today', VERSION])
    const inbox = () => readFileSync(join(vault, '收件箱/待办.md'), 'utf8')
    // 快速加：认出今天下午四点，写进收件箱那一篇的最后
    await page.locator('#qa').fill('下午四点 打电话给房东')
    await page.locator('#qa').press('Enter')
    await expect.poll(inbox).toContain('- [ ] 打电话给房东 📅 2026-11-22 16:00\n')
    // 勾掉：只是那一行多了 ✅，别的行一个字不动
    const before = inbox()
    await page.locator('.center .row', { hasText: '打电话给房东' }).locator('.cb').click()
    await expect.poll(inbox).toContain('- [x] 打电话给房东 📅 2026-11-22 16:00 ✅ 2026-11-22\n')
    expect(inbox()).toBe(before.replace('- [ ] 打电话给房东 📅 2026-11-22 16:00', '- [x] 打电话给房东 📅 2026-11-22 16:00 ✅ 2026-11-22'))
    await expect
      .poll(() => execFileSync('git', ['-C', vault, 'log', '--format=%s'], { encoding: 'utf8' }), { timeout: 15_000 })
      .toMatch(/画布今日：.*打电话给房东/)
    // 设置 › 关于 写着这一版的版本号
    await page.keyboard.press('Meta+,')
    await expect(page.getByTestId('update-line')).toContainText(`版本${VERSION}`)
    expect(await app.evaluate(() => Array.isArray((globalThis as unknown as { ctNotifs: unknown[] }).ctNotifs))).toBe(true)
    // 包里的提醒事项小助手开得起来：连接提醒事项，带 🔔 的两条（交论文初稿、订冰岛租车）镜像进假提醒事项的「画布今日」
    const rem = page.locator('[data-row="rem"]')
    await rem.getByRole('button', { name: '连接提醒事项' }).click()
    await expect(rem).toContainText('已连接iCloud', { timeout: 15_000 })
    const mem = () => JSON.parse(readFileSync(join(root, 'rem.json'), 'utf8')) as { lists: { title: string }[]; items: { title: string }[] }
    await expect.poll(() => mem().items.map((i) => i.title).sort(), { timeout: 15_000 }).toEqual(['交论文初稿', '订冰岛租车'])
    expect(mem().lists.map((l) => l.title)).toEqual(['画布今日'])
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})
