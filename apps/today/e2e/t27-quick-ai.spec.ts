/**
 * 全局快速输入框方案 B（页 160，用户「就选方案 B」）：Tab 在「加待办 / 问 AI」之间切（像 Raycast），贴图两种去向，问 AI 在小框里展开，⌘J 接到右栏同一段。
 * 真打字、真按 Tab / ↵ / ⌘J、真往输入框里粘一张 PNG（ClipboardEvent 带 File）：
 * - Tab 切换：左边图标、占位字、写进那一行、底栏都换；# 候选开着时 Tab 照旧是选候选
 * - 加待办时贴图：图存进写进那篇的附件文件夹（附件/收件箱/待办/截图 1.png，字节一样，和这一条一起提交），待办下一行「    > ![截图 1|240](…)」
 * - 问 AI 时贴图：图交给 AI（假 AI 记下收到 1 张、多大），回答在小框里展开；⌘J 小框收起、右栏 AI 打开同一段（问的那句带图、回答都在，对话列表只有这一段）
 * - 全能模式开着说「加个待办」真加上（画布笔记的假引擎照步骤稿 note_write，一次提交）；在小框里关掉全能模式再问：只回答，库里不变
 */
import { expect, type Page, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, type Running } from './app'
import { solidPng } from '../../notes/e2e/fixtures/png'

/** 按一次 ⌥⇧T；小框已经建好时等它真清空重写过（不然清空那一下会吃掉马上打的字） */
async function press(run: Running) {
  const qp = run.app.windows().find((w) => w.url().endsWith('/quick.html'))
  const before = qp ? await qp.locator('.qp').getAttribute('data-opens') : null
  await run.app.evaluate(() => (globalThis as unknown as { ctQuick: { press(): Promise<void> } }).ctQuick.press())
  if (qp && before !== null) await expect.poll(() => qp.locator('.qp').getAttribute('data-opens')).not.toBe(before)
}
const isOpen = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctQuick: { isOpen(): boolean } }).ctQuick.isOpen())

async function quickPage(run: Running): Promise<Page> {
  await expect.poll(() => run.app.windows().some((w) => w.url().endsWith('/quick.html'))).toBe(true)
  const p = run.app.windows().find((w) => w.url().endsWith('/quick.html'))!
  await expect(p.locator('.qp textarea')).toBeVisible()
  return p
}

const PNG = solidPng(120, 80, [70, 130, 210])

/** 往小框的输入框里真粘一张图（剪贴板里只有这张图） */
async function pasteImage(p: Page) {
  await p.evaluate(
    ([bytes]) => {
      const el = document.querySelector('.qp textarea') as HTMLTextAreaElement
      el.focus()
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(bytes as number[])], 'image.png', { type: 'image/png' }))
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    },
    [[...PNG]] as const,
  )
}

test('Tab 在「加待办」和「问 AI」之间切：左边图标、占位字、写进那一行、底栏都换；# 候选开着时 Tab 是选候选', async () => {
  const run = await launch()
  try {
    await press(run)
    const qp = await quickPage(run)
    const box = qp.locator('.qp textarea')
    await expect(qp.locator('.qp')).toHaveAttribute('data-mode', 'add')
    await expect(qp.locator('[data-part="模式"]')).toHaveAttribute('aria-label', '加待办')
    await expect(qp.locator('.qfoot')).toContainText('Tab问 AI')
    await box.press('Tab')
    await expect(qp.locator('.qp')).toHaveAttribute('data-mode', 'ai')
    await expect(qp.locator('[data-part="模式"]')).toHaveAttribute('aria-label', '问 AI')
    await expect(box).toHaveAttribute('placeholder', /^问 AI/)
    await expect(box).toBeFocused()
    await expect(qp.locator('.qdest')).toContainText('对话')
    await expect(qp.locator('.qfoot')).toContainText('Tab回到加待办')
    await expect(qp.locator('.qfoot')).toContainText('⌘J到右栏接着聊')
    await expect(qp.locator('[data-part="全能模式"]')).toBeVisible()
    // 打的字留着
    await box.pressSequentially('明天要干嘛')
    await box.press('Tab')
    await expect(qp.locator('.qp')).toHaveAttribute('data-mode', 'add')
    await expect(box).toHaveValue('明天要干嘛')
    await expect(qp.locator('.qdest')).toContainText('写进《待办》')
    // # 候选开着：Tab 选候选，不切模式
    await box.fill('')
    await box.pressSequentially('交第四章习题 #作')
    await expect(qp.locator('[data-part="候选"] [role="option"]').first()).toBeVisible()
    await box.press('Tab')
    await expect(box).toHaveValue('交第四章习题 #作业 ')
    await expect(qp.locator('.qp')).toHaveAttribute('data-mode', 'add')
  } finally {
    await run.close()
  }
})

test('加待办时贴图：图存进写进那篇的附件文件夹、和这一条一起提交，待办下一行是「> ![截图 1|240](…)」', async () => {
  const run = await launch()
  try {
    await press(run)
    const qp = await quickPage(run)
    const box = qp.locator('.qp textarea')
    await pasteImage(qp)
    const img = qp.locator('[data-part="贴的图"] .qimg')
    await expect(img).toHaveCount(1)
    await expect(img).toContainText('存成附件')
    await expect(qp.locator('.qdest')).toContainText('图存进 附件/收件箱/待办/')
    await box.pressSequentially('照这张图买零件 明天')
    await box.press('Enter')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 照这张图买零件 📅 2026-11-23\n    > ![截图 1|240](../附件/收件箱/待办/截图%201.png)\n')
    const file = join(run.vault, '附件/收件箱/待办/截图 1.png')
    expect(existsSync(file)).toBe(true)
    expect(Buffer.compare(readFileSync(file), Buffer.from(PNG))).toBe(0)
    // 图和这一条一次提交
    await expect.poll(() => execFileSync('git', ['-C', run.vault, 'log', '-1', '--name-only', '--format=%s'], { encoding: 'utf8' })).toContain('附件/收件箱/待办/截图 1.png')
    expect(await isOpen(run)).toBe(false)
    // 再贴一张、再加一条：第二张叫「截图 2」
    await press(run)
    await pasteImage(qp)
    await box.pressSequentially('第二条')
    await box.press('Enter')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 第二条\n    > ![截图 2|240](../附件/收件箱/待办/截图%202.png)\n')
  } finally {
    await run.close()
  }
})

test('问 AI 时贴图：图交给 AI（假 AI 记下收到 1 张），回答在小框里展开；⌘J 小框收起，右栏 AI 打开同一段', async () => {
  const log = join(mkdtempSync(join(tmpdir(), 'ct-quick-ai-')), 'fake.log')
  const run = await launch({ env: { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '200', CT_AI_FAKE_LOG: log } })
  try {
    // 全能模式关着（画布笔记的设置）：只回答
    mkdirSync(join(run.root, 'notes-data', 'ai'), { recursive: true })
    writeFileSync(join(run.root, 'notes-data', 'ai', 'settings.json'), JSON.stringify({ omni: false }))
    await press(run)
    const qp = await quickPage(run)
    const box = qp.locator('.qp textarea')
    await box.press('Tab')
    await expect(qp.locator('[data-part="全能模式"] [role="switch"]')).toHaveAttribute('aria-checked', 'false')
    await pasteImage(qp)
    await expect(qp.locator('[data-part="贴的图"] .qimg')).toContainText('AI 会读')
    await box.pressSequentially('这张图里是什么')
    await box.press('Enter')
    const talk = qp.locator('[data-part="小框里的对话"]')
    await expect(talk.locator('.qa-u')).toContainText('这张图里是什么')
    await expect(talk.locator('.qa-u img')).toHaveCount(1)
    await expect(talk.locator('.qa-a .txt')).toContainText('看到图 1 张', { timeout: 20_000 })
    await expect(box).toHaveValue('')
    await expect(qp.locator('[data-part="贴的图"]')).toHaveCount(0)
    // 假 AI 真收到了这张图（PNG，字节数一样）
    const asked = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { images: { mime: string; bytes: number }[] })
    expect(asked.at(-1)!.images).toEqual([{ mime: 'image/png', bytes: PNG.length }])
    expect(await isOpen(run)).toBe(true)

    // ⌘J：小框收起，右栏 AI 打开这一段
    await box.press('Meta+j')
    await expect.poll(() => isOpen(run)).toBe(false)
    const pane = run.page.locator('[data-part="AI 对话"]')
    await expect(pane).toBeVisible()
    await expect(pane.locator('.aim-u').last()).toContainText('这张图里是什么')
    await expect(pane.locator('.aim-u').last().locator('img')).toHaveCount(1)
    await expect(pane.locator('.aim-a').last()).toContainText('看到图 1 张')
    // 同一段：画布今日的对话列表里只有这一段，右栏接着问就接在后面
    const ta = pane.locator('[data-testid="ai-input"] textarea')
    await ta.fill('再说一遍')
    await ta.press('Enter')
    await expect(pane.locator('.aim-u')).toHaveCount(2, { timeout: 20_000 })
    await expect(pane.locator('.aim-a')).toHaveCount(2, { timeout: 20_000 })
    const chats = await run.page.evaluate(() => (window as unknown as { ct: { chatList(): Promise<{ id: string }[]> } }).ct.chatList())
    expect(chats).toHaveLength(1)
  } finally {
    await run.close()
    rmSync(join(log, '..'), { recursive: true, force: true })
  }
})

test('还在答时按 ⌘J：右栏打开同一段，问的那句马上在，答完回答也出现在右栏', async () => {
  const run = await launch({ env: { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '2500' } })
  try {
    mkdirSync(join(run.root, 'notes-data', 'ai'), { recursive: true })
    writeFileSync(join(run.root, 'notes-data', 'ai', 'settings.json'), JSON.stringify({ omni: false }))
    await press(run)
    const qp = await quickPage(run)
    const box = qp.locator('.qp textarea')
    await box.press('Tab')
    await box.pressSequentially('明天几点有课')
    await box.press('Enter')
    await expect(qp.locator('[data-part="小框里的对话"] .qa-run')).toBeVisible()
    await box.press('Meta+j')
    await expect.poll(() => isOpen(run)).toBe(false)
    const pane = run.page.locator('[data-part="AI 对话"]')
    await expect(pane.locator('.aim-u').last()).toContainText('明天几点有课')
    await expect(pane.locator('.aim-a').last()).toContainText('全能模式关着', { timeout: 20_000 })
    // 小框下次再问是新的一段
    await press(run)
    await expect(qp.locator('.qp')).toHaveAttribute('data-mode', 'add')
    await expect(qp.locator('[data-part="小框里的对话"]')).toHaveCount(0)
  } finally {
    await run.close()
  }
})

test('全能模式开着说「加个待办」真加上；在小框里关掉全能模式再问：只回答，库里不变', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ct-quick-omni-'))
  const script = join(dir, 'script.json')
  const LINE = '- [ ] 交报告 📅 2026-11-23 15:00'
  writeFileSync(script, JSON.stringify([{ say: '明天下午三点交报告', steps: [{ tool: 'note_write', args: { path: '收件箱/待办.md', text: LINE, mode: 'append' } }, { say: '加好了：明天 15:00 交报告，在收件箱。' }] }]))
  const run = await launch({ env: { CN_AI_FAKE: '1', CN_FAKE_SCRIPT: script, CN_FAKE_SAY_MS: '5', CT_COMPUTER_ROOT: dir } })
  try {
    await press(run)
    const qp = await quickPage(run)
    const box = qp.locator('.qp textarea')
    await box.press('Tab')
    const sw = qp.locator('[data-part="全能模式"] [role="switch"]')
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await box.pressSequentially('明天下午三点交报告加个待办')
    await box.press('Enter')
    const talk = qp.locator('[data-part="小框里的对话"]')
    await expect(talk.locator('.qa-a .txt').last()).toContainText('加好了', { timeout: 30_000 })
    await expect(talk.locator('[data-part="这一轮的改动"]')).toBeVisible()
    await expect.poll(() => run.read('收件箱/待办.md')).toContain(LINE)
    const before = run.read('收件箱/待办.md')

    // 关掉全能模式（记在画布今日自己的设置里）：同一句只回答，库里不变
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(JSON.parse(readFileSync(join(run.userData, 'settings.json'), 'utf8')).omni).toBe(false)
    await box.click()
    await box.pressSequentially('明天下午三点交报告加个待办')
    await box.press('Enter')
    await expect(talk.locator('.qa-a')).toHaveCount(2, { timeout: 30_000 })
    await expect(talk.locator('.qa-a .txt').last()).toContainText('全能模式关着')
    await qp.waitForTimeout(600)
    expect(run.read('收件箱/待办.md')).toBe(before)
    expect(before.split(LINE).length - 1).toBe(1)
  } finally {
    await run.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('全能模式开着排日程：改动卡就在小框里，收下才写进库，收下以后能撤回', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ct-quick-plan-'))
  const script = join(dir, 'script.json')
  writeFileSync(script, JSON.stringify([{ say: '排进空着的时间', steps: [{ tool: 'today_plan', args: { fake: true } }, { say: '排好了，你看一下改动卡。' }] }]))
  const run = await launch({ env: { CN_AI_FAKE: '1', CN_FAKE_SCRIPT: script, CN_FAKE_SAY_MS: '5', CT_COMPUTER_ROOT: dir } })
  try {
    await press(run)
    const qp = await quickPage(run)
    const box = qp.locator('.qp textarea')
    await box.press('Tab')
    const hw = run.read('课程/线性代数/作业.md')
    await box.pressSequentially('把这周的作业排进空着的时间')
    await box.press('Enter')
    const card = qp.locator('[data-part="小框里的对话"] [data-part="改动卡"]')
    await expect(card.locator('.ah')).toContainText('收下后一次写进库', { timeout: 30_000 })
    expect(run.read('课程/线性代数/作业.md')).toBe(hw)
    await card.getByRole('button', { name: '收下' }).click()
    await expect(card.locator('.ah')).toContainText('收下了', { timeout: 10_000 })
    await expect.poll(() => run.read('课程/线性代数/作业.md')).not.toBe(hw)
    await card.getByRole('button', { name: '撤回' }).click()
    await expect(card.locator('.ah')).toContainText('撤回了')
    await expect.poll(() => run.read('课程/线性代数/作业.md')).toBe(hw)
  } finally {
    await run.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
