/**
 * 主题渐变在画布今日里的样子（task-aph2j，交付页 49-主题渐变施工）：CT_SHOTS=<目录> 时出图，不给就跳过。
 * B 浮岛书桌 × 天青 / 松林，A 照 VS Code × 天青 / 深湖；和画布笔记同一套渐变、同一套浓淡。
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from './app'

const OUT = process.env.CT_SHOTS
test.skip(!OUT, '只在出图时跑（CT_SHOTS=<目录>）')

const CASES = [
  { skin: 'sky', frame: 'b' },
  { skin: 'pine', frame: 'b' },
  { skin: 'sky', frame: 'a' },
  { skin: 'petrol', frame: 'a' },
] as const

for (const c of CASES)
  test(`画布今日 ${c.frame.toUpperCase()} + 主题渐变 · ${c.skin}`, async () => {
    const run = await launch({ settings: { followNotes: false, appearance: { followSystem: false, skin: c.skin, day: 'sky', night: 'pine', frame: c.frame, winBg: 'wall', wallMix: 'mid', wallMove: false } } })
    try {
      await expect(run.page.locator('html')).toHaveAttribute('data-winbg', 'wall')
      await run.page.waitForTimeout(600)
      mkdirSync(OUT!, { recursive: true })
      await run.page.screenshot({ path: join(OUT!, `today-${c.frame}-${c.skin}.png`) })
    } finally {
      await run.close()
    }
  })
