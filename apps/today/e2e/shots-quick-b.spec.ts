/**
 * 交付页截图：全局快速输入框方案 B（两种模式、贴图两种去向、小框里展开对话、⌘J 接到右栏、全能模式开关），薄荷（浅）、深湖（深）各一套。
 *   CT_QUICKB_SHOTS=<目录> npx playwright test e2e/shots-quick-b.spec.ts   （先 npx electron-vite build）
 * 不给就跳过。小框用 webContents.capturePage 拍 2 倍图；右栏拍主窗口。AI 是假的（只回答那一路 CT_AI_FAKE，全能那一路画布笔记的假引擎照步骤稿）。
 */
import { expect, type ElectronApplication, type Page, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, type Running } from './app'

const OUT = process.env.CT_QUICKB_SHOTS
test.skip(!OUT, '只在出截图时跑（CT_QUICKB_SHOTS=<目录>）')

async function capture(app: ElectronApplication, url: string): Promise<Buffer> {
  const b64 = await app.evaluate(async ({ BrowserWindow }, url) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith(url))!
    return (await w.webContents.capturePage()).toPNG().toString('base64')
  }, url)
  return Buffer.from(b64, 'base64')
}
const save = async (run: Running, url: string, name: string) => {
  await new Promise((r) => setTimeout(r, 500))
  mkdirSync(OUT!, { recursive: true })
  writeFileSync(join(OUT!, `${name}.png`), await capture(run.app, url))
}
const press = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctQuick: { press(): Promise<void> } }).ctQuick.press())
async function quickPage(run: Running): Promise<Page> {
  await expect.poll(() => run.app.windows().some((w) => w.url().endsWith('/quick.html'))).toBe(true)
  return run.app.windows().find((w) => w.url().endsWith('/quick.html'))!
}
/** 一张像课程通知的截图（画出来的） */
async function notice(p: Page): Promise<number[]> {
  return p.evaluate(async () => {
    const c = new OffscreenCanvas(560, 220)
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 560, 220)
    g.fillStyle = '#6b7785'
    g.font = '13px -apple-system, PingFang SC'
    g.fillText('课程公告 · 计算机与人脑 ECP · 11月25日', 20, 30)
    g.fillStyle = '#111'
    g.font = '600 18px -apple-system, PingFang SC'
    g.fillText('作业 3 和期中考试安排', 20, 62)
    g.font = '15px -apple-system, PingFang SC'
    g.fillText('① 作业 3 请在 12月2日（周三）23:59 前提交。', 20, 100)
    g.fillText('② 期中考试 12月9日（周三）10:00，地点 B201。', 20, 130)
    g.fillStyle = '#6b7785'
    g.fillText('助教 王老师', 20, 170)
    const b = await c.convertToBlob({ type: 'image/png' })
    return [...new Uint8Array(await b.arrayBuffer())]
  })
}
async function paste(p: Page, bytes: number[]) {
  await p.evaluate(
    ([bytes]) => {
      const el = document.querySelector('.qp textarea') as HTMLTextAreaElement
      el.focus()
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(bytes as number[])], 'image.png', { type: 'image/png' }))
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    },
    [bytes] as const,
  )
  await expect(p.locator('[data-part="贴的图"] .qimg').last()).toBeVisible()
}

for (const skin of ['mint', 'petrol'] as const) {
  const settings = { lang: 'zh', followNotes: false, appearance: { followSystem: false, skin, day: 'mint', night: 'petrol', frame: 'b', winBg: 'aurora' }, plan: { onOpen: false, tray: true, journal: null } }

  test(`加待办、贴图存附件、Tab 切到问 AI ${skin}`, async () => {
    // 画布笔记的假引擎在（全能模式能开关），全能关着那一问走只回答的假回答
    const run = await launch({ settings, env: { CT_AI_FAKE: '1', CN_AI_FAKE: '1', CT_AI_FAKE_MS: '300' } })
    try {
      mkdirSync(join(run.root, 'notes-data', 'ai'), { recursive: true })
      writeFileSync(join(run.root, 'notes-data', 'ai', 'settings.json'), JSON.stringify({ omni: false }))
      await press(run)
      const qp = await quickPage(run)
      const box = qp.locator('.qp textarea')
      await expect(box).toBeVisible()
      await save(run, '/quick.html', `b1-add-${skin}`)
      const img = await notice(qp)
      await paste(qp, img)
      await box.pressSequentially('照这张通知准备期中考试 下周三')
      await save(run, '/quick.html', `b2-add-image-${skin}`)
      await box.fill('')
      await box.press('Tab')
      await expect(qp.locator('.qp')).toHaveAttribute('data-mode', 'ai')
      await box.pressSequentially('照这张通知把作业和考试记上')
      await save(run, '/quick.html', `b3-ai-image-${skin}`)
      await box.press('Enter')
      await expect(qp.locator('[data-part="小框里的对话"] .qa-a:not(.qa-run) .txt')).toBeVisible({ timeout: 20_000 })
      await save(run, '/quick.html', `b4-ai-answer-off-${skin}`)
      await box.press('Meta+j')
      await expect(run.page.locator('[data-part="AI 对话"] .aim-a').last()).toBeVisible()
      await run.page.waitForTimeout(600)
      await run.page.screenshot({ path: join(OUT!, `b6-handoff-${skin}.png`) })
    } finally {
      await run.close()
    }
  })

  test(`全能模式开着：小框里说加个待办就加上 ${skin}`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ct-qb-omni-'))
    const script = join(dir, 'script.json')
    writeFileSync(
      script,
      JSON.stringify([{ say: '明天下午三点交报告', steps: [{ tool: 'today_tasks', args: { query: '报告' } }, { tool: 'note_write', args: { path: '收件箱/待办.md', text: '- [ ] 交报告 📅 2026-11-23 15:00', mode: 'append' } }, { say: '加好了：明天 15:00 交报告，放在收件箱。' }] }, { say: '排进空着的时间', steps: [{ tool: 'today_plan', args: { fake: true } }, { say: '排好了，你看一下改动卡。' }] }]),
    )
    const run = await launch({ settings, env: { CN_AI_FAKE: '1', CN_FAKE_SCRIPT: script, CN_FAKE_SAY_MS: '5', CT_COMPUTER_ROOT: dir } })
    try {
      await press(run)
      const qp = await quickPage(run)
      const box = qp.locator('.qp textarea')
      await box.press('Tab')
      await expect(qp.locator('[data-part="全能模式"] [role="switch"]')).toHaveAttribute('aria-checked', 'true')
      await box.pressSequentially('明天下午三点交报告加个待办')
      await box.press('Enter')
      await expect(qp.locator('[data-part="这一轮的改动"]')).toBeVisible({ timeout: 30_000 })
      await save(run, '/quick.html', `b5-ai-omni-${skin}`)
      // 排日程：改动卡就在小框里
      await box.pressSequentially('把这周的作业排进空着的时间')
      await box.press('Enter')
      await expect(qp.locator('[data-part="小框里的对话"] [data-part="改动卡"]').last()).toContainText('收下后一次写进库', { timeout: 30_000 })
      await save(run, '/quick.html', `b7-ai-plan-${skin}`)
    } finally {
      await run.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
}
