/**
 * 画布今日对标第一批的交付截图（页 177）：只在给了 CT_SHOTS_PARITY（目录）时截；CT_SHOTS_TAG 是文件名后缀。
 * 同页 161 的截法：同一个库、主题天青（深色用深湖）、浮岛书桌 B、背景极光，1440 × 900，测试模式无头起。
 */
import { type Page, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, LOOK, nav, row } from './app'

const OUT = process.env.CT_SHOTS_PARITY ?? ''
const TAG = process.env.CT_SHOTS_TAG ?? 'after'
test.skip(!OUT, '只在出截图时跑（CT_SHOTS_PARITY=<目录>）')

const SIZE = { width: 1440, height: 900 }
const dlg = (p: Page) => p.getByRole('dialog', { name: '设置' })
const file = (name: string) => (mkdirSync(OUT, { recursive: true }), join(OUT, `${name}-${TAG}.png`))
const settle = (p: Page) => p.waitForTimeout(500)

test('1 设置 › 快捷键（撞了说撞了谁）', async () => {
  const run = await launch({ size: SIZE })
  const { page } = run
  try {
    await page.keyboard.press('Meta+,')
    await dlg(page).getByRole('button', { name: '快捷键', exact: true }).click()
    await dlg(page).getByRole('button', { name: '改 搜索、加一条 的快捷键' }).click()
    await page.keyboard.press('Alt+Meta+p')
    await dlg(page).getByRole('button', { name: '改 排一天 的快捷键' }).click()
    await page.keyboard.press('Meta+,')
    await settle(page)
    await page.screenshot({ path: file('1-keys') })
    // 滚下去：搜索那一行贴在顶上
    await page.keyboard.press('Escape')
    await page.locator('.set-body').evaluate((b) => (b.scrollTop = 320))
    await page.locator('.sa-keytools.stuck').waitFor()
    await settle(page)
    await page.screenshot({ path: file('1c-keys-stuck') })
  } finally {
    await run.close()
  }
})

test('1b 设置 › 快捷键 · A 风格（中间一个标签）、深色', async () => {
  const run = await launch({ size: SIZE, settings: LOOK('petrol', 'a') })
  const { page } = run
  try {
    await page.keyboard.press('Meta+,')
    await page.locator('.set-nav').getByRole('button', { name: '快捷键', exact: true }).click()
    await page.locator('.set-body').evaluate((b) => (b.scrollTop = 160))
    await settle(page)
    await page.screenshot({ path: file('1b-keys-a-dark') })
  } finally {
    await run.close()
  }
})

test('2 设置搜索', async () => {
  const run = await launch({ size: SIZE })
  const { page } = run
  try {
    await page.keyboard.press('Meta+,')
    await dlg(page).getByRole('textbox', { name: '搜设置' }).fill('提醒')
    await settle(page)
    await page.screenshot({ path: file('2-search') })
    await dlg(page).getByRole('textbox', { name: '搜设置' }).press('Enter')
    await page.waitForTimeout(250)
    await page.screenshot({ path: file('2b-search-go') })
  } finally {
    await run.close()
  }
})

test('3 ⌘ 悬停预览', async () => {
  for (const [skin, tag] of [
    ['sky', '3-peek'],
    ['petrol', '3b-peek-dark'],
  ] as const) {
    const run = await launch({ size: SIZE, settings: LOOK(skin, 'b') })
    const { page } = run
    try {
      const a = (await row(page, '读完三篇相关论文').boundingBox())!
      await page.mouse.move(a.x + 120, a.y + a.height / 2)
      await page.keyboard.down('Meta')
      await page.locator('.pk .pk-l.hit').waitFor()
      await page.keyboard.up('Meta')
      await settle(page)
      await page.screenshot({ path: file(tag) })
    } finally {
      await run.close()
    }
  }
})

test('4 从别的软件拖进来', async () => {
  const run = await launch({ size: SIZE })
  const { page } = run
  try {
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.nav[data-k="list:写作/小论文计划.md"]')!
      const r = el.getBoundingClientRect()
      const dt = new DataTransfer()
      dt.setData('text/plain', '查参考文献格式')
      const at = { clientX: r.left + 90, clientY: r.top + r.height / 2, bubbles: true, cancelable: true, dataTransfer: dt }
      document.elementFromPoint(at.clientX, at.clientY)!.dispatchEvent(new DragEvent('dragover', at))
    })
    await page.waitForTimeout(80)
    await page.screenshot({ path: file('4-drop') })
    // 放下以后：加进那一篇，提示条一句
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.nav[data-k="list:写作/小论文计划.md"]')!
      const r = el.getBoundingClientRect()
      const dt = new DataTransfer()
      dt.setData('text/plain', '- 查参考文献格式\n- 问师兄要数据\n- 画流程图')
      const at = { clientX: r.left + 90, clientY: r.top + r.height / 2, bubbles: true, cancelable: true, dataTransfer: dt }
      const hit = document.elementFromPoint(at.clientX, at.clientY)!
      hit.dispatchEvent(new DragEvent('dragover', at))
      hit.dispatchEvent(new DragEvent('drop', at))
    })
    await nav(page, 'list:写作/小论文计划.md').click()
    await page.locator('.toast').waitFor()
    await settle(page)
    await page.screenshot({ path: file('4b-dropped') })
  } finally {
    await run.close()
  }
})

test('5 打勾：原处「已完成 · 撤回」', async () => {
  const run = await launch({ size: SIZE })
  const { page } = run
  try {
    await row(page, '取快递').locator('.cb').click()
    await page.locator('.center .row.just').waitFor()
    await page.waitForTimeout(250)
    await page.screenshot({ path: file('5-just') })
    await page.waitForTimeout(2400)
    await page.screenshot({ path: file('5b-gone') })
  } finally {
    await run.close()
  }
})
