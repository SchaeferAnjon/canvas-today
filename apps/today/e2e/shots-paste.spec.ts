/**
 * 右栏 AI 对话贴图的截图（交付、设计复审用）：只在给了 CT_SHOTS_PASTE（目录）时截。真点出来的（假 AI），截的是右栏那一块。
 * 空的输入框、贴了三张、第 5 张提示上限、字和图一起粘、拖图经过、发出去以后、谁来答菜单（照旧）；深湖、石墨、英文各一两张。
 */
import { type Page, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, LOOK } from './app'
import { solidPng } from '../../notes/e2e/fixtures/png'

const OUT = process.env.CT_SHOTS_PASTE ?? ''
test.skip(!OUT, '只在出截图时跑（CT_SHOTS_PASTE=<目录>）')

const AI = { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '200' }
const panel = (p: Page) => p.locator('[data-part="AI 对话"]')
const TA = '[data-part="AI 对话"] [data-testid="ai-input"] textarea'

const PNGS = [solidPng(120, 80, [70, 130, 210]), solidPng(90, 120, [230, 170, 60]), solidPng(140, 90, [90, 170, 110]), solidPng(60, 60, [200, 80, 90]), solidPng(80, 50, [120, 90, 200])]

async function paste(p: Page, png: Buffer, text: string | null = null) {
  await p.evaluate(
    ([sel, bytes, txt]) => {
      const el = document.querySelector(sel as string) as HTMLTextAreaElement
      el.focus()
      const dt = new DataTransfer()
      if (txt) dt.setData('text/plain', txt as string)
      dt.items.add(new File([new Uint8Array(bytes as number[])], 'image.png', { type: 'image/png' }))
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    },
    [TA, [...png], text] as const,
  )
}

/** CT_SHOTS_ONLY=<名字里的几个字>：只截名字里有它的那几张 */
const ONLY = process.env.CT_SHOTS_ONLY ?? ''

async function shot(name: string, o: { skin?: 'sky' | 'petrol' | 'graphite'; lang?: 'zh' | 'en'; prep: (p: Page) => Promise<void> }) {
  if (ONLY && !name.includes(ONLY)) return
  const look = LOOK('sky', 'b', o.lang ?? 'zh')
  const run = await launch({ env: AI, settings: { ...look, appearance: { ...look.appearance, skin: o.skin ?? 'sky' } } })
  try {
    const p = run.page
    await p.locator('.abar.r .ab[data-k="ai"]').click()
    await panel(p).waitFor()
    await o.prep(p)
    // 指针挪开（右图标栏 AI 那一格的悬停提示不进图）；拖图经过那一张不挪（挪了算离开）
    if (!name.includes('拖图')) await p.mouse.move(700, 790)
    await p.waitForTimeout(300)
    mkdirSync(OUT, { recursive: true })
    const r = (await p.locator('.right').boundingBox())!
    await p.screenshot({ path: join(OUT, `${name}.png`), clip: { x: r.x, y: r.y, width: r.width, height: r.height } })
  } finally {
    await run.close()
  }
}

/** 一张一张贴、等它进了那一排再贴下一张（贴是异步的：存图要过主进程） */
async function pasteN(p: Page, n: number) {
  for (const [i, g] of PNGS.slice(0, n).entries()) {
    await paste(p, g)
    await panel(p).getByTestId('ai-mat').nth(i).waitFor()
  }
}

const three = async (p: Page) => {
  await pasteN(p, 3)
  await p.locator(TA).press('End')
  await p.locator(TA).pressSequentially('照这三张截图把作业排进空着的时间')
}

test('贴图截图', async () => {
  test.setTimeout(900_000)
  await shot('1-空着', { prep: async () => {} })
  await shot('2-贴了三张', { prep: three })
  await shot('3-第5张提示上限', {
    prep: async (p) => {
      await pasteN(p, 4)
      await paste(p, PNGS[4]!)
      await panel(p).locator('.aim-note').waitFor()
    },
  })
  await shot('4-字和图一起粘', {
    prep: async (p) => {
      await p.locator(TA).fill('帮我排：')
      await paste(p, PNGS[0]!, '周一 8:00 高数\n周三 14:00 实验课')
    },
  })
  await shot('5-拖图经过', {
    prep: async (p) => {
      const t = panel(p).getByTestId('ai-input')
      const dt = await p.evaluateHandle((bytes) => {
        const d = new DataTransfer()
        d.items.add(new File([new Uint8Array(bytes)], '课表.png', { type: 'image/png' }))
        return d
      }, [...PNGS[0]!])
      await t.dispatchEvent('dragenter', { dataTransfer: dt })
      await t.dispatchEvent('dragover', { dataTransfer: dt })
    },
  })
  const sent = async (p: Page) => {
    await three(p)
    await p.locator(TA).press('Enter')
    await panel(p).locator('[data-part="改动卡"]').last().waitFor()
  }
  await shot('6-发出去以后', { prep: sent })
  await shot('7-谁来答菜单照旧', {
    prep: async (p) => {
      await paste(p, PNGS[0]!)
      await panel(p).getByRole('button', { name: '谁来答' }).click()
    },
  })
  await shot('8-深湖-发出去以后', { skin: 'petrol', prep: sent })
  await shot('10-石墨-贴了三张', { skin: 'graphite', prep: three })
  await shot('11-石墨-发出去以后', { skin: 'graphite', prep: sent })
  await shot('9-英文-贴了三张', {
    lang: 'en',
    prep: async (p) => {
      await pasteN(p, 3)
      await p.locator(TA).press('End')
      await p.locator(TA).pressSequentially('Plan my homework around these')
    },
  })
  writeFileSync(join(OUT, 'done.txt'), 'ok')
})
