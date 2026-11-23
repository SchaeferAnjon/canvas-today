/**
 * 右栏 AI 对话（task-ykkoz）和设计稿 32-今日AI排日程 并排对照的截图：只在给了 CT_SHOTS_AI（目录）时截。
 * 和设计稿同一个窗口（1420 × 799）、同样的几屏：空对话、排这周的作业（天青、深湖）、明天太满了、按优先级、收下以后、选谁来答；
 * 再加 ⌘K「问AI」和 A 风格设置标签两屏。真点出来的（假 AI），不画假的。
 */
import { type Page, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, LOOK } from './app'
import { CAL_SEED } from './fixtures'

const OUT = process.env.CT_SHOTS_AI ?? ''
test.skip(!OUT, '只在出对照图时跑（CT_SHOTS_AI=<目录>）')

const W = 1420
const H = 799
const AI = { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '200' }

async function shot(name: string, o: { skin?: 'sky' | 'petrol'; frame?: 'a' | 'b'; prep: (p: Page) => Promise<void> }) {
  const run = await launch({ env: AI, settings: { ...LOOK(o.skin ?? 'sky', o.frame ?? 'b'), calendar: { show: true } }, reminders: { ...CAL_SEED, calAuth: 'full' }, size: { width: W, height: H } })
  try {
    await run.app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w as number, h as number), [W, H] as const)
    await o.prep(run.page)
    await run.page.mouse.move(700, 790)
    await run.page.waitForTimeout(400)
    mkdirSync(OUT, { recursive: true })
    const b64 = await run.app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString('base64'))
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(b64, 'base64'))
    // 交付页画框用：几处的位置（截图像素，2 倍）
    const rects = await run.page.evaluate((sels) => {
      const out: Record<string, number[]> = {}
      for (const sel of sels) {
        const rs = [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height)
        if (!rs.length) continue
        const x = Math.min(...rs.map((r) => r.left)) - 3
        const y = Math.min(...rs.map((r) => r.top)) - 3
        const X = Math.max(...rs.map((r) => r.right)) + 3
        const Y = Math.max(...rs.map((r) => r.bottom)) + 3
        out[sel] = [x, y, X - x, Y - y].map((v) => Math.round(v * 2))
      }
      return out
    }, ['.abar.r .ab[data-k="ai"]', '.aim-h', '.aim-see', '.aim-can', '.aim-empty .sug', '.aim-in', '.aim-in .ft', '.aim-u', '.aim-a .step', '.aim [data-part="改动卡"]', '.aim .ai .row2', '.cal-blk.ghost', '.cal-chip.ghost', '.aim-mv', '.toast', '.aim-menu', '.pal .pr.on', '.center .tabs', '.set.set-tab'])
    writeFileSync(join(OUT, `${name}.rects.json`), JSON.stringify(rects))
  } finally {
    await run.close()
  }
}

const calWeek = async (p: Page) => {
  await p.locator('.ab[data-k="calendar"]').click()
  await p.locator('.cal-blk.ev').first().waitFor()
  await p.locator('.cal-week').evaluate((e) => (e.scrollTop = 9 * 40))
}
const openAi = (p: Page) => p.locator('.abar.r .ab[data-k="ai"]').click()
const ask = async (p: Page, text: string) => {
  const ta = p.locator('.aim-in textarea')
  await ta.fill(text)
  await ta.press('Enter')
  await p.locator('.aim [data-part="改动卡"]').last().waitFor()
  await p.waitForTimeout(200)
}

test('AI 对话：和设计稿并排的截图', async () => {
  test.setTimeout(600_000)
  await shot('1-empty', { prep: async (p) => (await calWeek(p), await openAi(p), await p.locator('.aim-empty').waitFor()) })
  for (const skin of ['sky', 'petrol'] as const)
    await shot(`2-week-${skin}`, {
      skin,
      prep: async (p) => {
        await calWeek(p)
        await openAi(p)
        await ask(p, '把这周的作业排进空着的时间')
        await p.locator('.cal-week').evaluate((e) => (e.scrollTop = 9 * 40))
      },
    })
  await shot('3-tomorrow', {
    prep: async (p) => {
      await p.locator('.nav[data-k="tomorrow"]').click()
      await openAi(p)
      await ask(p, '明天太满了，帮我挪一挪')
    },
  })
  await shot('4-priority', {
    prep: async (p) => {
      await p.locator('.ab[data-k="quad"]').click()
      await openAi(p)
      await ask(p, '把收件箱这几条按优先级排好')
    },
  })
  await shot('5-took', {
    prep: async (p) => {
      await calWeek(p)
      await openAi(p)
      await ask(p, '把这周的作业排进空着的时间')
      await p.locator('.aim [data-part="改动卡"] button', { hasText: '收下' }).click()
      await p.locator('.toast').waitFor()
      await p.locator('.cal-week').evaluate((e) => (e.scrollTop = 9 * 40))
    },
  })
  await shot('6-engine', {
    prep: async (p) => {
      await calWeek(p)
      await openAi(p)
      await p.locator('.aim-in textarea').fill('下周三之前把论文的事排好')
      await p.getByRole('button', { name: '谁来答' }).click()
      await p.locator('.aim-in .aim-menu').waitFor()
    },
  })
  await shot('7-cmdk', {
    prep: async (p) => {
      await calWeek(p)
      await p.keyboard.press('Meta+k')
      await p.keyboard.type('把这周的作业排好')
      await p.locator('.pal .pr.on').waitFor()
    },
  })
  await shot('8-settings-a', {
    frame: 'a',
    prep: async (p) => {
      await p.locator('.ab[data-k="settings"]').click()
      await p.locator('.set.set-tab').waitFor()
    },
  })
})
