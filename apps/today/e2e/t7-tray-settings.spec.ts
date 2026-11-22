/**
 * 菜单栏小窗（第一批最简：今天几条 + 快速加 + 勾掉 + 点一条打开主窗口到那一条）和设置（外观、语言、菜单栏开关）。
 * 测试模式不建真的菜单栏图标，用 globalThis.ctTrayOpen() 建出小窗（照样不上屏），再在里面真点真打字。
 */
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, LOOK, row } from './app'

test('菜单栏小窗：今天几条、勾掉、快速加（默认今天）、点一条打开主窗口选中它', async () => {
  const run = await launch()
  const { page } = run
  try {
    await run.app.evaluate(() => (globalThis as unknown as { ctTrayOpen: () => number }).ctTrayOpen())
    await expect.poll(() => run.app.windows().length).toBe(2)
    const tray = run.app.windows().find((w) => w !== page)!
    await expect(tray.locator('.trh b')).toHaveText(/^今天\d+条$/)
    const n0 = Number((await tray.locator('.trh b').innerText()).match(/\d+/)![0])
    await expect(tray.locator('.row', { hasText: '交 ecp 作业 2' })).toBeVisible()
    await tray.locator('.row', { hasText: '取快递' }).locator('.cb').click()
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [x] 取快递 📅 2026-11-22 ✅ 2026-11-22')
    await expect(tray.locator('.trh b')).toHaveText(`今天${n0 - 1}条`)
    await tray.getByLabel('快速加一条').fill('下午四点 打电话给房东')
    await tray.getByLabel('快速加一条').press('Enter')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 打电话给房东 📅 2026-11-22 16:00\n')
    await expect(tray.locator('.trh b')).toHaveText(`今天${n0}条`)
    // 主窗口也跟着变了
    await expect(row(page, '打电话给房东')).toBeVisible()
    await tray.locator('.row', { hasText: '交 ecp 作业 2' }).locator('.rt').click()
    await expect(page.locator('[data-part="详情"] .dtitle input')).toHaveValue('交 ecp 作业 2')
  } finally {
    await run.close()
  }
})

test('设置：不跟画布笔记时换 A 风格、深湖；跟画布笔记时读画布笔记的设置；菜单栏开关、语言记在设置文件里', async () => {
  const run = await launch({ settings: { followNotes: true } })
  const { page } = run
  try {
    // 画布笔记的设置目录是临时的、空的：用画布今日自己的（B、天青）
    await expect(page.locator('.win')).toHaveClass(/fb/)
    await page.locator('.ab[data-k="settings"]').click()
    const s = page.getByRole('dialog', { name: '设置' })
    await expect(s).toBeVisible()
    await s.getByRole('switch', { name: '和画布笔记一样' }).click()
    await s.getByRole('radio', { name: 'A 照 VS Code' }).click()
    await expect(page.locator('.win')).toHaveClass(/fa/)
    await expect(page.locator('.crumb')).toContainText('测试库')
    await s.getByRole('radio', { name: '深湖' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'petrol')
    await expect(page.locator('html')).toHaveAttribute('data-tone', 'dark')
    await s.getByRole('switch', { name: '开着时常驻菜单栏' }).click()
    await s.getByRole('radio', { name: 'English' }).click()
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    const saved = JSON.parse(readFileSync(join(run.userData, 'settings.json'), 'utf8'))
    expect(saved).toMatchObject({ lang: 'en', followNotes: false, tray: false, appearance: { frame: 'a', skin: 'petrol' } })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0)
  } finally {
    await run.close()
  }
})

/**
 * 设置弹窗在原型那么大的窗口（1420 × 800）里：默认（和画布笔记一样）连着提醒事项、正在下载新版本时也不用滚；
 * 不跟画布笔记时外观四行和十个主题一屏看全、主题名不截断。2026-11-22 加了「提醒事项」一节（task-b9y8i）以后，
 * 不跟画布笔记时整个弹窗比 800 高的窗口长，要往下滚到「提醒事项」以下（改成像画布笔记那样分页的侧栏另说）
 */
test('设置弹窗在 1420 × 800 里：默认外观连着提醒事项也不用滚；不跟画布笔记时外观和十个主题一屏看全，中英文都是', async () => {
  for (const lang of ['zh', 'en'] as const) {
    for (const follow of [true, false]) {
      const run = await launch({ settings: { ...LOOK('sky', 'a', lang), followNotes: follow }, reminders: {} })
      const { page } = run
      try {
        await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1420, 800))
        await expect.poll(() => page.evaluate(() => innerHeight)).toBeLessThanOrEqual(800)
        await page.locator('.ab[data-k="settings"]').click()
        const s = page.locator('.setw')
        // 连上提醒事项（这一节最长的样子：开关、放进哪个列表、导入提醒事项三行）
        await s.locator('[data-row="rem"]').getByRole('button').first().click()
        await expect(s.locator('[data-row="remImport"]')).toBeVisible()
        // 正在下载新版本时那一行多一条进度条
        await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('ct:update', { phase: 'downloading', current: '0.1.0', version: '0.1.1', percent: 40, error: '', checkedAt: 0, inApps: true }))
        await expect(s.locator('.ubar')).toBeAttached()
        const { scroll, client } = await s.evaluate((e) => ({ scroll: e.scrollHeight, client: e.clientHeight }))
        if (follow) expect(scroll, `${lang}：内容 ${scroll}，弹窗 ${client}`).toBeLessThanOrEqual(client)
        else {
          await expect(s.locator('.skins button')).toHaveCount(10)
          // 外观四行和十个主题在弹窗里一屏看得全（不用滚就看得到最后一个主题）
          const { box, last } = await s.evaluate((e) => ({ box: e.getBoundingClientRect().bottom, last: [...e.querySelectorAll('.skins button')].pop()!.getBoundingClientRect().bottom }))
          expect(last, `${lang}：最后一个主题的下沿 ${last}，弹窗下沿 ${box}`).toBeLessThanOrEqual(box)
          // 主题名一个都不截断
          const cut = await s.locator('.skins button span').evaluateAll((bs) => bs.filter((b) => b.scrollWidth > b.clientWidth).map((b) => b.textContent))
          expect(cut).toEqual([])
        }
      } finally {
        await run.close()
      }
    }
  }
})

test('第一批没有的格子（专注、习惯、数据库、AI）：变淡、悬停说是什么，点了旁边说一句为什么，不开栏', async () => {
  const run = await launch()
  const { page } = run
  try {
    const focus = page.locator('.ab[data-k="focus"]')
    await expect(focus).toHaveClass(/dis/)
    await expect(focus).toHaveAttribute('aria-label', '专注（下一批做：番茄钟和专注记录）')
    await focus.click()
    await expect(page.locator('.ab-say')).toHaveText('下一批做：番茄钟和专注记录')
    await expect(page.locator('.vhead h1')).toHaveText('今天')
    await page.locator('.ab[data-k="ai"]').click()
    await expect(page.locator('.ab-say')).toHaveText('以后：拆成小步、排进空着的时间')
    await expect(page.locator('.ab-say')).toHaveCount(0, { timeout: 4000 })
  } finally {
    await run.close()
  }
})

test('外观跟着画布笔记的设置（换了马上跟着换）', async () => {
  const run = await launch({ settings: { ...LOOK('sky', 'b'), followNotes: true } })
  const { page } = run
  try {
    const notesSettings = join(run.root, 'notes-data', 'settings.json')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(notesSettings, JSON.stringify({ appearance: { followSystem: false, skin: 'petrol', frame: 'a', winBg: 'aurora' } }))
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'petrol', { timeout: 5000 })
    await expect(page.locator('.win')).toHaveClass(/fa/)
    writeFileSync(notesSettings, JSON.stringify({ appearance: { followSystem: false, skin: 'mint', frame: 'b', winBg: 'none' } }))
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'mint', { timeout: 5000 })
    await expect(page.locator('html')).toHaveAttribute('data-winbg', 'none')
  } finally {
    await run.close()
  }
})
