// 应用图标和菜单栏图标（照画布笔记 apps/notes/scripts/make-icons.mjs）：从 design/today/icon/ 生成
//   build/icon.png（1024，开发时的程序坞图标）、build/icon.icns（打包用）、
//   src/main/tray-icon.ts（菜单栏模板图 16 和 32，base64；SVG 用 Playwright 的无头 Chromium 画成 PNG）。
// 换图标改下面 PICK，再跑 `node scripts/make-icons.mjs`。要 macOS 自带的 sips 和 iconutil。
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PICK = '1-today'

const app = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(app, '../../design/today/icon')
const icon = join(src, `icon-${PICK}.png`)
const build = join(app, 'build')
mkdirSync(build, { recursive: true })
copyFileSync(icon, join(build, 'icon.png'))

const tmp = mkdtempSync(join(tmpdir(), 'ct-icon-'))
const set = join(tmp, 'icon.iconset')
mkdirSync(set)
for (const s of [16, 32, 128, 256, 512]) {
  execFileSync('sips', ['-z', String(s), String(s), icon, '--out', join(set, `icon_${s}x${s}.png`)], { stdio: 'ignore' })
  execFileSync('sips', ['-z', String(s * 2), String(s * 2), icon, '--out', join(set, `icon_${s}x${s}@2x.png`)], { stdio: 'ignore' })
}
execFileSync('iconutil', ['-c', 'icns', set, '-o', join(build, 'icon.icns')])

// 菜单栏模板图：SVG 画成 16 和 32 的透明 PNG
const { chromium } = createRequire(import.meta.url)('@playwright/test')
const svg = readFileSync(join(src, `menubar-${PICK}Template.svg`), 'utf8')
// 本机装的 Playwright 浏览器版本可能比包要的旧：有哪个用哪个（缓存目录里找无头 Chromium）
const cache = join(process.env.HOME, 'Library/Caches/ms-playwright')
const shell = readdirSync(cache)
  .filter((d) => d.startsWith('chromium_headless_shell-'))
  .sort()
  .reverse()
  .map((d) => join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'))
  .find((p) => existsSync(p))
const browser = await chromium.launch(shell ? { executablePath: shell } : {})
const pngs = {}
for (const scale of [1, 2]) {
  const page = await browser.newPage({ viewport: { width: 16, height: 16 }, deviceScaleFactor: scale })
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg style="display:block" ')}</body></html>`)
  pngs[scale] = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 16, height: 16 } })
  writeFileSync(join(src, `menubar-${PICK}Template${scale === 2 ? '@2x' : ''}.png`), pngs[scale])
  await page.close()
}
await browser.close()
rmSync(tmp, { recursive: true, force: true })

const b64 = (buf) => 'data:image/png;base64,' + buf.toString('base64')
writeFileSync(
  join(app, 'src/main/tray-icon.ts'),
  `/** 菜单栏图标：design/today/icon/menubar-${PICK}Template（「今日一页」），黑色模板图（系统按深浅色自己换色），16px 和 32px 两份。由 scripts/make-icons.mjs 生成 */\n` +
    `export const TRAY_1X = '${b64(pngs[1])}'\n` +
    `export const TRAY_2X = '${b64(pngs[2])}'\n`,
)
console.log('好了：build/icon.png、build/icon.icns、src/main/tray-icon.ts')
