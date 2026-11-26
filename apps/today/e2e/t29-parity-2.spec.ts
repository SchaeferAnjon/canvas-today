/**
 * 画布今日对标画布笔记第二批（AI 对话框那几项，对标清单页 161 的 U1、U2、U3、U4、U10、U11）：一律真点、真打字、真按键。
 * 假 AI：排日程那一路用画布今日自己的（CT_AI_FAKE=1，shared/ai-chat.ts 的 fakeChatAnswer），动手那一路用画布笔记的假引擎（CN_AI_FAKE=1 + 步骤稿）。
 */
import { expect, type Page, test } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commits, launch, row } from './app'

const AI = { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '300' }
const panel = (page: Page) => page.locator('[data-part="AI 对话"]')
const box = (page: Page) => panel(page).locator('[data-testid="ai-input"] textarea')
const dlg = (p: Page) => p.getByRole('dialog', { name: '设置' })
async function openAi(page: Page) {
  await page.locator('.abar.r .ab[data-k="ai"]').click()
  await expect(panel(page)).toBeVisible()
}
async function say(page: Page, text: string) {
  await box(page).fill(text)
  await box(page).press('Enter')
}

test('U1 @ 点名清单：打「@小论」出候选，Tab 选成胶囊（回车不发送），发出去那条也是胶囊；AI 拿到那一篇（两周以外的待办也排得动）；点胶囊中间换到那一篇', async () => {
  const run = await launch({ env: AI })
  const { page } = run
  try {
    await openAi(page)
    const ta = box(page)
    await ta.click()
    await page.keyboard.type('把 @小论')
    const menu = page.locator('.at-menu, [data-testid="at-menu"]').first()
    await expect(menu).toBeVisible()
    await expect(menu).toContainText('小论文计划')
    await expect(menu).toContainText('写作 · 4条待办')
    await page.keyboard.press('Tab')
    await expect(ta).toHaveValue('把 @小论文计划 ')
    await expect(panel(page).locator('[data-testid="ai-input"] .mlayer.paint .mchip-in')).toHaveText('@小论文计划')
    await page.keyboard.type('排进下周')
    await page.keyboard.press('Enter')
    const u = panel(page).locator('.aim-u').last()
    await expect(u.getByTestId('mention-chip')).toHaveText('小论文计划')
    const a = panel(page).locator('.aim-a').last()
    await expect(a.locator('.txt')).toContainText('《小论文计划》里的')
    // 改动卡里有「改摘要」（没写日子、不在近两周里，靠点名才排得动）
    await expect(a.locator('[data-part="改动卡"]')).toContainText('改摘要')
    // 点发出去那条里的胶囊：中间换到那一篇清单
    await u.getByTestId('mention-chip').click()
    await expect(page.locator('.center .vhead h1')).toHaveText('小论文计划')
  } finally {
    await run.close()
  }
})

test('U2 回答下面那排：拷贝（显示出来的字，变成「已拷贝」）、⋯ 里拷贝为 Markdown；最新那条一直露着', async () => {
  const run = await launch({ env: AI })
  const { page, app } = run
  try {
    await openAi(page)
    await say(page, '（测试：Markdown）')
    const a = panel(page).locator('.aim-a').last()
    const bar = a.getByTestId('ai-ans-acts')
    await expect(bar).toBeVisible()
    await bar.getByRole('button', { name: '拷贝' }).click()
    await expect(bar).toContainText('已拷贝')
    const clip = () => app.evaluate(({ clipboard }) => clipboard.readText())
    await expect.poll(clip).toContain('先做这两条')
    expect(await clip()).not.toContain('**')
    await bar.getByRole('button', { name: '这条回答还能做什么' }).click()
    await page.getByRole('menuitem', { name: '拷贝为 Markdown' }).click()
    await expect.poll(clip).toContain('**先做**')
  } finally {
    await run.close()
  }
})

test('U3 对话菜单：正开着的新对话在最上面；「全部对话…」按哪天归组、能搜，回车回到那一段', async () => {
  const run = await launch({ env: AI })
  const { page } = run
  try {
    await openAi(page)
    await say(page, '帮我把收件箱按优先级排好')
    await expect(panel(page).locator('.aim-a')).toHaveCount(1)
    await panel(page).getByRole('button', { name: '新对话' }).click()
    await say(page, '明天太满了，帮我挪一挪')
    await expect(panel(page).locator('.aim-a')).toHaveCount(1)
    await panel(page).getByRole('button', { name: '新对话' }).click()
    // 菜单：开着的新对话（还没问）勾着在最上面，下面两段
    await panel(page).locator('.aim-h .ttl').click()
    const m = panel(page).locator('.aim-menu')
    await expect(m.getByTestId('ai-chat-fresh')).toHaveAttribute('aria-checked', 'true')
    await expect(m.getByTestId('ai-chat-row')).toHaveCount(2)
    await m.getByRole('menuitem', { name: '全部对话…' }).click()
    await expect(m.getByTestId('ai-all-group')).toHaveCount(1)
    await expect(m.locator('.gh')).toContainText('今天')
    await expect(m.locator('.gh')).toContainText('2段')
    await m.getByRole('searchbox', { name: '搜对话' }).fill('优先级')
    await expect(m.getByTestId('ai-chat-row')).toHaveCount(1)
    await m.getByRole('searchbox', { name: '搜对话' }).press('Enter')
    await expect(panel(page).locator('.aim-h .ttl')).toContainText('把收件箱按优先级')
    await expect(panel(page).locator('.aim-u')).toHaveText(['帮我把收件箱按优先级排好'])
    // 搜不到
    await panel(page).locator('.aim-h .ttl').click()
    await m.getByRole('menuitem', { name: '全部对话…' }).click()
    await m.getByRole('searchbox', { name: '搜对话' }).fill('没有这种xyz')
    await expect(m.locator('.none')).toHaveText('没搜到')
  } finally {
    await run.close()
  }
})

test('U4 设置 › AI：自己选右栏对话、小活用哪一家；选了记在画布今日的设置里，右图标栏跟着换；选「跟画布笔记」回到跟着', async () => {
  const run = await launch({ env: AI })
  const { page } = run
  try {
    await page.keyboard.press('Meta+,')
    await dlg(page).getByRole('button', { name: 'AI', exact: true }).click()
    const chat = dlg(page).locator('[data-row="aiChat"]')
    await expect(chat.getByTestId('ai-pick-chat')).toBeVisible()
    await expect(dlg(page).locator('[data-row="aiFollow"]').getByTestId('ai-pick-quick')).toBeVisible()
    await chat.getByTestId('ai-pick-chat').click()
    await page.locator('.aipk-menu').getByRole('menuitemradio', { name: /Codex/ }).click()
    await expect(chat.getByTestId('ai-pick-chat')).toContainText('Codex')
    await expect(chat).toContainText('画布今日自己选的')
    await expect.poll(() => JSON.parse(run.read('../user-data/settings.json')).aiOwn).toEqual({ chat: { engine: 'codex' } })
    await expect(page.locator('.abar.r .ab[data-k="ai"]')).toHaveAttribute('aria-label', /Codex/)
    // 小活也换一家
    await dlg(page).locator('[data-row="aiFollow"]').getByTestId('ai-pick-quick').click()
    await page.locator('.aipk-menu').getByRole('menuitemradio', { name: /Gemini/ }).click()
    await expect.poll(() => JSON.parse(run.read('../user-data/settings.json')).aiOwn?.quick?.engine).toBe('gemini')
    // 回到跟着（有画布笔记的设置时叫「跟画布笔记」，没有叫「默认」）
    await chat.getByTestId('ai-pick-chat').click()
    await page.locator('.aipk-menu').getByRole('menuitemradio', { name: /跟画布笔记/ }).click()
    await expect.poll(() => JSON.parse(run.read('../user-data/settings.json')).aiOwn).toEqual({ quick: { engine: 'gemini' } })
    await expect(page.locator('.abar.r .ab[data-k="ai"]')).not.toHaveAttribute('aria-label', /Codex/)
  } finally {
    await run.close()
  }
})

test('U10 AI 动手改到待办：中间那一页四边亮、顶上「AI 正在改你的待办 · 停下 esc」，答完「改好了 · 改了1个文件 · 撤回」，点撤回文件回原样', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ct-act-'))
  const script = join(dir, 'script.json')
  const TODO = '- [ ] 交 2026 年的报税表 📅 2026-11-30'
  writeFileSync(
    script,
    JSON.stringify([
      {
        say: '帮我记一条报税',
        steps: [{ tool: 'note_write', args: { path: '收件箱/待办.md', text: TODO, mode: 'append' } }, { say: '在收件箱加了一条报税的待办，十一月三十日截止。我顺手看了一眼别的，没有要改的了。' }],
      },
    ]),
  )
  const run = await launch({ env: { CN_AI_FAKE: '1', CN_FAKE_SCRIPT: script, CT_COMPUTER_ROOT: dir, CN_FAKE_SAY_MS: '40' } })
  const { page } = run
  try {
    await openAi(page)
    const inbox = run.read('收件箱/待办.md')
    await say(page, '帮我记一条报税')
    const bar = page.locator('main.center [data-testid="ai-actbar"]')
    await expect(bar).toContainText('AI 正在改你的待办', { timeout: 20_000 })
    await expect(page.locator('main.center [data-testid="ai-acting"]')).toBeVisible()
    await expect(bar.getByRole('button', { name: /停下/ })).toBeVisible()
    await expect(bar).toContainText('改好了 · 改了1个文件', { timeout: 20_000 })
    expect(run.read('收件箱/待办.md')).toContain(TODO)
    await bar.getByRole('button', { name: '撤回' }).click()
    await expect.poll(() => run.read('收件箱/待办.md')).toBe(inbox)
    await expect.poll(() => commits(run.vault)[0]).toBe('撤回AI：帮我记一条报税')
    // 收起
    await expect(page.locator('main.center [data-part="AI 正在改"]')).toHaveCount(0, { timeout: 5000 })
  } finally {
    await run.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('U11 ⇧⌘F 在这一格里找：中间清单里找、几处、↵ 下一个、esc 关；点过右栏 AI 对话再按，找对话里的字', async () => {
  const run = await launch({ env: AI })
  const { page } = run
  try {
    await row(page, '读完三篇相关论文').click()
    await page.keyboard.press('Shift+Meta+f')
    const bar = page.getByTestId('find-bar')
    await expect(bar).toHaveAttribute('data-pane', 'center')
    await expect(bar.getByRole('textbox')).toBeFocused()
    await page.keyboard.type('论文')
    await expect(bar.getByTestId('find-count')).toHaveText(/^1\/\d+$/)
    const total = Number((await bar.getByTestId('find-count').textContent())!.split('/')[1])
    expect(total).toBeGreaterThan(1)
    await page.keyboard.press('Enter')
    await expect(bar.getByTestId('find-count')).toHaveText(`2/${total}`)
    await page.keyboard.press('Shift+Enter')
    await expect(bar.getByTestId('find-count')).toHaveText(`1/${total}`)
    // 没有的
    await bar.getByRole('textbox').fill('没有这种字xyz')
    await expect(bar.getByTestId('find-note')).toHaveText('没找到 · 到全库找 ⌘K')
    await page.keyboard.press('Escape')
    await expect(bar).toHaveCount(0)
    // 右栏 AI 对话
    await openAi(page)
    await say(page, '（测试：Markdown）')
    await expect(panel(page).locator('.aim-a .txt')).toContainText('补实验图')
    await panel(page).locator('.aim-a .txt').click()
    await page.keyboard.press('Shift+Meta+f')
    await expect(bar).toHaveAttribute('data-pane', 'right')
    await page.keyboard.type('补实验图')
    await expect(bar.getByTestId('find-count')).toHaveText('1/1')
  } finally {
    await run.close()
  }
})
