/**
 * 到点提醒：详情里改提醒 → 拨钟到点 → 通知记录器收到 → 点「10 分钟后」→ 库里 .canvas-tasks/提醒/<设备>/2026-11.jsonl 写了「响过」和「推迟」；
 * 再拨到 10 分钟后又响一次 → 点「勾掉」→ 那一行勾掉、记录里写了「勾掉」，记录提交进了 Git。
 */
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { launch, type Running, row } from './app'
import type { NotifShot } from '../src/shared/api'

const notifs = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctNotifs: NotifShot[] }).ctNotifs)
const setClock = (run: Running, at: string) => run.app.evaluate((_e, at) => (globalThis as unknown as { ctSetClock: (s: string) => void }).ctSetClock(at), at)
const act = (run: Running, n: number, a: string) => run.app.evaluate((_e, [n, a]) => (globalThis as unknown as { ctNotifAct: (n: number, a: string) => void }).ctNotifAct(n as number, a as string), [n, a] as const)
const LOG = '.canvas-tasks/提醒/mac-test/2026-11.jsonl'
const logLines = (run: Running) => (existsSync(join(run.vault, LOG)) ? run.read(LOG).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
const uncommitted = (run: Running, p: string) => execFileSync('git', ['-C', run.vault, 'status', '--porcelain', '--', p], { encoding: 'utf8' })

test('详情里改提醒「准时」→ 到点弹通知 → 推迟 10 分钟写进 jsonl → 10 分钟后又响 → 从通知勾掉', async () => {
  const run = await launch()
  const { page } = run
  try {
    await row(page, '交论文初稿').click()
    const d = page.locator('[data-part="详情"]')
    await d.getByLabel('提醒').selectOption('准时')
    // 有提醒的那条给了一个 🆔（提醒记录、canvas-today:// 链接靠它认）
    await expect(d.locator('.md')).toHaveText(/^- \[ \] 交论文初稿 📅 2026-11-23 15:00 🔔 准时 ⏫ 🆔 [a-z0-9]{6}$/)
    const id = (await d.locator('.md').innerText()).match(/🆔 ([a-z0-9]{6})/)![1]!
    expect(await notifs(run)).toEqual([])
    await setClock(run, '2026-11-23T14:59:57')
    await expect.poll(async () => (await notifs(run)).length, { timeout: 10_000 }).toBe(1)
    expect((await notifs(run))[0]).toMatchObject({ title: '交论文初稿', body: '今天 15:00 到期 · 小论文计划', actions: ['勾掉', '10 分钟后', '1 小时后', '明天'], key: id, due: '2026-11-23T15:00', at: '2026-11-23T15:00' })
    await act(run, 0, '10m')
    await expect(page.locator('.toast')).toContainText('推迟到今天 15:10再提醒')
    await expect(page.locator('.toast')).toContainText(`${LOG} 加了一行「推迟」`)
    await expect.poll(() => logLines(run).length).toBe(2)
    const lines = logLines(run)
    expect(lines[0]).toMatchObject({ id, due: '2026-11-23T15:00', ev: 'fired', title: '交论文初稿', path: '写作/小论文计划.md' })
    expect(lines[1]).toMatchObject({ id, due: '2026-11-23T15:00', ev: 'snooze', until: '2026-11-23T15:10' })
    expect(lines[1].t).toMatch(/^2026-11-23T15:00:\d\d[+-]\d\d:\d\d$/)
    // 推迟到的钟点到了：再响一次
    await setClock(run, '2026-11-23T15:09:58')
    await expect.poll(async () => (await notifs(run)).length, { timeout: 10_000 }).toBe(2)
    expect((await notifs(run))[1]).toMatchObject({ at: '2026-11-23T15:10', due: '2026-11-23T15:00' })
    await act(run, 1, 'done')
    await expect.poll(() => run.read('写作/小论文计划.md')).toMatch(/- \[x\] 交论文初稿 📅 2026-11-23 15:00 🔔 准时 ⏫ 🆔 [a-z0-9]{6} ✅ 2026-11-23/)
    await expect.poll(() => logLines(run).map((l) => l.ev)).toEqual(['fired', 'snooze', 'fired', 'done'])
    // 跟着库走：记录提交进了 Git
    await expect.poll(() => uncommitted(run, '.canvas-tasks'), { timeout: 10_000 }).toBe('')
  } finally {
    await run.close()
  }
})

test('「到点的样子」马上弹一次（不记进记录）；软件开着时过了点一小时以内的补响', async () => {
  const run = await launch({ now: '2026-11-24T19:30:00' })
  const { page } = run
  try {
    await page.locator('.nav[data-k="week"]').click()
    await row(page, '订冰岛租车').click()
    await page.locator('[data-part="详情"]').getByRole('button', { name: '到点的样子' }).click()
    await expect.poll(async () => (await notifs(run)).length).toBe(1)
    expect((await notifs(run))[0]).toMatchObject({ title: '订冰岛租车', body: '今天 20:00 到期 · 冰岛行程' })
    expect(logLines(run)).toEqual([])
    // 钟一下拨过了点（像合上盖子睡了一会儿）：补响一次，记一行
    await setClock(run, '2026-11-24T20:30:00')
    await expect.poll(async () => (await notifs(run)).length, { timeout: 10_000 }).toBe(2)
    await expect.poll(() => logLines(run).map((l) => l.ev)).toEqual(['fired'])
  } finally {
    await run.close()
  }
})

test('响过的重开软件不再响（另一台设备写的记录也算）', async () => {
  const files = { '收件箱/待办.md': '# 待办\n\n- [ ] 取快递 📅 2026-11-22 10:30 🔔 准时 🆔 kd0001\n' }
  const other = '.canvas-tasks/提醒/iphone/2026-11.jsonl'
  const run = await launch({
    files: { ...files, [other]: JSON.stringify({ t: '2026-11-22T10:30:01+01:00', id: 'kd0001', due: '2026-11-22T10:30', ev: 'fired' }) + '\n' },
    now: '2026-11-22T10:29:58',
  })
  try {
    await run.page.waitForTimeout(4000)
    expect(await notifs(run)).toEqual([])
  } finally {
    await run.close()
  }
})
