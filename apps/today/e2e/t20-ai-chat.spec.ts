/**
 * 右栏 AI 对话（task-ykkoz，设计稿 32-今日AI排日程「按推荐来」）：假 AI（CT_AI_FAKE=1，shared/ai-chat.ts 的 fakeChatAnswer）真点一遍：
 * 右图标栏开对话、AI 改钟点（日历虚线框）/ 日子（清单上的标记）/ 优先级（四象限上的标记）/ 拆小步，收下一次提交、撤销、不要；
 * 对话存在画布笔记的对话目录里（重开还在）；⌘K「问 AI：…」；输入框里换一家只管这一段；隐藏的系统日历不算；A 风格设置是中间标签。
 */
import { expect, type Page, test } from '@playwright/test'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { commits, launch, LOOK, quit, row } from './app'
import { CAL_SEED } from './fixtures'

const AI = { CT_AI_FAKE: '1', CT_AI_FAKE_MS: '400' }
const CAL = { reminders: { ...CAL_SEED, calAuth: 'full' }, settings: { calendar: { show: true } } }

const panel = (page: Page) => page.locator('[data-part="AI 对话"]')
const card = (page: Page) => panel(page).locator('[data-part="改动卡"]').last()
async function openAi(page: Page) {
  await page.locator('.abar.r .ab[data-k="ai"]').click()
  await expect(panel(page)).toBeVisible()
}
async function say(page: Page, text: string) {
  const ta = panel(page).locator('.aim-in textarea')
  await ta.fill(text)
  await ta.press('Enter')
}
/** 画布笔记的对话目录里这个库的对话（index.json 和每段的文件） */
function stored(root: string) {
  const base = join(root, 'notes-data', 'ai', 'chats')
  const dir = join(base, readdirSync(base)[0]!)
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as Record<string, { label: string; asks: number }>
  const files = readdirSync(dir)
    .filter((f) => f !== 'index.json')
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { place: string; label: string; msgs: { role: string; text: string; plan?: { state: string } }[]; pick?: { engine: string } })
  return { index, files }
}

test('排进空着的时间：右栏开对话、日历上虚线框、去掉一条的勾、收下一次提交、撤销；存在画布笔记的对话目录里，重开还在', async () => {
  let run = await launch({ ...CAL, env: AI })
  const root = run.root
  try {
    let { page } = run
    await page.locator('.ab[data-k="calendar"]').click()
    await expect(page.locator('.cal-blk.ev', { hasText: '和爸妈视频' })).toBeVisible()
    await openAi(page)
    // 右图标栏 AI 一格亮着；右栏标签是 AI；空对话：看得到几条、能动手什么、三句常用的
    await expect(page.locator('.abar.r .ab[data-k="ai"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.right .tabs .tab.on')).toHaveText('AI')
    const p = panel(page)
    await expect(p.locator('.aim-h .ttl')).toHaveText('新对话')
    await expect(p.locator('[data-see="tasks"]')).toHaveText(/^待办\d+条$/)
    await expect(p.locator('[data-see="inbox"]')).toHaveText('收件箱4条')
    await expect(p.locator('[data-see="events"]')).toHaveText('日历6个日程')
    await expect(p.locator('.aim-can')).toHaveText('能动手：改日子和钟点、优先级、拆小步')
    await expect(p.locator('.aim-empty .sug')).toHaveText(['把这周的作业排进空着的时间', '明天太满了，帮我挪一挪', '把收件箱这几条按优先级排好'])
    const hw = run.read('课程/线性代数/作业.md')
    const l06 = run.read('课程/ecp/Lecture06 笔记.md')

    await p.locator('.aim-empty .sug').first().click()
    await expect(p.locator('.aim-u')).toHaveText('把这周的作业排进空着的时间')
    await expect(p.locator('.thinking')).toBeVisible()
    await expect(p.getByRole('button', { name: '停下' })).toBeVisible()
    await expect(card(page).locator('.ah')).toContainText('想改4条收下后一次写进库')
    await expect(p.locator('.aim-a .step')).toHaveText([/^读了这两周的待办：\d+条，收件箱4条$/, '读了系统日历：和爸妈视频、组会、ecp 课……6个日程'])
    await expect(p.locator('.aim-a .who')).toContainText('Claude Code · Opus 5.5 · High')
    await expect(p.locator('.aim-h .ttl')).toHaveText('把这周的作业排进空着的时间')
    await expect(card(page).locator('.mv b')).toHaveText(['第三章习题 1–10', '推一遍链式法则', '做第 6 讲的练习', '复习特征值'])
    // 每条从什么改到什么、在哪篇
    await expect(card(page).locator('.mv', { hasText: '第三章习题' }).locator('small')).toHaveText('周二周二 10:00· 作业')
    // 牙医 10:00–11:00：做第 6 讲的练习排到 11:00
    await expect(card(page).locator('.mv', { hasText: '做第 6 讲' }).locator('small em')).toHaveText('周五 11:00')
    // 中间日历：四个虚线框（还没写进库）
    await expect(page.locator('.cal-blk.ghost')).toHaveCount(4)
    await expect(page.locator('.cal-col[data-drop="day:2026-11-27"] .cal-blk.ghost')).toContainText('做第 6 讲的练习11:00 · AI 排的')
    expect(run.read('课程/线性代数/作业.md')).toBe(hw)

    // 不要哪条：去掉勾，日历上那个虚线框跟着没了
    await card(page).getByRole('checkbox', { name: '复习特征值' }).uncheck()
    await expect(page.locator('.cal-blk.ghost')).toHaveCount(3)
    await card(page).getByRole('button', { name: '收下' }).click()
    await expect(page.locator('.toast')).toContainText('AI改了3条：都写进了笔记，一次提交')
    await expect(page.locator('.toast')).toContainText('照改动卡改了钟点')
    await expect(card(page)).toContainText('收下了：改了3条一次提交 · 能撤回')
    await expect(page.locator('.cal-blk.ghost')).toHaveCount(0)
    await expect.poll(() => run.read('课程/线性代数/作业.md')).toBe(hw.replace('第三章习题 1–10 📅 2026-11-24 ⏫', '第三章习题 1–10 📅 2026-11-24 10:00 ⏫'))
    expect(run.read('课程/ecp/Lecture06 笔记.md')).toBe(l06.replace('推一遍链式法则 📅 2026-11-26', '推一遍链式法则 📅 2026-11-26 10:00').replace('做第 6 讲的练习 📅 2026-11-27', '做第 6 讲的练习 📅 2026-11-27 11:00'))
    await expect.poll(() => commits(run.vault)[0]).toBe('画布今日：AI 改了3条（把这周的作业排进空着的时间）')
    await expect(page.locator('.cal-col[data-drop="day:2026-11-27"] .cal-blk:not(.ev):not(.ghost)', { hasText: '做第 6 讲的练习' })).toBeVisible()

    // 撤销：几篇一次全回去，卡上写撤销了
    await page.locator('.toast').getByRole('button', { name: '撤回' }).click()
    await expect.poll(() => run.read('课程/线性代数/作业.md')).toBe(hw)
    await expect.poll(() => run.read('课程/ecp/Lecture06 笔记.md')).toBe(l06)
    await expect(card(page)).toContainText('撤回了：3条改回原样')

    // 存在画布笔记的对话目录里（和画布笔记的 AI 对话同一种文件），对话菜单列得出
    const s = stored(root)
    const key = Object.keys(s.index).find((k) => k.startsWith('today:'))!
    expect(s.index[key]).toMatchObject({ label: '把这周的作业排进空着的时间', asks: 1 })
    const f = s.files.find((x) => x.place === key)!
    expect(f.msgs.map((m) => m.role)).toEqual(['user', 'ai'])
    expect(f.msgs[1]!.plan!.state).toBe('undone')

    // 重开软件：右栏 AI 还是这一段
    await quit(run)
    run = await launch({ root, env: AI })
    page = run.page
    await openAi(page)
    await expect(panel(page).locator('.aim-h .ttl')).toHaveText('把这周的作业排进空着的时间')
    await expect(panel(page).locator('.aim-u')).toHaveText('把这周的作业排进空着的时间')
    await expect(card(page)).toContainText('撤回了：3条改回原样')
    // 新对话「+」：空的；对话菜单里点回刚才那一段
    await panel(page).getByRole('button', { name: '新对话' }).click()
    await expect(panel(page).locator('.aim-empty')).toBeVisible()
    await panel(page).locator('.aim-h .ttl').click()
    await panel(page).locator('.aim-menu .it', { hasText: '把这周的作业排进空着的时间' }).click()
    await expect(panel(page).locator('.aim-u')).toHaveText('把这周的作业排进空着的时间')
  } finally {
    await run.close()
  }
})

test('明天太满了：清单上标出挪到哪天，不要就什么都不改；按优先级排：四象限标出去哪一格，收下写成 ⏫🔼🔽；拆小步：写进那一行下面', async () => {
  const run = await launch({ ...CAL, env: AI })
  const { page } = run
  try {
    await page.locator('.nav[data-k="tomorrow"]').click()
    await openAi(page)
    const tomorrowFiles = { a: run.read('阅读/杀死一只知更鸟.md'), b: run.read('项目/画布今日.md') }
    await say(page, '明天太满了，帮我挪一挪')
    await expect(card(page).locator('.mv b')).toHaveText(['和设计对一遍截图', '读第三章'])
    await expect(row(page, '读第三章').locator('.aim-mv')).toHaveText('→ 周四')
    await expect(row(page, '和设计对一遍截图').locator('.aim-mv')).toHaveText('→ 周二 10:00')
    await expect(row(page, '读第三章')).toHaveClass(/aim-hit/)
    await expect(card(page)).toContainText('有钟点的和高优先级的不动')
    // 换到日历：只改了日子的在「全天」那一行，改了钟点的是虚线框
    await page.locator('.ab[data-k="calendar"]').click()
    await expect(page.locator('.cal-allday [data-drop="allday:2026-11-26"] .cal-chip.ghost')).toHaveText('读第三章')
    await expect(page.locator('.cal-col[data-drop="day:2026-11-24"] .cal-blk.ghost')).toContainText('和设计对一遍截图')
    await page.locator('.ab[data-k="lists"]').click()
    await page.locator('.nav[data-k="tomorrow"]').click()
    await card(page).getByRole('button', { name: '不要' }).click()
    await expect(card(page)).toContainText('没要这2条，什么都没改')
    await expect(page.locator('.aim-mv')).toHaveCount(0)
    expect(run.read('阅读/杀死一只知更鸟.md')).toBe(tomorrowFiles.a)
    expect(run.read('项目/画布今日.md')).toBe(tomorrowFiles.b)

    // 按优先级排：四象限上标出去哪一格
    await page.locator('.ab[data-k="quad"]').click()
    const inbox = run.read('收件箱/待办.md')
    await say(page, '把收件箱这几条按优先级排好')
    await expect(card(page).locator('.mv b')).toHaveText(['回导师邮件', '买打印纸', '看《杀死一只知更鸟》第二章', '给猫买粮'])
    await expect(card(page).locator('.mv', { hasText: '回导师邮件' }).locator('small')).toHaveText('🔽 低⏫ 高· 收件箱/待办')
    await expect(row(page, '回导师邮件').locator('.aim-mv')).toHaveText('→ 1')
    await expect(row(page, '给猫买粮').locator('.aim-mv')).toHaveText('→ 2')
    await expect(row(page, '买打印纸').locator('.aim-mv')).toHaveText('→ 3')
    await card(page).getByRole('button', { name: '收下' }).click()
    await expect.poll(() => run.read('收件箱/待办.md')).toBe(
      inbox.replace('回导师邮件 🔽', '回导师邮件 ⏫').replace('- [ ] 买打印纸\n', '- [ ] 买打印纸 🔽\n').replace('第二章\n', '第二章 🔽\n').replace('给猫买粮\n', '给猫买粮 🔼\n'),
    )
    await expect(page.locator('.q.q1 .row', { hasText: '回导师邮件' })).toBeVisible()
    await expect.poll(() => commits(run.vault)[0]).toBe('画布今日：AI 改了4条（明天太满了，帮我挪一挪）')

    // 拆小步：清单上「+4步」，收下写进那一行下面（缩进一格的「- [ ]」）
    await page.locator('.ab[data-k="lists"]').click()
    await page.locator('.nav[data-k="list:写作/小论文计划.md"]').click()
    const paper = run.read('写作/小论文计划.md')
    await say(page, '把补实验图拆成小步')
    await expect(card(page).locator('.steps li')).toHaveText(['把三组实验结果导出成表', '画准确率曲线', '画消融对比柱状图', '图注和编号对上正文'])
    await expect(card(page).locator('.mv small em')).toHaveText('拆成4步')
    await expect(row(page, '补实验图').locator('.aim-mv')).toHaveText('+4步')
    await card(page).getByRole('button', { name: '收下' }).click()
    await expect
      .poll(() => run.read('写作/小论文计划.md'))
      .toBe(paper.replace('- [ ] 补实验图 📅 2026-11-25 🔼\n', '- [ ] 补实验图 📅 2026-11-25 🔼\n    - [ ] 把三组实验结果导出成表\n    - [ ] 画准确率曲线\n    - [ ] 画消融对比柱状图\n    - [ ] 图注和编号对上正文\n'))
  } finally {
    await run.close()
  }
})

test('⌘K：像要排日程的话第一行「问AI：…」回车直接开对话；别的话回车照旧加一条，「问AI」在搜到的后面；AI 撞日程的那条不收；出错能再试', async () => {
  const run = await launch({ ...CAL, env: AI })
  const { page } = run
  try {
    await page.keyboard.press('Meta+k')
    const pal = page.locator('.pal')
    await page.keyboard.type('把这周的作业排好')
    await expect(pal.locator('.pr').first()).toHaveText('问AI：把这周的作业排好')
    await page.keyboard.press('Enter')
    await expect(pal).toHaveCount(0)
    await expect(panel(page)).toBeVisible()
    await expect(panel(page).locator('.aim-u')).toHaveText('把这周的作业排好')
    await expect(card(page).locator('.ah')).toContainText('想改4条')

    // 别的话：第一行还是加一条，「问AI」在搜到的待办后面
    await page.keyboard.press('Meta+k')
    await page.keyboard.type('冰岛')
    await expect(pal.locator('.pr')).toHaveText([/^加一条「冰岛」/, /订冰岛租车/, '问AI：冰岛'])
    await page.keyboard.press('Escape')

    // 已经有对话时 ⌘K 开新的一段
    await page.keyboard.press('Meta+k')
    await page.keyboard.type('今天的待办放到下午（测试：撞日程）')
    await expect(pal.locator('.pr').first()).toHaveText('问AI：今天的待办放到下午（测试：撞日程）')
    await page.keyboard.press('Enter')
    await expect(panel(page).locator('.aim-u')).toHaveText('今天的待办放到下午（测试：撞日程）')
    // 排到 16:00 撞上「和爸妈视频」：软件不收，说为什么
    await expect(card(page)).toContainText('排的时间撞上「和爸妈视频」，没收')

    // 出错：说出来，能再试一次
    await say(page, '随便排排（测试：AI 出错）')
    await expect(panel(page).locator('.aerr')).toContainText('没答上：Claude Code 退出了（1）：测试用的失败')
    await expect(panel(page).locator('.aerr').getByRole('button', { name: '再试一次' })).toBeVisible()
  } finally {
    await run.close()
  }
})

test('换一家只管这一段：画布笔记设置不动、新对话回到跟设置、回到这一段还是换的那家；藏起的系统日历不算', async () => {
  const run = await launch({
    ...CAL,
    env: AI,
    prepare: (vault) => {
      const dir = join(dirname(vault), 'notes-data', 'ai')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({ engine: 'claude', prefs: { default: { engine: 'claude', model: 'claude-opus-5-5' }, features: { quick: { engine: 'claude', model: 'haiku' } } } }))
    },
  })
  const { page } = run
  const notesAi = join(run.root, 'notes-data', 'ai', 'settings.json')
  const before = readFileSync(notesAi, 'utf8')
  try {
    // 右图标栏 AI 一格：「AI 对话」那一家（不是小活）
    await expect(page.locator('.abar.r .ab[data-k="ai"]')).toHaveAttribute('aria-label', 'AI · Claude Code')
    await openAi(page)
    const p = panel(page)
    await say(page, '你好')
    await expect(p.locator('.aim-a .who').last()).toHaveText('Claude Code · Opus 5.5 · High')
    // 谁来答：四家（装在哪）
    await p.getByRole('button', { name: '谁来答' }).click()
    const menu = p.locator('.aim-in .aim-menu')
    await expect(menu.locator('.it .nm')).toHaveText(['Claude Code', 'Codex', 'Gemini', 'OpenCode', 'Claude API', 'OpenAI API', 'DeepSeek API', 'OpenRouter API'])
    await expect(menu).toContainText('跟画布笔记 设置 › AI 里「AI对话」那一行；这里换的只管这一段')
    await menu.locator('.it', { hasText: 'Codex' }).click()
    await expect(menu).toHaveCount(0)
    await say(page, '再看看')
    await expect(p.locator('.aim-a .who').last()).toContainText('Codex')
    // 画布笔记的设置没动
    expect(readFileSync(notesAi, 'utf8')).toBe(before)
    // 想多久：换一档也只记在这一段
    await p.getByRole('button', { name: '谁来答' }).click()
    await expect(menu).toContainText('这一段自己选的，只管这一段对话')
    await page.keyboard.press('Escape')
    // 新对话：回到跟设置（Claude Code）
    await p.getByRole('button', { name: '新对话' }).click()
    await say(page, '你好呀')
    await expect(p.locator('.aim-a .who').last()).toHaveText('Claude Code · Opus 5.5 · High')
    // 回到刚才那一段：还是 Codex
    await p.locator('.aim-h .ttl').click()
    await p.locator('.aim-h .aim-menu .it', { hasText: '你好' }).filter({ hasNotText: '你好呀' }).click()
    await p.getByRole('button', { name: '谁来答' }).click()
    await expect(menu.locator('.it', { hasText: 'Codex' }).locator('.ck svg')).toBeVisible()
    await menu.getByRole('menuitem', { name: '回到跟设置' }).click()
    await p.getByRole('button', { name: '谁来答' }).click()
    await expect(menu.locator('.it', { hasText: 'Claude Code' }).locator('.ck svg')).toBeVisible()
    await page.keyboard.press('Escape')
    expect(readFileSync(notesAi, 'utf8')).toBe(before)

    // 藏起「家里」：看得到的日程少了它的四个（和爸妈视频、和小林吃饭、牙医、交房租）
    await expect(p.locator('[data-see="events"]')).toHaveText('日历6个日程')
    await page.locator('.ab[data-k="calendar"]').click()
    await page.locator('[data-part="系统日历"] .calrow', { hasText: '家里' }).locator('.calsw').click()
    await expect(p.locator('[data-see="events"]')).toHaveText('日历2个日程')
    await say(page, '把这周的作业排进空着的时间')
    await expect(p.locator('.aim-a .step').last()).toHaveText('读了系统日历：组会、ecp 课2个日程')
  } finally {
    await run.close()
  }
})

test('VS Code 风格：设置开成中间一个标签，点原来那一页退到后面，再点回来，× 和 esc 关掉', async () => {
  const run = await launch({ settings: LOOK('sky', 'a') })
  const { page } = run
  try {
    await page.locator('.ab[data-k="settings"]').click()
    const tab = page.locator('.center .tabs .tab[data-k="settings"]')
    await expect(tab).toHaveClass(/on/)
    await expect(page.getByRole('dialog', { name: '设置' })).toHaveCount(0)
    const set = page.locator('.center .set.set-tab')
    await expect(set.getByRole('heading', { name: '一般' })).toBeVisible()
    await set.getByRole('navigation', { name: '设置分页' }).getByRole('button', { name: '库' }).click()
    await expect(set.locator('[data-row="vault"]')).toContainText('测试库')
    // 点「今天」那个标签：设置退到后面，标签还在
    await page.locator('.center .tabs .tab').first().click()
    await expect(page.locator('.vhead h1')).toHaveText('今天')
    await expect(tab).not.toHaveClass(/on/)
    await tab.click()
    await expect(set).toBeVisible()
    await tab.getByRole('button', { name: '关闭' }).click()
    await expect(tab).toHaveCount(0)
    await expect(page.locator('.vhead h1')).toHaveText('今天')
    // ⌘, 再开，esc 关
    await page.keyboard.press('Meta+,')
    await expect(set).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tab).toHaveCount(0)
  } finally {
    await run.close()
  }
})
