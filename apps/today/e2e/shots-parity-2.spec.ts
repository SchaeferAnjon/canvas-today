/**
 * 画布今日对标第二批（AI 对话框）的交付截图（页 178）：只在给了 CT_SHOTS_PARITY2（目录）时截。
 * 同页 161 的截法：测试库、主题天青、浮岛书桌 B、背景极光，1440 × 900，测试模式无头起；假 AI。
 */
import { type Page, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, row } from './app'

const OUT = process.env.CT_SHOTS_PARITY2 ?? ''
test.skip(!OUT, '只在出截图时跑（CT_SHOTS_PARITY2=<目录>）')

const SIZE = { width: 1440, height: 900 }
const AI = { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '300' }
const file = (name: string) => (mkdirSync(OUT, { recursive: true }), join(OUT, `${name}.png`))
const panel = (p: Page) => p.locator('[data-part="AI 对话"]')
const box = (p: Page) => panel(p).locator('[data-testid="ai-input"] textarea')
const dlg = (p: Page) => p.getByRole('dialog', { name: '设置' })
const settle = (p: Page) => p.waitForTimeout(500)
async function openAi(p: Page) {
  await p.locator('.abar.r .ab[data-k="ai"]').click()
  await panel(p).waitFor()
}
async function say(p: Page, text: string) {
  await box(p).fill(text)
  await box(p).press('Enter')
}

test('1 @ 点名', async () => {
  const run = await launch({ size: SIZE, env: AI })
  const { page } = run
  try {
    await openAi(page)
    await box(page).click()
    await page.keyboard.type('把 @小论')
    await page.getByTestId('at-menu').waitFor()
    await settle(page)
    await page.screenshot({ path: file('1-at-menu') })
    await page.keyboard.press('Tab')
    await page.keyboard.type('排进下周')
    await settle(page)
    await page.screenshot({ path: file('1b-at-chip') })
    await page.keyboard.press('Enter')
    await panel(page).locator('.aim-a [data-part="改动卡"]').waitFor()
    await settle(page)
    await page.screenshot({ path: file('1c-at-sent') })
  } finally {
    await run.close()
  }
})

test('2 回答下面那排', async () => {
  const run = await launch({ size: SIZE, env: AI })
  const { page } = run
  try {
    await openAi(page)
    await say(page, '（测试：Markdown）')
    await panel(page).getByTestId('ai-ans-acts').waitFor()
    await settle(page)
    await page.screenshot({ path: file('2-ans-row') })
    await panel(page).getByTestId('ai-ans-acts').getByRole('button', { name: '这条回答还能做什么' }).click()
    await settle(page)
    await page.screenshot({ path: file('2b-ans-more') })
  } finally {
    await run.close()
  }
})

test('3 对话菜单', async () => {
  const run = await launch({ size: SIZE, env: AI })
  const { page } = run
  try {
    await openAi(page)
    for (const q of ['帮我把收件箱按优先级排好', '明天太满了，帮我挪一挪', '把论文初稿拆成几步']) {
      await say(page, q)
      await panel(page).locator('.aim-a').last().locator('.who').waitFor()
      await page.waitForTimeout(500)
      await panel(page).getByRole('button', { name: '新对话' }).click()
    }
    await panel(page).locator('.aim-h .ttl').click()
    await settle(page)
    await page.screenshot({ path: file('3-chat-menu') })
    await panel(page).locator('.aim-menu').getByRole('menuitem', { name: '全部对话…' }).click()
    await panel(page).locator('.aim-menu').getByRole('searchbox', { name: '搜对话' }).fill('排')
    await settle(page)
    await page.screenshot({ path: file('3b-chat-all') })
  } finally {
    await run.close()
  }
})

test('4 设置 › AI', async () => {
  const run = await launch({ size: SIZE, env: AI })
  const { page } = run
  try {
    await page.keyboard.press('Meta+,')
    await dlg(page).getByRole('button', { name: 'AI', exact: true }).click()
    await dlg(page).getByTestId('ai-pick-chat').click()
    await page.locator('.aipk-menu').getByRole('menuitemradio', { name: /Codex/ }).click()
    await settle(page)
    await page.screenshot({ path: file('4-settings-ai') })
    await dlg(page).getByTestId('ai-pick-quick').click()
    await settle(page)
    await page.screenshot({ path: file('4b-settings-ai-menu') })
  } finally {
    await run.close()
  }
})

test('5 AI 动手亮边', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ct-act-'))
  const script = join(dir, 'script.json')
  writeFileSync(
    script,
    JSON.stringify([
      {
        say: '帮我记一条报税',
        steps: [{ tool: 'note_write', args: { path: '收件箱/待办.md', text: '- [ ] 交 2026 年的报税表 📅 2026-11-22', mode: 'append' } }, { say: '在收件箱加了一条报税的待办，今天截止。我顺手看了一眼别的待办，没有要改的了，你看一下今天这一页。' }],
      },
    ]),
  )
  const run = await launch({ size: SIZE, env: { CN_AI_FAKE: '1', CN_FAKE_SCRIPT: script, CT_COMPUTER_ROOT: dir, CN_FAKE_SAY_MS: '150' } })
  const { page } = run
  try {
    await openAi(page)
    await say(page, '帮我记一条报税')
    const bar = page.locator('main.center [data-testid="ai-actbar"]')
    await bar.getByRole('button', { name: /停下/ }).waitFor({ timeout: 20_000 })
    await page.waitForTimeout(450)
    await page.screenshot({ path: file('5-act-run') })
    await bar.filter({ hasText: '改好了' }).waitFor({ timeout: 20_000 })
    await page.waitForTimeout(150)
    await page.screenshot({ path: file('5b-act-done') })
  } finally {
    await run.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('6 ⇧⌘F 在这一格里找', async () => {
  const run = await launch({ size: SIZE, env: AI })
  const { page } = run
  try {
    await row(page, '读完三篇相关论文').click()
    await page.keyboard.press('Shift+Meta+f')
    await page.keyboard.type('论文')
    await page.keyboard.press('Enter')
    await settle(page)
    await page.screenshot({ path: file('6-find-center') })
    await page.keyboard.press('Escape')
    await openAi(page)
    await say(page, '（测试：Markdown）')
    await panel(page).locator('.aim-a .txt').click()
    await page.keyboard.press('Shift+Meta+f')
    await page.keyboard.type('实验')
    await settle(page)
    await page.screenshot({ path: file('6b-find-right') })
  } finally {
    await run.close()
  }
})
