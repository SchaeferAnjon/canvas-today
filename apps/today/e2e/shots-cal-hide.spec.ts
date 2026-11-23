/**
 * 「不在这里显示」的交付截图（task-ov5bb）：CT_SHOTS=<目录> npx playwright test e2e/shots-cal-hide.spec.ts（在 apps/today 下跑）。
 * 天青 A（浅色、不用图）、天青 B（浮岛、极光背景图）各一套：改前（「提醒事项」日历把提醒画成粉块，一周塞满）、右键菜单开着、改后（藏起「提醒事项」）、改后的月看法。
 * 系统右键菜单是原生的、无头截不到：菜单里的字从真弹出的那个菜单（记录器）读出来，照 macOS 菜单的样子画在右键的地方，截完拿掉，再真点那一项。
 */
import { expect, type Page, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, LOOK, type Running } from './app'
import { CAL_REM_SEED } from './fixtures'
import { armMenus, openedMenu, pickMenu } from './menu'

const OUT = process.env.CT_SHOTS
test.skip(!OUT, '只在出截图时跑（CT_SHOTS=<目录>）')

const row = (page: Page, name: string) => page.locator('[data-part="系统日历"] .calrow', { hasText: name })

/** 在 (x, y) 画一个 macOS 样子的右键菜单（第一项是指着的样子） */
async function drawMenu(page: Page, x: number, y: number, labels: string[]) {
  await page.evaluate(
    ({ x, y, labels }) => {
      const dark = matchMedia('(prefers-color-scheme: dark)').matches
      const m = document.createElement('div')
      m.id = 'shot-menu'
      m.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:99999;min-width:150px;padding:5px;border-radius:7px;font:13px -apple-system,'PingFang SC',sans-serif;background:${dark ? 'rgba(40,40,42,.82)' : 'rgba(238,238,240,.82)'};backdrop-filter:blur(20px) saturate(1.6);box-shadow:0 0 0 .5px rgba(0,0,0,.25),0 8px 24px rgba(0,0,0,.22);color:${dark ? '#eee' : '#1d1d1f'}`
      labels.forEach((l, i) => {
        const it = document.createElement('div')
        if (l === '—') it.style.cssText = `height:1px;margin:5px 9px;background:${dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.12)'}`
        else {
          it.textContent = l
          it.style.cssText = `padding:3px 10px;border-radius:4px;line-height:16px;${i === 0 ? 'background:#0a63d7;color:#fff' : ''}`
        }
        m.append(it)
      })
      document.body.append(m)
    },
    { x, y, labels },
  )
}

let app: Running['app']
async function shot(page: Page, name: string) {
  await page.waitForTimeout(400)
  const b64 = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString('base64'))
  writeFileSync(join(OUT!, `${name}.png`), Buffer.from(b64, 'base64'))
  writeFileSync(join(OUT!, `${name}.json`), JSON.stringify(await boxes(page)))
}
/** 交付页上的编号框：左栏系统日历那一块、日历格子、画上去的菜单（图片像素） */
async function boxes(page: Page) {
  return page.evaluate(() => {
    const k = devicePixelRatio
    const r = (sel: string) => {
      const e = document.querySelector(sel)
      if (!e) return null
      const b = e.getBoundingClientRect()
      return [b.x * k, b.y * k, b.width * k, b.height * k].map(Math.round)
    }
    return { side: r('[data-part="系统日历"]'), grid: r('.cal-wk, .cal-month'), menu: r('#shot-menu') }
  })
}


const LOOKS = [
  ['a', 'sky', 'a'],
  ['b', 'sky', 'b'],
  ['dark', 'petrol', 'b'],
] as const

for (const [tag, skin, frame] of LOOKS) {
  test(`画布今日 · 日历 · ${tag}`, async () => {
    mkdirSync(OUT!, { recursive: true })
    const run: Running = await launch({ reminders: CAL_REM_SEED, settings: { ...LOOK(skin, frame), calendar: { show: true } }, size: { width: 1440, height: 887 } })
    const { page } = run
    app = run.app
    try {
      // 2 倍图（1.5 的空心框在 1 倍图上会糊）
      await run.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.webContents.enableDeviceEmulation({ screenPosition: 'desktop', screenSize: { width: 1440, height: 887 }, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: 2, viewSize: { width: 1440, height: 887 }, scale: 1 }),
      )
      await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2)
      await page.locator('.ab[data-k="calendar"]').click()
      await expect(page.locator('.cal-blk.ev', { hasText: '交实验报告' })).toBeVisible()
      // 鼠标离开图标栏（不压着「日历」的提示）
      await page.mouse.move(700, 600)
      if (tag === 'dark') {
        // 深色主题：藏起「提醒事项」和一个深色的日历「工作」
        await row(page, '提醒事项').locator('.calsw').click()
        await row(page, '工作').locator('.calsw').click()
        await expect(page.locator('.cal-blk.ev', { hasText: '组会' })).toHaveCount(0)
        await page.mouse.move(700, 600)
        await shot(page, `ct-dark-3-after`)
        return
      }
      await shot(page, `ct-${tag}-1-before`)
      // 右键「提醒事项」：菜单开着
      await armMenus(run)
      const b = (await row(page, '提醒事项').boundingBox())!
      await page.mouse.move(b.x + 70, b.y + b.height / 2)
      await row(page, '提醒事项').click({ button: 'right', position: { x: 70, y: b.height / 2 } })
      const items = (await openedMenu(run)).map((i) => i.label)
      await drawMenu(page, b.x + 72, b.y + b.height / 2 + 2, items)
      await shot(page, `ct-${tag}-2-menu`)
      await page.evaluate(() => document.getElementById('shot-menu')?.remove())
      await pickMenu(run, '不在这里显示')
      await expect(page.locator('.cal-blk.ev', { hasText: '交实验报告' })).toHaveCount(0)
      await page.mouse.move(700, 600)
      await shot(page, `ct-${tag}-3-after`)
      // 悬停「工作」的色块：淡底 + 提示
      await row(page, '工作').locator('.calsw').hover()
      await shot(page, `ct-${tag}-5-hover`)
      await page.mouse.move(700, 600)
      await page.getByRole('tab', { name: '月' }).click()
      await shot(page, `ct-${tag}-4-after-month`)
      await page.getByRole('tab', { name: '周' }).click()
    } finally {
      await run.close()
    }
  })
}
