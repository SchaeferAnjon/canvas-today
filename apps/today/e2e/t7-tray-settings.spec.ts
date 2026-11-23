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

test('设置（照画布笔记分页）：不跟画布笔记时换 A 风格、深湖；跟画布笔记时读画布笔记的设置；菜单栏开关、语言记在设置文件里；改了能撤回', async () => {
  const run = await launch({ settings: { followNotes: true } })
  const { page } = run
  try {
    // 画布笔记的设置目录是临时的、空的：用画布今日自己的（B、天青）
    await expect(page.locator('.win')).toHaveClass(/fb/)
    await page.locator('.ab[data-k="settings"]').click()
    const s = page.getByRole('dialog', { name: '设置' })
    await expect(s).toBeVisible()
    const nav = s.getByRole('navigation', { name: '设置分页' })
    // 左边五页（第五页软件家族，task-59o3v），开在「一般」
    await expect(nav.getByRole('button')).toHaveText(['一般', '外观', '日历和提醒事项', '库', '软件家族'])
    await expect(nav.getByRole('button', { name: '一般' })).toHaveAttribute('aria-current', 'page')
    await expect(s.getByRole('heading', { name: '一般' })).toBeVisible()
    await nav.getByRole('button', { name: '外观' }).click()
    await expect(s.getByRole('heading', { name: '外观' })).toBeVisible()
    await s.getByRole('switch', { name: '和画布笔记一样' }).click()
    await expect(s.getByTestId('settings-toast')).toHaveText(/已存 · 「和画布笔记一样」关了\s*撤回/)
    await s.getByRole('radio', { name: /^A · 照VS Code/ }).click()
    await expect(page.locator('.win')).toHaveClass(/fa/)
    await expect(page.locator('.crumb')).toContainText('测试库')
    // 提示条上「撤回」：回到 B
    await s.getByTestId('settings-toast').getByRole('button', { name: '撤回' }).click()
    await expect(page.locator('.win')).toHaveClass(/fb/)
    await s.getByRole('radio', { name: /^A · 照VS Code/ }).click()
    await expect(page.locator('.win')).toHaveClass(/fa/)
    await s.getByRole('radio', { name: '深湖' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'petrol')
    await expect(page.locator('html')).toHaveAttribute('data-tone', 'dark')
    await s.getByRole('radio', { name: '冰洞照片' }).click()
    await nav.getByRole('button', { name: '一般' }).click()
    await s.getByRole('switch', { name: '开着时常驻菜单栏' }).click()
    await s.getByLabel('界面语言').selectOption({ label: 'English' })
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Settings pages' }).getByRole('button')).toHaveText(['General', 'Appearance', 'Calendar & Reminders', 'Vault', 'App family'])
    const saved = JSON.parse(readFileSync(join(run.userData, 'settings.json'), 'utf8'))
    expect(saved).toMatchObject({ lang: 'en', followNotes: false, tray: false, appearance: { frame: 'a', skin: 'petrol', winBg: 'cave' } })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0)
    // 底栏「日历、提醒事项已连接」那种入口开在「日历和提醒事项」：这里从库那一页看换库的按钮
    await page.keyboard.press('Meta+,')
    await page.getByRole('navigation', { name: 'Settings pages' }).getByRole('button', { name: 'Vault' }).click()
    await expect(page.locator('[data-row="vault"]')).toContainText('测试库')
    await expect(page.locator('[data-row="vault"]').getByRole('button', { name: 'Choose another vault…' })).toBeVisible()
  } finally {
    await run.close()
  }
})

/**
 * 设置在原型那么大的窗口（1420 × 800）里：弹窗 960 × 740（同画布笔记；窗口 800 高时正好 800 - 60），四页中英文都不用滚就看全
 * （最长的样子：提醒事项连着、三行都在；正在下载新版本那一行多一条进度条；不跟画布笔记时外观四行加十个主题），主题名不截断
 */
test('设置弹窗在 1420 × 800 里：一般、日历和提醒事项、库中英文都不用滚，外观的十个主题一屏看全、名字不截断', async () => {
  for (const lang of ['zh', 'en'] as const) {
    const run = await launch({ settings: { ...LOOK('sky', 'a', lang), followNotes: false }, reminders: {} })
    const { page } = run
    try {
      await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1420, 800))
      await expect.poll(() => page.evaluate(() => innerHeight)).toBeLessThanOrEqual(800)
      await page.locator('.ab[data-k="settings"]').click()
      const s = page.locator('.set')
      const box = (await s.boundingBox())!
      // 高是 min(740, 窗口内高 - 60)：窗口内高 799 / 800 时是 739 / 740
      expect(Math.round(box.width)).toBe(960)
      expect(Math.round(box.height)).toBeGreaterThanOrEqual(738)
      expect(Math.round(box.height)).toBeLessThanOrEqual(740)
      const nav = s.getByRole('navigation')
      // 正在下载新版本时那一行多一条进度条
      await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('ct:update', { phase: 'downloading', current: '0.1.0', version: '0.1.1', percent: 40, error: '', checkedAt: 0, inApps: true }))
      await expect(s.locator('.ubar')).toBeAttached()
      // 连上提醒事项（这一页最长的样子：开关、放进哪个列表、导入提醒事项三行）
      await nav.getByRole('button').nth(2).click()
      await s.locator('[data-row="rem"]').getByRole('button').first().click()
      await expect(s.locator('[data-row="remImport"]')).toBeVisible()
      await expect(s.locator('[data-row="remList"]')).toBeVisible()
      for (let i = 0; i < 4; i++) {
        await nav.getByRole('button').nth(i).click()
        const body = s.locator('.set-body')
        await expect(body.locator('.sa-head')).toBeVisible()
        if (i === 1) {
          // 外观照画布笔记：主题卡、界面风格两张大图、窗口背景缩略图，比一屏长；十个主题不用滚就看全
          const { last, bottom } = await body.evaluate((e) => ({ last: [...e.querySelectorAll('.sk')].pop()!.getBoundingClientRect().bottom, bottom: e.getBoundingClientRect().bottom }))
          expect(last, `${lang} 外观：最后一个主题的下沿 ${last}，能看见的下沿 ${bottom}`).toBeLessThanOrEqual(bottom)
          continue
        }
        const { scroll, client } = await body.evaluate((e) => ({ scroll: e.scrollHeight, client: e.clientHeight }))
        expect(scroll, `${lang} 第${i + 1}页：内容 ${scroll}，能看见的 ${client}`).toBeLessThanOrEqual(client)
      }
      await nav.getByRole('button').nth(1).click()
      await expect(s.locator('.sk-pick')).toHaveCount(10)
      // 主题名一个都不截断
      const cut = await s.locator('.sk .nm .t').evaluateAll((bs) => bs.filter((b) => b.scrollWidth > b.clientWidth).map((b) => b.textContent))
      expect(cut).toEqual([])
      // 界面风格两张大图的名字也不截断
      const frameCut = await s.locator('.hs .nm').evaluateAll((bs) => bs.filter((b) => b.scrollWidth > b.clientWidth).map((b) => b.textContent))
      expect(frameCut).toEqual([])
    } finally {
      await run.close()
    }
  }
})

test('还没有的格子（数据库）：变淡、悬停说是什么，点了旁边说一句，不开栏；专注、习惯开整页；AI 一格说用的是哪一家、用在哪两处', async () => {
  const run = await launch()
  const { page } = run
  try {
    const db = page.locator('.ab[data-k="db"]')
    await expect(db).toHaveClass(/dis/)
    await expect(db).toHaveAttribute('aria-label', '数据库（以后：等画布笔记的数据库做好）')
    await db.click()
    await expect(page.locator('.ab-say')).toHaveText('以后：等画布笔记的数据库做好')
    await expect(page.locator('.vhead h1')).toHaveText('今天')
    // 第二批做了的：不再变淡
    for (const [k, h1] of [
      ['focus', '专注'],
      ['habit', '习惯'],
    ] as const) {
      const cell = page.locator(`.ab[data-k="${k}"]`)
      await expect(cell).not.toHaveClass(/dis/)
      await cell.click()
      await expect(page.locator('.vhead h1')).toHaveText(h1)
    }
    const ai = page.locator('.ab[data-k="ai"]')
    await expect(ai).not.toHaveClass(/dis/)
    await expect(ai).toHaveAttribute('aria-label', 'AI · Claude Code')
    await ai.click()
    await expect(page.locator('.ab-say')).toHaveText('Claude Code · Haiku：详情里「拆成小步」，日历里「帮我排进空着的时间」')
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
