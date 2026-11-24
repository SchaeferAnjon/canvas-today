/**
 * 日历和提醒事项的设置引导（cal-guide.tsx）：第一次连提醒事项时出一张小卡，四步，能跳的带「打开设置」；
 * 系统设置、系统「日历」App 在测试模式只记下来（cnScreen）；关掉不再自动出；设置 › 日历和提醒事项里能再打开；「我只用画布今日」照最简的设好、提示一句。
 */
import { expect, type Page, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, LOOK, type Running } from './app'

const SHOTS = process.env.CT_GUIDE_SHOTS ?? join(tmpdir(), 'ct-cal-guide')
const screenLog = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { cnScreen: string[] }).cnScreen.slice())

const L = {
  zh: { settings: '设置', calRem: '日历和提醒事项', connect: '连接提醒事项', connected: /已连接iCloud/, title: '日历和提醒事项：最舒服的设置', open: '打开设置', openCal: '打开日历', done: '知道了', only: '我只用画布今日', again: '打开引导', disconnect: '断开', onlyToast: '照最简的设好了', remindAll: '提醒所有带钟点的待办' },
  en: { settings: 'Settings', calRem: 'Calendar & Reminders', connect: 'Connect Reminders', connected: /Connected to iCloud/, title: 'Calendar & Reminders: the comfortable setup', open: 'Open Settings', openCal: 'Open Calendar', done: 'Got it', only: 'I only use Canvas Today', again: 'Open Guide', disconnect: 'Disconnect', onlyToast: 'Set up the simplest way', remindAll: 'Remind me of every to-do with a time' },
}

async function remPage(page: Page, l: (typeof L)['zh']) {
  await page.locator('.ab[data-k="settings"]').click()
  const s = page.locator('.set')
  await s.getByRole('navigation').getByRole('button', { name: l.calRem }).click()
  return s
}

for (const lang of ['zh', 'en'] as const) {
  test(`${lang}：第一次连提醒事项出设置引导 → 打开设置记到链接 → 关掉不再自动出 → 设置里能再打开 → 「我只用画布今日」照最简的设好`, async () => {
    const l = L[lang]
    const look = lang === 'zh' ? LOOK('sky', 'b', 'zh') : LOOK('sky', 'b', 'en')
    const run = await launch({ settings: { ...look, calGuideSeen: false, remindAll: false } })
    const { page } = run
    try {
      let s = await remPage(page, l)
      const r = s.locator('[data-row="rem"]')
      await r.getByRole('button', { name: l.connect }).click()
      await expect(r).toContainText(l.connected, { timeout: 10_000 })

      // 连上了：引导自动出来，四步
      const g = page.getByRole('dialog', { name: l.title })
      await expect(g).toBeVisible()
      await expect(g.locator('li')).toHaveCount(4)
      await expect(g.locator('li[data-step="4"]')).toContainText('收件箱/待办.md')
      mkdirSync(SHOTS, { recursive: true })
      await page.screenshot({ path: `${SHOTS}/guide-${lang}.png` })

      // 第 1 步：系统设置的 Apple 账户（iCloud 在那里），只记下来
      await g.locator('li[data-step="1"]').getByRole('button', { name: l.open }).click()
      await expect.poll(async () => (await screenLog(run)).join('\n')).toContain('x-apple.systempreferences:com.apple.systempreferences.AppleIDSettings')
      // 第 3 步：系统「日历」App
      await g.locator('li[data-step="3"]').getByRole('button', { name: l.openCal }).click()
      await expect.poll(async () => (await screenLog(run)).join('\n')).toContain('/System/Applications/Calendar.app')

      // 关掉：不再自动出（断开再连一次也不出）
      await g.getByRole('button', { name: l.done }).click()
      await expect(g).toBeHidden()
      await r.getByRole('button', { name: l.disconnect }).click()
      await expect(r.getByRole('button', { name: l.connect })).toBeVisible({ timeout: 10_000 })
      await r.getByRole('button', { name: l.connect }).click()
      await expect(r).toContainText(l.connected, { timeout: 10_000 })
      await page.waitForTimeout(800)
      await expect(g).toBeHidden()

      // 设置里能再打开；第 2 步「打开设置」翻到画布今日自己的「日历和提醒事项」
      await s.locator('[data-row="calGuide"]').getByRole('button', { name: l.again }).click()
      await expect(g).toBeVisible()
      await g.locator('li[data-step="2"]').getByRole('button', { name: l.open }).click()
      await expect(g).toBeHidden()
      s = page.locator('.set')
      await expect(s.locator('[data-row="remindAll"]')).toBeVisible()

      // 「我只用画布今日」：提醒所有带钟点的待办打开，提示一句
      await expect(s.getByRole('switch', { name: l.remindAll })).toHaveAttribute('aria-checked', 'false')
      await s.locator('[data-row="calGuide"]').getByRole('button', { name: l.again }).click()
      await g.getByRole('button', { name: l.only }).click()
      await expect(g).toBeHidden()
      await expect(s.getByTestId('settings-toast')).toContainText(l.onlyToast)
      await expect(s.getByRole('switch', { name: l.remindAll })).toHaveAttribute('aria-checked', 'true')
    } finally {
      await run.close()
    }
  })
}
