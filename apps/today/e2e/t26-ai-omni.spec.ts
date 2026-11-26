/**
 * 右栏 AI 的全能模式（2026-11-25 用户：「打开这个功能」）：画布今日用画布笔记的 agent 跑，假引擎用画布笔记那套（CN_AI_FAKE=1，fake-engine.ts），
 * 每一问照 CN_FAKE_SCRIPT 写好的步骤真调工具、真读文件、真搜「整台电脑」（测试给的临时目录，CT_COMPUTER_ROOT，不碰真 home）。真点一遍：
 * - 全能开着问用户原话：步骤里读了整个库的待办、读了两周以外的笔记、搜了库外那个目录，新建了一条待办（文件多一行、一次提交），撤回回原样
 * - 删除类命令也不问（和画布笔记 Mac 桌面一样，2026-11-25 偏好「桌面全能模式不问」）：直接删、一次提交、能撤回；先问的只有画布笔记手机远程
 * - 全能关着同一句：读整个库、能新建待办，说清库外看不了；开关默认跟画布笔记的设置，画布今日里切了记在自己的设置里
 * - 排日程那句仍出改动卡 + 日历预览，收下才写
 */
import { expect, type Page, test } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commits, launch, row } from './app'
import { CAL_SEED, VAULT } from './fixtures'
import { solidPng } from '../../notes/e2e/fixtures/png'

const ASK = '我总感觉我有什么没做，你从我的生活学习工作三方面给我找一下，找整个电脑'
const OLD = '生活/搬家清单.md'
const FILES = {
  ...VAULT,
  // 两周以外的事（12 月 20 日）和一篇不在「近两周」里的笔记
  [OLD]: '# 搬家清单\n\n房东说年底前要交还钥匙。\n\n- [ ] 找房东退押金 📅 2026-12-20\n- [ ] 改银行卡上的地址\n',
  '写作/旧草稿.md': '# 旧草稿\n\n没用了。\n',
}
const NEW_TODO = '- [ ] 交 2026 年的报税表 📅 2026-11-30'

/** 假的「整台电脑」：库外的一个临时目录，里面一个写着还没做的事的文件 */
function fakeComputer(): { dir: string; script: string; done(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'ct-omni-mac-'))
  mkdirSync(join(dir, 'Documents'), { recursive: true })
  writeFileSync(join(dir, 'Documents', '报税提醒.txt'), '2026 年的报税表还没交，11 月 30 日截止。\n')
  // 步骤稿放在「整台电脑」外面（不然搜的时候连它也搜到）
  const script = join(mkdtempSync(join(tmpdir(), 'ct-omni-script-')), 'script.json')
  writeFileSync(
    script,
    JSON.stringify([
      {
        say: '我总感觉我有什么没做',
        steps: [
          { tool: 'today_tasks', args: {} },
          { read: OLD },
          { grep: dir, pattern: '还没交', when: 'omni' },
          { tool: 'note_write', args: { path: '收件箱/待办.md', text: NEW_TODO, mode: 'append' } },
          { say: '生活上：搬家清单里退押金在 12 月 20 日，还没做。学习上：ecp 作业 2 过期了。工作上：周报今晚要写。', when: 'omni' },
          { say: '电脑里找到 {found}：报税表还没交，我在收件箱加了一条。', when: 'omni' },
          { say: '生活上：搬家清单里退押金在 12 月 20 日，还没做。全能模式关着，库外的文件我看不了；要找整个电脑，请在输入框下面打开「全能模式」。我在收件箱加了一条报税的提醒。', when: 'off' },
        ],
      },
      { say: '删掉旧草稿', steps: [{ bash: 'rm 写作/旧草稿.md', when: 'omni' }, { say: '好了。' }] },
      { say: '排进空着的时间', steps: [{ tool: 'today_plan', args: { fake: true } }, { say: '排好了，你看一下改动卡。' }] },
    ]),
  )
  return { dir, script, done: () => [dir, join(script, '..')].forEach((d) => rmSync(d, { recursive: true, force: true })) }
}

const panel = (page: Page) => page.locator('[data-part="AI 对话"]')
async function openAi(page: Page) {
  await page.locator('.abar.r .ab[data-k="ai"]').click()
  await expect(panel(page)).toBeVisible()
}
async function say(page: Page, text: string) {
  const ta = panel(page).locator('[data-testid="ai-input"] textarea')
  await ta.fill(text)
  await ta.press('Enter')
}
const env = (c: { dir: string; script: string }) => ({ CN_AI_FAKE: '1', CN_FAKE_SCRIPT: c.script, CT_COMPUTER_ROOT: c.dir, CN_FAKE_SAY_MS: '5' })

test('全能开着问「找整个电脑」：读整个库、读两周以外的笔记、搜库外目录、新建一条待办（一次提交），撤回回原样', async () => {
  const c = fakeComputer()
  const run = await launch({ files: FILES, env: env(c) })
  try {
    const { page } = run
    await openAi(page)
    const p = panel(page)
    // 默认开着（画布笔记没设过）：开关、头上那一行、看得到「整个库」「整台电脑」
    const sw = p.getByRole('switch', { name: '全能模式' })
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await expect(p.locator('.ai-omni .say')).toHaveText('能读写这台Mac上的文件、跑命令、上网')
    await expect(p.locator('.aim-can')).toHaveText('能动手：整台电脑')
    await expect(p.locator('[data-see="vault"]')).toHaveText('整个库')
    await expect(p.locator('[data-see="mac"]')).toHaveText('整台电脑')
    const inbox = run.read('收件箱/待办.md')
    const before = commits(run.vault).length

    await say(page, ASK)
    const a = p.locator('.aim-a').last()
    await expect(a.locator('[data-part="这一轮的改动"]')).toBeVisible({ timeout: 30_000 })
    // 步骤：读整个库的待办、读两周以外的那篇、在库外那个目录里搜、往收件箱加一行
    const steps = a.locator('[data-testid="ai-step"]')
    await expect(steps).toHaveText([/^读整个库的待办$/, /^读《搬家清单》$/, new RegExp(`^搜「还没交」.*${c.dir.split('/').pop()}`), /^在《待办》末尾加/])
    await expect(a.locator('[data-testid="ai-step"].ok')).toHaveCount(4)
    await expect(a.locator('.txt')).toContainText('电脑里找到 报税提醒.txt：')
    // 文件里多一行（包在 AI 块里），一次提交
    const now = run.read('收件箱/待办.md')
    expect(now.startsWith(inbox.trimEnd())).toBe(true)
    expect(now).toContain(NEW_TODO)
    const log = commits(run.vault)
    expect(log.length).toBe(before + 1)
    expect(log[0]).toBe(`AI：${ASK}`)
    await expect(a.locator('[data-part="这一轮的改动"] .ah')).toContainText('改了1个文件一次提交 · 能撤回')
    await expect(a.locator('.ct-files li')).toHaveText(['改收件箱/待办.md'])
    // 中间的清单里看得到这一条
    await page.locator('.nav[data-k="all"]').click()
    await expect(row(page, '交 2026 年的报税表')).toBeVisible()

    // 撤回：文件回原样，再一次提交
    await a.locator('[data-part="这一轮的改动"]').getByRole('button', { name: '撤回' }).click()
    await expect(a.locator('[data-part="这一轮的改动"]')).toContainText('撤回了：1个文件改回原样')
    await expect.poll(() => run.read('收件箱/待办.md')).toBe(inbox)
    expect(commits(run.vault)[0]).toBe(`撤回AI：${ASK}`)
    await expect(row(page, '交 2026 年的报税表')).toHaveCount(0)
    await page.screenshot({ path: join(process.env.CT_SHOTS ?? tmpdir(), 'omni-undo.png') })
  } finally {
    await run.close()
    c.done()
  }
})

test('删除类命令也不问（同画布笔记 Mac 桌面）：直接删、没有点头的按钮，一次提交，能撤回', async () => {
  const c = fakeComputer()
  const run = await launch({ files: FILES, env: env(c) })
  try {
    const { page } = run
    await openAi(page)
    const p = panel(page)
    const before = commits(run.vault).length
    await say(page, '删掉旧草稿')
    const a = p.locator('.aim-a').last()
    await expect(a.locator('[data-part="这一轮的改动"]')).toBeVisible({ timeout: 30_000 })
    // 没停下来问：没有「等你点头」、没有两颗按钮，步骤行直接做完
    await expect(p.locator('[data-part="等你点头"]')).toHaveCount(0)
    await expect(p.locator('[data-testid="ai-step"].ask')).toHaveCount(0)
    await expect(a.locator('[data-testid="ai-step"]')).toHaveText([/rm 写作\/旧草稿\.md/])
    await expect(a.locator('[data-testid="ai-step"].ok')).toHaveCount(1)
    await expect(a.locator('.txt')).toContainText('好了。')
    expect(existsSync(join(run.vault, '写作/旧草稿.md'))).toBe(false)
    await expect(a.locator('.ct-files li')).toHaveText(['删写作/旧草稿.md'])
    expect(commits(run.vault).length).toBe(before + 1)
    await page.screenshot({ path: join(process.env.CT_SHOTS ?? tmpdir(), 'omni-delete-no-ask.png') })
    await a.locator('[data-part="这一轮的改动"]').getByRole('button', { name: '撤回' }).click()
    await expect.poll(() => existsSync(join(run.vault, '写作/旧草稿.md'))).toBe(true)
  } finally {
    await run.close()
    c.done()
  }
})

test('别家也全能：AI 对话选 Codex 时开关开着、头上写整台电脑，删除同样不问、直接删', async () => {
  const c = fakeComputer()
  const run = await launch({ files: FILES, env: env(c) })
  try {
    // 画布笔记 设置 › AI「AI 对话」那一行选的是 Codex（以前别家开着也只在库里）
    const notesAi = join(run.root, 'notes-data', 'ai')
    mkdirSync(notesAi, { recursive: true })
    writeFileSync(join(notesAi, 'settings.json'), JSON.stringify({ engine: 'codex' }))
    const { page } = run
    await openAi(page)
    const p = panel(page)
    await expect(p.getByRole('switch', { name: '全能模式' })).toHaveAttribute('aria-checked', 'true')
    await expect(p.locator('.ai-omni .say')).toHaveText('能读写这台Mac上的文件、跑命令、上网')
    await expect(p.locator('.aim-can')).toHaveText('能动手：整台电脑')
    await say(page, '删掉旧草稿')
    await expect(p.locator('.aim-a').last().locator('[data-part="这一轮的改动"]')).toBeVisible({ timeout: 30_000 })
    await expect(p.locator('[data-part="等你点头"]')).toHaveCount(0)
    expect(existsSync(join(run.vault, '写作/旧草稿.md'))).toBe(false)
  } finally {
    await run.close()
    c.done()
  }
})

test('全能关着（跟画布笔记的设置）：同一句读整个库、新建待办、说清库外看不了；在画布今日里打开记在自己的设置里', async () => {
  const c = fakeComputer()
  // 画布笔记 设置 › AI 里关了全能模式：画布今日默认跟它
  const run = await launch({ files: FILES, env: env(c) })
  const notesAi = join(run.root, 'notes-data', 'ai')
  try {
    mkdirSync(notesAi, { recursive: true })
    writeFileSync(join(notesAi, 'settings.json'), JSON.stringify({ omni: false }))
    const { page } = run
    await openAi(page)
    const p = panel(page)
    const sw = p.getByRole('switch', { name: '全能模式' })
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await expect(p.locator('.ai-omni .say')).toHaveText('关着：只在库里读和改待办、笔记')
    await expect(p.locator('.aim-can')).toHaveText('能动手：只在库里（待办、笔记）')
    await expect(p.locator('[data-see="vault"]')).toHaveText('整个库')
    await expect(p.locator('[data-see="mac"]')).toHaveCount(0)

    await say(page, ASK)
    const a = p.locator('.aim-a').last()
    await expect(a.locator('[data-part="这一轮的改动"]')).toBeVisible({ timeout: 30_000 })
    // 没搜库外：只有读库、读那篇、加一行
    await expect(a.locator('[data-testid="ai-step"]')).toHaveText([/^读整个库的待办$/, /^读《搬家清单》$/, /^在《待办》末尾加/])
    await expect(a.locator('.txt')).toContainText('库外的文件我看不了')
    expect(run.read('收件箱/待办.md')).toContain(NEW_TODO)

    // 在画布今日里打开：记在画布今日自己的设置里，画布笔记那份不动
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await expect(p.locator('.aim-can')).toHaveText('能动手：整台电脑')
    expect(JSON.parse(readFileSync(join(run.userData, 'settings.json'), 'utf8')).omni).toBe(true)
    expect(JSON.parse(readFileSync(join(notesAi, 'settings.json'), 'utf8')).omni).toBe(false)
  } finally {
    await run.close()
    c.done()
  }
})

test('排日程那句仍出改动卡和日历预览，收下才写', async () => {
  const c = fakeComputer()
  const run = await launch({ files: FILES, env: env(c), reminders: { ...CAL_SEED, calAuth: 'full' }, settings: { calendar: { show: true } } })
  try {
    const { page } = run
    await page.locator('.ab[data-k="calendar"]').click()
    await openAi(page)
    const p = panel(page)
    const hw = run.read('课程/线性代数/作业.md')
    await say(page, '把这周的作业排进空着的时间')
    const card = p.locator('[data-part="改动卡"]').last()
    await expect(card.locator('.ah')).toContainText('收下后一次写进库', { timeout: 30_000 })
    await expect(p.locator('[data-testid="ai-step"]')).toHaveText([/^出改动卡：\d+ 条$/])
    await expect(page.locator('.cal-blk.ghost').first()).toBeVisible()
    // 还没写，也没有这一轮的提交
    expect(run.read('课程/线性代数/作业.md')).toBe(hw)
    await expect(p.locator('[data-part="这一轮的改动"]')).toHaveCount(0)
    await card.getByRole('button', { name: '收下' }).click()
    await expect(page.locator('.toast')).toContainText('都写进了笔记，一次提交')
    await expect.poll(() => run.read('课程/线性代数/作业.md')).not.toBe(hw)
  } finally {
    await run.close()
    c.done()
  }
})

test('全能模式下带图问：图交到画布笔记的 agent（假引擎答「图 1 张」），发出去那条带缩略图', async () => {
  const c = fakeComputer()
  const run = await launch({ files: FILES, env: env(c) })
  try {
    const { page } = run
    await openAi(page)
    const p = panel(page)
    const ta = p.locator('[data-testid="ai-input"] textarea')
    await page.evaluate(
      ([bytes]) => {
        const el = document.querySelector('[data-part="AI 对话"] [data-testid="ai-input"] textarea') as HTMLTextAreaElement
        el.focus()
        const dt = new DataTransfer()
        dt.items.add(new File([new Uint8Array(bytes as number[])], 'image.png', { type: 'image/png' }))
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      },
      [[...solidPng(120, 80, [70, 130, 210])]] as const,
    )
    // 缩略图出来（存进 pasted/ 了）再打字发
    await expect(p.getByTestId('ai-mat')).toHaveCount(1)
    await ta.fill('这张图里是什么')
    await ta.press('Enter')
    const a = p.locator('.aim-a').last()
    await expect(a.locator('.txt')).toContainText('这是测试回答（Claude Code，图 1 张', { timeout: 30_000 })
    await expect(p.locator('.aim-u').last().locator('img')).toHaveCount(1)
  } finally {
    await run.close()
    c.done()
  }
})
