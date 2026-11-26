/**
 * 交付页的截图：右栏 AI 全能模式（2026-11-25）。只在给了 CT_SHOTS_OMNI（目录）时截。薄荷、深湖各一套：
 * 开关和头上那一行、全能时的步骤和新建待办后的撤回条、删除不问直接删（桌面全能模式不问）、关着时的说明。真点出来的（画布笔记的假引擎照稿子走），不画假的。
 */
import { expect, type Page, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, LOOK } from './app'
import { VAULT } from './fixtures'

const OUT = process.env.CT_SHOTS_OMNI ?? ''
test.skip(!OUT, '只在出交付图时跑（CT_SHOTS_OMNI=<目录>）')

const W = 1420
const H = 799
const ASK = '我总感觉我有什么没做，你从我的生活学习工作三方面给我找一下，找整个电脑'
const FILES = {
  ...VAULT,
  '生活/搬家清单.md': '# 搬家清单\n\n房东说年底前要交还钥匙。\n\n- [ ] 找房东退押金 📅 2026-12-20\n- [ ] 改银行卡上的地址\n',
  '写作/旧草稿.md': '# 旧草稿\n\n没用了。\n',
}

function setup() {
  const mac = mkdtempSync(join(tmpdir(), 'ct-shot-mac-'))
  mkdirSync(join(mac, 'Documents'), { recursive: true })
  writeFileSync(join(mac, 'Documents', '报税提醒.txt'), '2026 年的报税表还没交，11 月 30 日截止。\n')
  const sdir = mkdtempSync(join(tmpdir(), 'ct-shot-script-'))
  const script = join(sdir, 'script.json')
  writeFileSync(
    script,
    JSON.stringify([
      {
        say: '我总感觉我有什么没做',
        steps: [
          { tool: 'today_tasks', args: {} },
          { read: '生活/搬家清单.md' },
          { grep: mac, pattern: '还没交', when: 'omni' },
          { tool: 'note_write', args: { path: '收件箱/待办.md', text: '- [ ] 交 2026 年的报税表 📅 2026-11-30', mode: 'append' }, when: 'omni' },
          { tool: 'note_write', args: { path: '收件箱/待办.md', text: '- [ ] 给「改银行卡上的地址」定个日子 📅 2026-11-28', mode: 'append' }, when: 'off' },
          { say: '生活：搬家清单里「找房东退押金」排在 12 月 20 日，「改银行卡上的地址」还没定日子。\n学习：ecp 作业 2 昨晚 23:59 到期，还没勾掉。\n工作：「写第一批交回」今天 18:00。\n电脑里：{found} 写着 2026 年的报税表还没交（11 月 30 日截止），我在收件箱加了一条。', when: 'omni' },
          { say: '生活：搬家清单里「找房东退押金」排在 12 月 20 日，「改银行卡上的地址」还没定日子。\n学习：ecp 作业 2 昨晚 23:59 到期，还没勾掉。\n工作：「写第一批交回」今天 18:00。\n全能模式关着，库外的文件我看不了；要找整个电脑，请在输入框下面打开「全能模式」再问一次。改银行卡地址那条我在收件箱加了个提醒。', when: 'off' },
        ],
      },
      { say: '删掉旧草稿', steps: [{ bash: 'rm 写作/旧草稿.md', when: 'omni' }, { say: '好了。' }] },
    ]),
  )
  return { mac, script, done: () => [mac, sdir].forEach((d) => rmSync(d, { recursive: true, force: true })) }
}

async function shot(name: string, skin: 'mint' | 'petrol', o: { off?: boolean; engine?: string; prep: (p: Page) => Promise<void> }) {
  const s = setup()
  const run = await launch({ files: FILES, env: { CN_AI_FAKE: '1', CN_FAKE_SCRIPT: s.script, CT_COMPUTER_ROOT: s.mac, CN_FAKE_SAY_MS: '5' }, settings: { ...LOOK('sky', 'b'), appearance: { followSystem: false, skin, day: 'mint', night: 'petrol', frame: 'b', winBg: 'aurora' }, ...(o.off ? { omni: false } : {}) }, size: { width: W, height: H } })
  try {
    await run.app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w as number, h as number), [W, H] as const)
    // 画布笔记 设置 › AI「AI 对话」那一行选的那家（各家引擎危险步骤检查：Codex 也全能）
    if (o.engine) {
      mkdirSync(join(run.root, 'notes-data', 'ai'), { recursive: true })
      writeFileSync(join(run.root, 'notes-data', 'ai', 'settings.json'), JSON.stringify({ engine: o.engine }))
    }
    await run.page.locator('.abar.r .ab[data-k="ai"]').click()
    await o.prep(run.page)
    await run.page.mouse.move(700, 790)
    await run.page.waitForTimeout(400)
    mkdirSync(OUT, { recursive: true })
    const b64 = await run.app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString('base64'))
    writeFileSync(join(OUT, `${name}-${skin}.png`), Buffer.from(b64, 'base64'))
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
    }, ['.ai-omni', '.aim-can', '.aim-see', '[data-testid="ai-step"]', '[data-part="这一轮的改动"]', '.aim-a .txt'])
    writeFileSync(join(OUT, `${name}-${skin}.json`), JSON.stringify(rects))
  } finally {
    await run.close()
    s.done()
  }
}

const panel = (p: Page) => p.locator('[data-part="AI 对话"]')
async function ask(p: Page, text: string) {
  const ta = panel(p).locator('[data-testid="ai-input"] textarea')
  await ta.fill(text)
  await ta.press('Enter')
}

for (const skin of ['mint', 'petrol'] as const) {
  test(`开关和头上那一行 ${skin}`, async () => {
    await shot('1-开关', skin, { prep: async (p) => void (await expect(panel(p).getByRole('switch', { name: '全能模式' })).toBeVisible()) })
  })
  test(`全能：步骤和新建待办后的撤回条 ${skin}`, async () => {
    await shot('2-全能步骤', skin, {
      prep: async (p) => {
        await ask(p, ASK)
        await expect(panel(p).locator('[data-part="这一轮的改动"]')).toBeVisible({ timeout: 60_000 })
      },
    })
  })
  test(`删除不问、直接删 ${skin}`, async () => {
    await shot('3-删除不问', skin, {
      prep: async (p) => {
        await ask(p, '删掉旧草稿')
        await expect(panel(p).locator('[data-part="这一轮的改动"]')).toBeVisible({ timeout: 60_000 })
      },
    })
  })
  test(`关着时的说明 ${skin}`, async () => {
    await shot('4-关着', skin, {
      off: true,
      prep: async (p) => {
        await ask(p, ASK)
        await expect(panel(p).locator('.aim-a .txt')).toContainText('库外的文件我看不了', { timeout: 60_000 })
        await expect(panel(p).locator('[data-part="这一轮的改动"]')).toBeVisible({ timeout: 60_000 })
      },
    })
  })
}

// AI 对话选的是 Codex 时也全能，删除同样不问
for (const skin of ['mint', 'petrol'] as const) {
  test(`Codex：开关和头上那一行 ${skin}`, async () => {
    await shot('5-codex开关', skin, { engine: 'codex', prep: async (p) => void (await expect(panel(p).getByRole('switch', { name: '全能模式' })).toBeVisible()) })
  })
  test(`Codex：删除不问 ${skin}`, async () => {
    await shot('6-codex删除不问', skin, {
      engine: 'codex',
      prep: async (p) => {
        await ask(p, '删掉旧草稿')
        await expect(panel(p).locator('[data-part="这一轮的改动"]').or(panel(p).locator('.aim-a .txt'))).toBeVisible({ timeout: 60_000 })
        await p.waitForTimeout(600)
      },
    })
  })
}
