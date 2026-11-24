/**
 * 待办默认提醒（2026-11-24 用户定）：设置 › 日历和提醒事项「提醒所有带钟点的待办」默认开：
 * 有钟点、没写 🔔 的也照「准时」排本机通知、镜像进提醒事项（文件里不补 🔔）；关了只认写了 🔔 的。
 * 快速加一条「明天 8 点交报告」→ 那一行有钟点、没有 🔔 → 到 8 点响；关掉开关后「今天 9 点开组会」到点不响。
 * 连上提醒事项（小助手 --memory，假的）：那一条镜像进去、闹钟在到期那一刻；关掉开关从提醒事项里拿掉。
 */
import { expect, type Page, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, type Running } from './app'
import type { NotifShot } from '../src/shared/api'

const press = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctQuick: { press(): Promise<void> } }).ctQuick.press())
const notifs = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctNotifs: NotifShot[] }).ctNotifs)
const setClock = (run: Running, at: string) => run.app.evaluate((_e, at) => (globalThis as unknown as { ctSetClock: (s: string) => void }).ctSetClock(at), at)
const rang = async (run: Running, title: string) => (await notifs(run)).filter((n) => n.title === title && !!n.due)
const mem = (run: Running): { items: { title: string; due?: string | null; alarms?: unknown[]; url?: string | null }[] } =>
  existsSync(run.remFile) ? JSON.parse(readFileSync(run.remFile, 'utf8')) : { items: [] }

async function quickAdd(run: Running, text: string) {
  await press(run)
  await expect.poll(() => run.app.windows().some((w) => w.url().endsWith('/quick.html'))).toBe(true)
  const qp = run.app.windows().find((w) => w.url().endsWith('/quick.html'))!
  const box = qp.getByLabel('快速加一条')
  await expect(box).toBeVisible()
  await box.fill(text)
  await expect(qp.locator('#qgot .chip').first()).toBeVisible()
  await box.press('Enter')
}

async function calRem(page: Page) {
  await page.locator('.ab[data-k="settings"]').click()
  const s = page.locator('.set')
  await s.getByRole('navigation').getByRole('button', { name: '日历和提醒事项' }).click()
  return s
}

test('提醒所有带钟点的待办（默认开）：快速加「明天 8 点交报告」那一行有钟点没 🔔、到 8 点照准时响；关掉开关后带钟点没 🔔 的不响', async () => {
  const run = await launch()
  try {
    await quickAdd(run, '明天 8 点交报告')
    await expect.poll(() => run.read('收件箱/待办.md')).toMatch(/- \[ \] 交报告 📅 2026-11-23 08:00\n/)
    expect(run.read('收件箱/待办.md')).not.toContain('交报告 📅 2026-11-23 08:00 🔔')
    // 设置里那颗开关默认开着
    const s = await calRem(run.page)
    const sw = s.getByRole('switch', { name: '提醒所有带钟点的待办' })
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await expect(s.locator('[data-row="remindAll"]')).toContainText('文件里不补 🔔')
    await run.page.keyboard.press('Escape')
    // 到点照准时响
    await setClock(run, '2026-11-23T07:59:58')
    await expect.poll(async () => (await rang(run, '交报告')).length, { timeout: 10_000 }).toBe(1)
    expect((await rang(run, '交报告'))[0]).toMatchObject({ due: '2026-11-23T08:00', at: '2026-11-23T08:00', body: '今天 08:00 到期 · 待办' })

    // 关掉：只认写了 🔔 的
    await quickAdd(run, '今天 9 点开组会')
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [ ] 开组会 📅 2026-11-23 09:00\n')
    const s2 = await calRem(run.page)
    await s2.getByRole('switch', { name: '提醒所有带钟点的待办' }).click()
    await expect(s2.getByRole('switch', { name: '提醒所有带钟点的待办' })).toHaveAttribute('aria-checked', 'false')
    await run.page.keyboard.press('Escape')
    await setClock(run, '2026-11-23T09:00:30')
    await run.page.waitForTimeout(2500)
    expect(await rang(run, '开组会')).toEqual([])
    // 设置存下了，重开还是关着
    expect(JSON.parse(readFileSync(join(run.userData, 'settings.json'), 'utf8')).remindAll).toBe(false)
  } finally {
    await run.close()
  }
})

test('连上提醒事项：快速加「明天 8 点交报告」镜像进「画布今日」列表（闹钟在到期那一刻），文件里只加 🆔 不加 🔔；关掉开关从提醒事项里拿掉', async () => {
  const run = await launch()
  try {
    const s = await calRem(run.page)
    const r = s.locator('[data-row="rem"]')
    await r.getByRole('button', { name: '连接提醒事项' }).click()
    await expect(r).toContainText(/已连接iCloud/, { timeout: 10_000 })
    await run.page.keyboard.press('Escape')
    await quickAdd(run, '明天 8 点交报告')
    await expect.poll(() => mem(run).items.find((i) => i.title === '交报告'), { timeout: 15_000 }).toMatchObject({ due: '2026-11-23 08:00', alarms: [{ offset: 0 }] })
    const line = run.read('收件箱/待办.md').split('\n').find((l) => l.includes('交报告'))!
    expect(line).toMatch(/^- \[ \] 交报告 📅 2026-11-23 08:00 🆔 [a-z0-9]{6}$/)
    // 关掉开关：没写 🔔 的从提醒事项里拿掉
    const s2 = await calRem(run.page)
    await s2.getByRole('switch', { name: '提醒所有带钟点的待办' }).click()
    await run.page.keyboard.press('Escape')
    await expect.poll(() => mem(run).items.some((i) => i.title === '交报告'), { timeout: 15_000 }).toBe(false)
  } finally {
    await run.close()
  }
})
