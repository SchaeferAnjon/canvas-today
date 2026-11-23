/**
 * 设置 › 软件家族（task-59o3v）的对照截图：只在给了 CT_SHOTS 时截（目录）。和原型同一个窗口（1440 × 887），
 * 天青、深湖各一组：装了画布笔记（同原型那一档）/ 一个都没装，各截页顶和翻到底。
 */
import { test } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, LOOK } from './app'

const dir = process.env.CT_SHOTS
const SOME = { 'canvas-notes': '0.5.1', pararead: '0.1.4', bookmarkkeeper: '0.8.0', askfree: '1.2.0', dispatch: '0.9.5' }

for (const [skin, tone] of [
  ['sky', '天青'],
  ['petrol', '深湖'],
] as const) {
  for (const [state, apps] of [
    ['some', SOME],
    ['none', {}],
  ] as const) {
    test(`软件家族对照截图 · ${tone} · ${state}`, async () => {
      test.skip(!dir, '只在给了 CT_SHOTS 时截')
      const file = join(mkdtempSync(join(tmpdir(), 'ct-fam-shot-')), 'installed.json')
      writeFileSync(file, JSON.stringify(apps))
      const run = await launch({ settings: LOOK(skin, 'b'), env: { CT_FAMILY_INSTALLED_FILE: file }, size: { width: 1440, height: 887 } })
      const { page } = run
      try {
        await page.locator('.ab[data-k="settings"]').click()
        const set = page.getByRole('dialog', { name: '设置' })
        await set.getByRole('navigation', { name: '设置分页' }).getByRole('button', { name: '软件家族' }).click()
        await set.locator('.fm-card').first().waitFor()
        await page.mouse.move(0, 0)
        await page.waitForTimeout(400)
        await set.screenshot({ path: join(dir!, `today-${state}-${tone}-top.png`) })
        await set.locator('.set-body').evaluate((e) => (e.scrollTop = 99999))
        await page.waitForTimeout(200)
        await set.screenshot({ path: join(dir!, `today-${state}-${tone}-bottom.png`) })
      } finally {
        await run.close()
      }
    })
  }
}
