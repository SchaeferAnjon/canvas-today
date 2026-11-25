/**
 * 真的 AI（task-ykkoz）：本机的 Claude Code 真问真答走一遍「拆成小步」「帮我排进空着的时间」（不是假 AI）。平时跳过：
 *   CT_REAL_AI=1 ANTHROPIC_API_KEY=… CT_AI_MODEL=sonnet CT_AI_EFFORT=low npx playwright test e2e/real-ai.spec.ts
 * 跑之前去掉继承来的 CLAUDE_* 环境变量（不然命令行以为自己在别的会话里）。问一次、不给工具、不留会话记录（--no-session-persistence）。
 */
import { expect, test } from '@playwright/test'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TodayMsg } from '../src/shared/ai-chat'
import { launch, row } from './app'
import { CAL_SEED } from './fixtures'

test.skip(process.env.CT_REAL_AI !== '1', '真 AI：CT_REAL_AI=1 才跑')

test('真的 Claude Code：拆成小步、排进空着的时间，收下写进笔记', async () => {
  test.setTimeout(420_000)
  const run = await launch({ reminders: { ...CAL_SEED, calAuth: 'full' }, settings: { calendar: { show: true } } })
  const { page } = run
  try {
    // 拆成小步
    await page.locator('.nav[data-k="list:写作/小论文计划.md"]').click()
    await row(page, '补实验图').click()
    const d = page.locator('[data-part="详情"]')
    let t0 = Date.now()
    await d.getByRole('button', { name: '拆成小步' }).click()
    const box = d.locator('[data-part="AI 帮忙"]')
    await expect(box.getByRole('button', { name: '收下' }).or(box.getByRole('button', { name: '再试一次' }))).toBeVisible({ timeout: 180_000 })
    console.log(`[真 AI] 拆成小步 ${((Date.now() - t0) / 1000).toFixed(1)} 秒：${await box.locator('.ah').innerText()}`)
    const steps = await box.locator('.it').allInnerTexts()
    console.log(`[真 AI] 几步：${JSON.stringify(steps)}`)
    expect(steps.length).toBeGreaterThanOrEqual(3)
    await box.getByRole('button', { name: '收下' }).click()
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain(`    - [ ] ${steps[0]}`)

    // 排进空着的时间
    await page.locator('.ab[data-k="calendar"]').click()
    await expect(page.locator('.cal-blk.ev', { hasText: '和爸妈视频' })).toBeVisible()
    t0 = Date.now()
    await page.getByRole('button', { name: '帮我排进空着的时间' }).click()
    const bar = page.locator('.aibar')
    await expect(bar.getByRole('button', { name: '收下' }).or(bar.getByRole('button', { name: '再试一次' })).or(bar.getByRole('button', { name: '关上' }))).toBeVisible({ timeout: 180_000 })
    console.log(`[真 AI] 排空档 ${((Date.now() - t0) / 1000).toFixed(1)} 秒：${await bar.innerText()}`)
    const ghosts = await page.locator('.cal-blk.ghost').allInnerTexts()
    console.log(`[真 AI] 虚线框：${JSON.stringify(ghosts)}`)
    expect(ghosts.length).toBeGreaterThan(0)
    await bar.getByRole('button', { name: '收下' }).click()
    await expect(page.locator('.toast')).toContainText('排好了')
    console.log(`[真 AI] ${await page.locator('.toast').innerText()}`)
  } finally {
    await run.close()
  }
})

/**
 * 右栏 AI 对话（task-ykkoz）真问两句：排进空着的时间（收下写进笔记）、按优先级排（看卡）。额度紧，只问这两句。
 *   CLAUDE_CONFIG_DIR=<登录了的那份> CT_REAL_AI=1 CT_AI_MODEL=sonnet CT_AI_EFFORT=low npx playwright test e2e/real-ai.spec.ts -g 对话
 */
test('真的 Claude Code：右栏 AI 对话问两句，改动卡查过才给看，收下写进笔记', async () => {
  test.setTimeout(420_000)
  const run = await launch({ reminders: { ...CAL_SEED, calAuth: 'full' }, settings: { calendar: { show: true } } })
  const { page } = run
  try {
    await page.locator('.ab[data-k="calendar"]').click()
    await expect(page.locator('.cal-blk.ev', { hasText: '和爸妈视频' })).toBeVisible()
    await page.locator('.abar.r .ab[data-k="ai"]').click()
    const p = page.locator('[data-part="AI 对话"]')
    const ask = async (text: string) => {
      const n = await p.locator('.aim-a').count()
      const t0 = Date.now()
      await p.locator('.aim-in textarea').fill(text)
      await p.locator('.aim-in textarea').press('Enter')
      await expect(p.locator('.aim-a')).toHaveCount(n + 1, { timeout: 5000 })
      await expect(p.locator('.thinking')).toHaveCount(0, { timeout: 240_000 })
      const a = p.locator('.aim-a').last()
      console.log(`[真 AI 对话] 「${text}」${((Date.now() - t0) / 1000).toFixed(1)} 秒\n${await a.innerText()}`)
      return a
    }
    const a1 = await ask('把这周还没定钟点的作业排进空着的时间')
    await expect(a1.locator('.aerr')).toHaveCount(0)
    const c1 = a1.locator('[data-part="改动卡"]')
    await expect(c1).toBeVisible()
    console.log(`[真 AI 对话] 虚线框：${JSON.stringify(await page.locator('.cal-blk.ghost').allInnerTexts())}`)
    if (await c1.getByRole('button', { name: '收下' }).count()) {
      await c1.getByRole('button', { name: '收下' }).click()
      await expect(page.locator('.toast')).toContainText('AI改了')
      console.log(`[真 AI 对话] ${await page.locator('.toast').innerText()}`)
    }
    const a2 = await ask('把收件箱这几条按优先级排好')
    await expect(a2.locator('.aerr')).toHaveCount(0)
    console.log(`[真 AI 对话] 标记：${JSON.stringify(await page.locator('.aim-mv').allInnerTexts())}`)
  } finally {
    await run.close()
  }
})

/**
 * 右栏 AI 对话带一张课表截图真问一次（画布今日贴图）：图是这里现画的一张课表（隐藏窗口里画好截下来），⌘V 那条路在 t25 里测，
 * 这里用粘贴事件贴进输入框，真交给本机的 Claude Code；回的改动单里每个钟点都不撞课表上的课（软件只查日历日程，课表里的课靠 AI 看图）。
 *   CT_REAL_AI=1 CT_AI_MODEL=sonnet CT_AI_EFFORT=low npx playwright test e2e/real-ai.spec.ts -g 课表
 * CT_REAL_AI_SHOTS=<目录>：把课表图和回答那一屏存下来（交付页用）
 */
test('真的 Claude Code：贴一张课表截图问「照它排作业」，图交到了，改动单的钟点都避开课', async () => {
  test.setTimeout(420_000)
  // 本机 Claude Code 跑在别的会话里时继承来的环境变量：去掉（登录用的配置目录 CLAUDE_CONFIG_DIR 留着）
  for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PID|CLAUDE_EFFORT)/.test(k)) delete process.env[k]
  const run = await launch({})
  const { page } = run
  const shots = process.env.CT_REAL_AI_SHOTS ?? ''
  // 这周的课（周一 11-23 到周五 11-27）
  const CLASSES: [string, string, string, string][] = [
    ['周一', '08:00', '09:40', '高等数学'],
    ['周一', '10:00', '11:40', '线性代数'],
    ['周二', '08:00', '11:40', '程序设计实验'],
    ['周二', '14:00', '15:40', 'ecp 课'],
    ['周三', '08:00', '09:40', '高等数学'],
    ['周三', '14:00', '17:00', '物理实验'],
    ['周四', '10:00', '11:40', '线性代数'],
    ['周四', '14:00', '15:40', '大学英语'],
    ['周五', '08:00', '11:40', '高等数学 + 习题课'],
  ]
  const DAY: Record<string, string> = { 周一: '2026-11-23', 周二: '2026-11-24', 周三: '2026-11-25', 周四: '2026-11-26', 周五: '2026-11-27' }
  const cell = (d: string, slot: string) => {
    const c = CLASSES.find((x) => x[0] === d && x[1] <= slot && x[2] > slot)
    return `<td style="border:1px solid #bbb;padding:6px 10px;min-width:120px">${c ? `${c[3]}<br><small>${c[1]}–${c[2]}</small>` : ''}</td>`
  }
  const head = '<tr>' + ['时间', ...Object.keys(DAY)].map((d) => `<th style="border:1px solid #bbb;padding:6px 14px;background:#eef">${d}</th>`).join('') + '</tr>'
  const rows = ['08:00', '10:00', '14:00', '16:00'].map((slot) => `<tr><td style="border:1px solid #bbb;padding:6px 10px">${slot}</td>${Object.keys(DAY).map((d) => cell(d, slot)).join('')}</tr>`)
  const html = `<html><body style="margin:0;font:15px -apple-system,'PingFang SC';background:#fff;color:#222"><div style="padding:18px 22px"><b style="font-size:18px">2026 秋 第 13 周课表（11/23–11/27）</b><table style="margin-top:12px;border-collapse:collapse">${head}${rows.join('')}</table></div></body></html>`
  try {
    const b64 = await run.app.evaluate(async ({ BrowserWindow }, h) => {
      const w = new BrowserWindow({ show: false, width: 860, height: 440 })
      await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(h))
      await new Promise((r) => setTimeout(r, 300))
      const out = (await w.webContents.capturePage()).toPNG().toString('base64')
      w.destroy()
      return out
    }, html)
    const png = Buffer.from(b64, 'base64')
    if (shots) writeFileSync(join(shots, '课表截图.png'), png)
    await page.locator('.abar.r .ab[data-k="ai"]').click()
    const p = page.locator('[data-part="AI 对话"]')
    const ta = p.locator('[data-testid="ai-input"] textarea')
    await ta.click()
    await page.evaluate((bytes) => {
      const el = document.querySelector('[data-part="AI 对话"] [data-testid="ai-input"] textarea') as HTMLTextAreaElement
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(bytes)], 'image.png', { type: 'image/png' }))
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, [...png])
    await expect(p.getByTestId('ai-mat')).toHaveCount(1)
    await ta.press('End')
    await ta.pressSequentially('是我这周的课表截图，照它把这周还没定钟点的作业排进没课的时间')
    const t0 = Date.now()
    await ta.press('Enter')
    await expect(p.locator('.aim-a')).toHaveCount(1, { timeout: 5000 })
    await expect(p.locator('.thinking')).toHaveCount(0, { timeout: 300_000 })
    const a = p.locator('.aim-a').last()
    console.log(`[真 AI 课表] ${((Date.now() - t0) / 1000).toFixed(1)} 秒\n${await a.innerText()}`)
    await expect(a.locator('.aerr')).toHaveCount(0)
    if (shots) {
      await page.mouse.move(700, 790)
      const r = (await page.locator('.right').boundingBox())!
      await page.screenshot({ path: join(shots, '真问-课表.png'), clip: { x: r.x, y: r.y, width: r.width, height: r.height } })
    }
    // 存下来的那张卡：每条有钟点的都不撞课（按 60 分钟算）
    const base = join(run.root, 'notes-data', 'ai', 'chats')
    const dir = join(base, readdirSync(base)[0]!)
    const f = readdirSync(dir).find((x) => x !== 'index.json')!
    const msgs = (JSON.parse(readFileSync(join(dir, f), 'utf8')) as { msgs: TodayMsg[] }).msgs
    expect(msgs[0]!.mats).toHaveLength(1)
    const plan = msgs[1]!.plan
    console.log(`[真 AI 课表] 改动单：${JSON.stringify(plan?.changes.map((c) => ({ title: c.title, date: c.date ?? c.from.date, time: c.time === undefined ? c.from.time : c.time })))}`)
    expect(plan?.changes.length ?? 0).toBeGreaterThan(0)
    const min = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
    for (const c of plan!.changes) {
      const date = c.date ?? c.from.date
      const time = c.time === undefined ? c.from.time : c.time
      if (!date || !time) continue
      for (const [d, from, to, name] of CLASSES) if (DAY[d] === date) expect(min(time) + 60 <= min(from) || min(time) >= min(to), `${c.title} ${date} ${time} 撞了 ${name} ${from}–${to}`).toBe(true)
    }
  } finally {
    await run.close()
  }
})
