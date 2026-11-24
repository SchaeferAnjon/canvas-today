/**
 * 主题渐变（task-aph2j）：画布今日和画布笔记同一套——外观页同一个组件真点（五格里画布今日没有「从电脑选」，所以四格）、
 * 慢慢动 / 快慢 / 浓淡、风格 A / B 任意组合，重开记得；「和画布笔记一样」开着时画布笔记那边一改，这边当场跟着；
 * 后台、减少动态效果时不动。
 */
import { expect, type Page, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, LOOK, quit } from './app'

const dlg = (page: Page) => page.getByRole('dialog', { name: '设置' })
const html = (page: Page) => page.locator('html')
const glow = (page: Page) =>
  page.evaluate(() => {
    const a = document.querySelector('.cn-wall > i')!.getAnimations()[0]
    return a ? { state: a.playState, t: Number(a.currentTime ?? 0) } : null
  })
const bgOf = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor)

async function openLook(page: Page) {
  await page.locator('.ab[data-k="settings"]').click()
  await dlg(page).getByRole('navigation', { name: '设置分页' }).getByRole('button', { name: '外观' }).click()
  await expect(dlg(page).getByRole('heading', { name: '外观' })).toBeVisible()
}

test('外观页真点：主题渐变、慢慢动、快慢、浓淡、风格 A，当场变；重开还在', async () => {
  const run = await launch({ settings: { ...LOOK('sky', 'b'), followNotes: false } })
  const { page } = run
  try {
    await openLook(page)
    const s = dlg(page)
    const bgs = s.getByRole('radiogroup', { name: '窗口背景' })
    await expect(bgs.getByRole('radio')).toHaveText(['主题渐变', '纯色', '极光照片', '冰洞照片'])
    await bgs.getByRole('radio', { name: '主题渐变' }).click()
    await expect(s.getByTestId('settings-toast')).toContainText('「窗口背景」改成「主题渐变」')
    await expect(html(page)).toHaveAttribute('data-winbg', 'wall')
    await expect(page.locator('body > .cn-wall')).toBeVisible()
    // B 的三块岛和照片时一样半透明（不是一整块实底）
    expect(await bgOf(page, '.fb .center')).toMatch(/^color\(srgb .* \/ 0\.8\)$|^rgba\(.*, 0\.8\)$/)
    expect(await bgOf(page, '.fb')).toBe('rgba(0, 0, 0, 0)')

    // 默认慢慢动（同画布笔记）；关了没有动画，再开回来
    const move = s.getByRole('switch', { name: '慢慢动' })
    await expect(move).toHaveAttribute('aria-checked', 'true')
    await expect(html(page)).toHaveAttribute('data-wallmove', 'slow')
    expect((await glow(page))!.state).toBe('running')
    await move.click()
    await expect(html(page)).not.toHaveAttribute('data-wallmove')
    await expect.poll(() => glow(page)).toBeNull()
    await move.click()
    await expect(html(page)).toHaveAttribute('data-wallmove', 'slow')
    await s.getByRole('radiogroup', { name: '动多快' }).getByRole('radio', { name: '中' }).click()
    await expect(html(page)).toHaveAttribute('data-wallmove', 'mid')
    await s.getByRole('radiogroup', { name: '浓淡' }).getByRole('radio', { name: '淡' }).click()
    await expect(html(page)).toHaveAttribute('data-wallmix', 'soft')
    await expect(s.getByTestId('settings-toast')).toContainText('「浓淡」改成「淡」')
    // 风格 A：背景不变，标题栏和图标栏透明，中间、左栏实底
    await s.getByRole('radiogroup', { name: '界面风格' }).getByRole('radio', { name: /照VS Code/ }).click()
    await expect(html(page)).toHaveAttribute('data-frame', 'a')
    await expect(html(page)).toHaveAttribute('data-winbg', 'wall')
    expect(await bgOf(page, '.fa > .tb')).toBe('rgba(0, 0, 0, 0)')
    expect(await bgOf(page, '.fa .abar')).toBe('rgba(0, 0, 0, 0)')
    expect(await bgOf(page, '.fa .center')).toBe('rgb(251, 253, 254)')
    await quit(run)

    // 重开
    const again = await launch({ root: run.root })
    try {
      await expect(html(again.page)).toHaveAttribute('data-winbg', 'wall')
      await expect(html(again.page)).toHaveAttribute('data-frame', 'a')
      await expect(html(again.page)).toHaveAttribute('data-wallmix', 'soft')
      await expect(html(again.page)).toHaveAttribute('data-wallmove', 'mid')
      expect((await glow(again.page))!.state).toBe('running')
    } finally {
      await again.close()
    }
  } finally {
    await run.app.close().catch(() => {})
  }
})

test('「和画布笔记一样」：画布笔记那边换成主题渐变、浓、快、A，这边当场跟着；后台停、减少动态效果不动', async () => {
  const run = await launch({ settings: { ...LOOK('sky', 'b'), followNotes: true } })
  const { page, root } = run
  try {
    writeFileSync(join(root, 'notes-data', 'settings.json'), JSON.stringify({ appearance: { followSystem: false, skin: 'pine', frame: 'a', winBg: 'wall', wallMix: 'rich', wallMove: true, wallSpeed: 'fast' } }))
    await expect(html(page)).toHaveAttribute('data-skin', 'pine')
    await expect(html(page)).toHaveAttribute('data-winbg', 'wall')
    await expect(html(page)).toHaveAttribute('data-frame', 'a')
    await expect(html(page)).toHaveAttribute('data-wallmix', 'rich')
    await expect(html(page)).toHaveAttribute('data-wallmove', 'fast')
    expect((await glow(page))!.state).toBe('running')
    // 后台
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect.poll(async () => (await glow(page))!.state).toBe('paused')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect.poll(async () => (await glow(page))!.state).toBe('running')
    // 减少动态效果
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect.poll(() => glow(page)).toBeNull()
    // 画布笔记换回纯色：这边也是纯色，渐变那层藏起来
    writeFileSync(join(root, 'notes-data', 'settings.json'), JSON.stringify({ appearance: { followSystem: false, skin: 'pine', frame: 'b', winBg: 'none', wallMix: 'rich' } }))
    await expect(html(page)).toHaveAttribute('data-winbg', 'none')
    await expect(page.locator('body > .cn-wall')).toBeHidden()
  } finally {
    await run.close()
  }
})
