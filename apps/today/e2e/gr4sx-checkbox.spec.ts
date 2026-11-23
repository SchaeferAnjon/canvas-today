/**
 * 勾选框不铺底、细边（task-gr4sx，用户「可以 这个按照推荐来就行」：半透明面板上白色实心方框太硬）：
 * - 没勾的框不铺底、透出面板，边是 @cn/design 的 --cb-line；悬停边变深；勾上照旧主题色底白勾；⏫ 照旧黄框。
 * - 十套主题 × B 极光 / B 冰洞 / B 不用图 / A：没勾的框的边对它里外的底色（真截出来的像素）都有 3:1（非文字元素）。
 * - 真点勾、真点取消：文件写回对（只那一行，取消后回到原来的字节）。
 * CT_SHOTS=<目录> 时另截改前改后对照图（浅色天青、深色深湖，B 冰洞）。
 */
import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, row } from './app'
import { boxes, boxOf, HI, look, LOOKS, SEL, setLook, SKINS, worst } from './cb-measure'
import { PROTO } from './fixtures'

test('没勾的框不铺底、透出面板；悬停边变深；真点勾、真点取消，文件写回对', async () => {
  const run = await launch({ files: PROTO, settings: look('sky', 'b', 'cave') })
  const { page } = run
  try {
    const box = row(page, '取快递').locator('.cb')
    await expect(box).toBeVisible()
    const css = () => box.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopColor, w: getComputedStyle(el).borderTopWidth }))
    const rest = await css()
    expect(rest.bg).toBe('rgba(0, 0, 0, 0)')
    expect(rest.w).toBe('1.5px')
    // 悬停：边变深（对底色的对比度更高）
    const c0 = await worst(run, [await boxOf(box)])
    await box.hover()
    await expect.poll(async () => (await css()).border).not.toBe(rest.border)
    expect(await worst(run, [await boxOf(box)])).toBeGreaterThan(c0)
    // ⏫ 照旧黄框（悬停也不变灰）
    const hi = row(page, '交论文初稿').locator('.cb')
    await expect(hi).toHaveClass(/\bhi\b/)
    const yellow = await page.evaluate(() => {
      const p = document.createElement('i')
      p.style.color = 'var(--cb-hi)'
      document.querySelector('.center')!.append(p)
      const c = getComputedStyle(p).color
      p.remove()
      return c
    })
    await hi.hover()
    await expect.poll(() => hi.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(yellow)

    // 真点勾：只那一行变成 - [x] … ✅ 今天；框是主题色底
    const before = run.read('收件箱/待办.md')
    await box.click()
    await expect.poll(() => run.read('收件箱/待办.md')).toBe(before.replace('- [ ] 取快递 📅 2026-11-22\n', '- [x] 取快递 📅 2026-11-22 ✅ 2026-11-22\n'))
    const done = page.locator('.center .row', { hasText: '取快递' }).locator('.cb.on')
    await expect(done).toBeVisible()
    const acc = await page.evaluate(() => {
      const p = document.createElement('i')
      p.style.color = 'var(--acc-bg)'
      document.querySelector('.center')!.append(p)
      const c = getComputedStyle(p).color
      p.remove()
      return c
    })
    expect(await done.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(acc)
    // 真点取消：回到原来的字节
    await page.mouse.move(5, 5)
    await done.click()
    await expect.poll(() => run.read('收件箱/待办.md')).toBe(before)
    await expect(row(page, '取快递').locator('.cb')).not.toHaveClass(/\bon\b/)
  } finally {
    await run.close()
  }
})

test('十套主题 × B 极光 / 冰洞 / 不用图 / A：没勾的框的边对底色 ≥ 3:1', async () => {
  test.setTimeout(240_000)
  const run = await launch({ files: PROTO, settings: look('sky', 'b', 'cave') })
  const { page } = run
  try {
    // 右边详情开着（子任务的框也量）
    await row(page, '读完三篇相关论文').locator('.rt').click()
    await expect(page.locator('.right .cb').first()).toBeVisible()
    await page.mouse.move(5, 5)
    const table: string[] = []
    let min = Infinity
    for (const skin of SKINS) {
      const cells: string[] = []
      for (const l of LOOKS) {
        await setLook(run, skin, l.frame, l.winBg)
        const bs = await boxes(page, SEL)
        expect(bs.length, `${skin} ${l.name} 看得见的框`).toBeGreaterThan(2)
        const c = await worst(run, bs)
        // ⏫ 的黄框也是没勾的框，一样要 3:1
        const h = await worst(run, await boxes(page, HI))
        min = Math.min(min, c, h)
        cells.push(`${l.name} ${c.toFixed(2)}（⏫ ${h.toFixed(2)}）`)
      }
      table.push(`${skin.padEnd(9)} ${cells.join(' · ')}`)
    }
    console.log(`画布今日 勾选框边的对比度（最差的那个框）：\n${table.join('\n')}`)
    expect(min).toBeGreaterThanOrEqual(3)
  } finally {
    await run.close()
  }
})

const OUT = process.env.CT_SHOTS
test('对照图：浅色天青、深色深湖，B 冰洞，选中「读完三篇相关论文」', async () => {
  test.skip(!OUT, '只在截对照图时跑（CT_SHOTS=<目录>）')
  mkdirSync(OUT!, { recursive: true })
  const tag = process.env.CT_SHOT_TAG ?? 'after'
  for (const [skin, tone] of [
    ['sky', 'light'],
    ['petrol', 'dark'],
  ] as const) {
    const run = await launch({ files: PROTO, settings: look(skin, 'b', 'cave'), size: { width: 1440, height: 900 } })
    const { page } = run
    try {
      await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900))
      await row(page, '读完三篇相关论文').locator('.rt').click()
      await expect(page.locator('.right .cb').first()).toBeVisible()
      await page.mouse.move(700, 895)
      await page.waitForTimeout(500)
      const b64 = await run.app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString('base64'))
      writeFileSync(join(OUT!, `today-${tone}-${tag}.png`), Buffer.from(b64, 'base64'))
    } finally {
      await run.close()
    }
  }
})
