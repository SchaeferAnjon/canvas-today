/**
 * MeetCaption 联动（画布今日这一侧，main/mc.ts、renderer/mc.tsx）：样本库带 MeetCaption 写的 meetcaption.json 课表（ECP 每周三 09:00）
 * 和上周那节课的上课记录（两件作业：一件定在今天，一件没定日子）。钟拨到 11-25 周三 08:50。
 * 真点：今日页「今天的课」那一行、到点弹的通知「开字幕」、今日页的「开字幕」、待办上「来自ECP 09:43」、勾掉那一件、上课中「打开字幕」、设置里改成不问；
 * 没装 MeetCaption、没连库（库里没有 meetcaption.json）时什么都不画、不弹、不报错。深链、通知都走测试模式的记录器（不真的开 MeetCaption、画布笔记）。
 */
import { expect, type Page, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, row, type Running } from './app'
import { MC_FILES, MC_FOLDER, MC_RECORD, MC_RECORD_TEXT, MC_SESSION, MC_TODAY_RECORD, MC_TODAY_SESSION, MC_TODAY_TEXT } from './mc-fixture'
import type { NotifShot } from '../src/shared/api'
// MeetCaption 设置里点「连上画布笔记的库」时拨的两个开关（mc-write、mc-todo）：这里用 @cn/family 写；
// MeetCaption 那份 JS 抄本写出来和它一字不差，packages/family/test/meetcaption-links.test.ts 核对（公开仓库里没有 apps/meetcaption）
import { writeLink } from '@cn/family/node'

const SHOTS = process.env.CT_MC_SHOTS ?? join(tmpdir(), 'ct-mc-shots')
const notifs = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctNotifs: NotifShot[] }).ctNotifs)
const screen = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { cnScreen: string[] }).cnScreen)
const act = (run: Running, n: number, a: string) => run.app.evaluate((_e, [n, a]) => (globalThis as unknown as { ctNotifAct: (n: number, a: string) => void }).ctNotifAct(n as number, a as string), [n, a] as const)
const setClock = (run: Running, at: string) => run.app.evaluate((_e, at) => (globalThis as unknown as { ctSetClock: (s: string) => void }).ctSetClock(at), at)
const mcNotifs = async (run: Running) => (await notifs(run)).filter((n) => n.key.startsWith('mc:'))
const shot = (page: Page, name: string) => {
  mkdirSync(SHOTS, { recursive: true })
  return page.screenshot({ path: join(SHOTS, name) })
}

/** MeetCaption 装没装（测试模式读这个文件）、它的设置目录（live.json 放这里） */
function side(installed: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'ct-mc-side-'))
  const file = join(dir, 'installed.json')
  writeFileSync(file, JSON.stringify(installed ? { meetcaption: '0.7.0' } : {}))
  return { dir, env: { CT_FAMILY_INSTALLED_FILE: file, CT_MEETCAPTION_DIR: dir } }
}

test('装了 MeetCaption、连着库：今天的课、到点问开字幕、开字幕走深链、待办带来源跳回画布笔记那一秒、勾掉写回、上课中、设置能关', async () => {
  const mc = side(true)
  const run = await launch({ files: MC_FILES, now: '2026-11-25T08:50:00', env: mc.env })
  const { page } = run
  try {
    // 今日页：今天的课一行（照课表），右边「开字幕」
    const strip = page.locator('[data-part="今天的课"]')
    await expect(strip.locator('.grp')).toHaveText('今天的课1')
    const cls = strip.locator('.mcrow')
    await expect(cls.locator('.tm')).toHaveText('09:00–10:30')
    await expect(cls.locator('.nm')).toHaveText('ECP')
    await expect(cls.locator('.via')).toHaveText('照课表')
    await expect(cls.getByRole('button', { name: '开字幕', exact: true })).toBeVisible()
    // 定在今天的那件作业：在「今天」里，标题不带 ▶ 那串，后面「来自ECP 09:43」替掉笔记名
    const hw = row(page, '列出近似加法器的三种误差指标')
    await expect(hw.locator('.rt')).toHaveText('列出近似加法器的三种误差指标')
    await expect(hw.locator('.acc.mcsrc')).toHaveText('来自ECP 09:43')
    await expect(hw.locator('.acc.note')).toHaveCount(0)
    // 没定日子的那件是上周的课：不在今天的课下面
    await expect(strip.locator('.row')).toHaveCount(0)
    await shot(page, '01-今天的课.png')

    // 还没到点：不问
    expect(await mcNotifs(run)).toEqual([])
    await setClock(run, '2026-11-25T08:55:00')
    await expect.poll(async () => (await mcNotifs(run)).length, { timeout: 10_000 }).toBe(1)
    const n = (await mcNotifs(run))[0]!
    expect(n).toMatchObject({ title: 'ECP 9:00 开始 · 开字幕吗', body: `照MeetCaption记的课表 · 字幕和笔记写进「${MC_FOLDER}」`, actions: ['开字幕', '这次不用'], due: '2026-11-25T09:00' })
    // 点通知上的「开字幕」（第 0 个按钮）：叫 MeetCaption 开始上课
    const startUrl = `meetcaption://start?project=ecp&mode=class&source=mic&back=${encodeURIComponent(MC_FOLDER)}`
    await act(run, n.n, 'done')
    await expect.poll(() => screen(run)).toContain(`用浏览器打开 ${startUrl}`)
    // 一节只问一次
    await setClock(run, '2026-11-25T08:57:00')
    await page.waitForTimeout(800)
    expect(await mcNotifs(run)).toHaveLength(1)

    // 今日页那一颗「开字幕」：同一条深链，底下说一句
    const before = (await screen(run)).filter((x) => x.includes('meetcaption://start')).length
    await cls.getByRole('button', { name: '开字幕', exact: true }).click()
    await expect(page.locator('.toast')).toContainText('叫MeetCaption开始记「ECP」')
    await expect.poll(async () => (await screen(run)).filter((x) => x === `用浏览器打开 ${startUrl}`).length).toBe(before + 1)

    // 「来自ECP 09:43」：在画布笔记里打开那一篇那一秒
    await hw.locator('.acc.mcsrc').click()
    const jump = `canvas-notes://open?file=${encodeURIComponent(MC_RECORD)}&t=2580&session=${encodeURIComponent(MC_SESSION)}&vault=${encodeURIComponent(run.vault)}`
    await expect.poll(() => screen(run)).toContain(`用浏览器打开 ${jump}`)
    await expect(page.locator('.toast')).toContainText('在画布笔记里打开《2026-11-18 近似加法器与乘法器》，到09:43那一刻')

    // 勾掉：只改那一行（加 ✅ 今天），别的字一个不动
    await hw.locator('.cb').click()
    await expect.poll(() => run.read(MC_RECORD)).toContain('- [x] 列出近似加法器的三种误差指标')
    // 提示条里也不带 ▶ 那串
    await expect(page.locator('.toast')).toContainText('勾掉了「列出近似加法器的三种误差指标」')
    await expect(page.locator('.toast')).not.toContainText('meetcaption://')
    const want = MC_RECORD_TEXT.replace(/- \[ \] (列出近似加法器的三种误差指标 .* 📅 2026-11-25)\n/, '- [x] $1 ✅ 2026-11-25\n')
    expect(want).not.toBe(MC_RECORD_TEXT)
    expect(run.read(MC_RECORD)).toBe(want)

    // 上课中：MeetCaption 写了 live.json、正写进今天那一篇（作业先进来、还没定日子）
    run.write(MC_TODAY_RECORD, MC_TODAY_TEXT)
    writeFileSync(join(mc.dir, 'canvas-notes-live.json'), JSON.stringify({ session: MC_TODAY_SESSION, startedAt: new Date(2026, 10, 25, 9, 0).getTime(), project: 'ecp', mode: 'class', file: MC_TODAY_RECORD }))
    await setClock(run, '2026-11-25T09:25:00')
    await expect(cls.locator('.livetag')).toHaveText('上课中 · 25分钟', { timeout: 10_000 })
    await expect(cls.getByRole('button', { name: '开字幕', exact: true })).toHaveCount(0)
    const live = strip.locator('.row', { hasText: '把 CDM8 乘法器的误差表补完' })
    await expect(live.locator('.acc.mcsrc')).toHaveText('来自ECP 09:25')
    await shot(page, '02-上课中.png')
    await cls.getByRole('button', { name: '打开字幕' }).click()
    await expect.poll(() => screen(run)).toContain(`用浏览器打开 meetcaption://open?session=${encodeURIComponent(MC_TODAY_SESSION)}`)

    // 详情：标题框里不带 ▶ 那串；改了名，文件里那一行 ▶ 时间还在；详情里也有「来自ECP 09:25」
    await live.locator('.rt').click()
    const box = page.getByLabel('任务名')
    await expect(box).toHaveValue('把 CDM8 乘法器的误差表补完')
    await expect(page.locator('[data-part="挂的笔记"] .acc.mcsrc')).toHaveText('来自ECP 09:25')
    await box.fill('把 CDM8 乘法器的误差表全补完')
    await box.press('Enter')
    await expect.poll(() => run.read(MC_TODAY_RECORD)).toContain(`- [ ] 把 CDM8 乘法器的误差表全补完 [▶ 09:25](meetcaption://open?session=${encodeURIComponent(MC_TODAY_SESSION)}&t=1500)\n`)
    expect(run.read(MC_TODAY_RECORD)).toBe(MC_TODAY_TEXT.replace('误差表补完', '误差表全补完'))

    // 设置 › 日历和提醒事项：「上课前问开字幕吗」默认前 5 分钟，改成不问
    await page.locator('.ab[data-k="settings"]').click()
    const s = page.locator('.set')
    await s.getByRole('navigation').getByRole('button', { name: '日历和提醒事项' }).click()
    const sel = s.getByRole('combobox', { name: '上课前问要不要开字幕' })
    await expect(sel).toHaveValue('5')
    await shot(page, '03-设置.png')
    await sel.selectOption({ label: '不问' })
    await expect(s.getByTestId('settings-toast')).toContainText('「上课前问要不要开字幕」改成「不问」')
    await expect.poll(() => JSON.parse(readFileSync(join(run.userData, 'settings.json'), 'utf8')).mcLead).toBeNull()
  } finally {
    await run.close()
    rmSync(mc.dir, { recursive: true, force: true })
  }
})

test('到点通知点「这次不用」什么都不开；点通知本身打开画布今日；设置成不问时不弹', async () => {
  const mc = side(true)
  const run = await launch({ files: MC_FILES, now: '2026-11-25T08:54:00', env: mc.env, settings: { mcLead: 2 } })
  try {
    await setClock(run, '2026-11-25T08:58:10')
    await expect.poll(async () => (await mcNotifs(run)).length, { timeout: 10_000 }).toBe(1)
    const n = (await mcNotifs(run))[0]!
    await act(run, n.n, '10m')
    await act(run, n.n, 'click')
    await run.page.waitForTimeout(500)
    expect((await screen(run)).filter((x) => x.includes('meetcaption://'))).toEqual([])
  } finally {
    await run.close()
  }
  const off = await launch({ files: MC_FILES, now: '2026-11-25T08:58:00', env: mc.env, settings: { mcLead: null } })
  try {
    await expect(off.page.locator('[data-part="今天的课"]')).toBeVisible()
    await off.page.waitForTimeout(1500)
    expect(await mcNotifs(off)).toEqual([])
  } finally {
    await off.close()
    rmSync(mc.dir, { recursive: true, force: true })
  }
})

for (const [name, installed, files] of [
  ['没装 MeetCaption', false, MC_FILES],
  ['没连库（库里没有 meetcaption.json）', true, Object.fromEntries(Object.entries(MC_FILES).filter(([p]) => !p.endsWith('meetcaption.json')))],
] as const)
  test(`${name}：今天的课、到点通知、设置那一行都没有，不报错；待办照常、来源照写`, async () => {
    const mc = side(installed)
    const run = await launch({ files, now: '2026-11-25T08:54:00', env: mc.env })
    const errors: string[] = []
    run.page.on('pageerror', (e) => errors.push(e.message))
    try {
      await expect(row(run.page, '列出近似加法器的三种误差指标')).toBeVisible()
      await expect(row(run.page, '列出近似加法器的三种误差指标').locator('.acc.mcsrc')).toHaveText(installed ? '来自ecp 09:43' : '来自ECP 09:43')
      await expect(run.page.locator('[data-part="今天的课"]')).toHaveCount(0)
      await setClock(run, '2026-11-25T08:56:00')
      await run.page.waitForTimeout(1500)
      expect(await mcNotifs(run)).toEqual([])
      await run.page.locator('.ab[data-k="settings"]').click()
      const s = run.page.locator('.set')
      await s.getByRole('navigation').getByRole('button', { name: '日历和提醒事项' }).click()
      await expect(s.locator('[data-row="remindAll"]')).toBeVisible()
      await expect(s.locator('[data-row="mcLead"]')).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      await run.close()
      rmSync(mc.dir, { recursive: true, force: true })
    }
  })

test('软件家族里关了「MeetCaption说到的待办进清单」（mc-todo）：上课记录里的待办不进清单，别的待办照常；拨开马上回来', async () => {
  const mc = side(true)
  const run = await launch({ files: { ...MC_FILES, '.canvas-notes/联动.json': '{\n  "mc-todo": false\n}\n' }, now: '2026-11-25T08:54:00', env: mc.env })
  try {
    await expect(row(run.page, '买牛奶')).toBeVisible()
    await expect(row(run.page, '列出近似加法器的三种误差指标')).toHaveCount(0)
    writeFileSync(join(run.vault, '.canvas-notes/联动.json'), '{\n  "mc-todo": true\n}\n')
    await expect(row(run.page, '列出近似加法器的三种误差指标')).toBeVisible({ timeout: 8000 })
  } finally {
    await run.close()
    rmSync(mc.dir, { recursive: true, force: true })
  }
})

test('没拨过「MeetCaption说到的待办进清单」（名单里默认关）：MeetCaption 在设置里连上库就算同意，会上待办马上进清单', async () => {
  const mc = side(true)
  const files = { ...MC_FILES }
  delete files['.canvas-notes/联动.json']
  const run = await launch({ files, now: '2026-11-25T08:54:00', env: mc.env })
  try {
    await expect(row(run.page, '买牛奶')).toBeVisible()
    await expect(row(run.page, '列出近似加法器的三种误差指标')).toHaveCount(0)
    writeLink(run.vault, 'mc-write', true)
    writeLink(run.vault, 'mc-todo', true)
    expect(JSON.parse(readFileSync(join(run.vault, '.canvas-notes/联动.json'), 'utf8'))).toEqual({ 'mc-todo': true, 'mc-write': true })
    await expect(row(run.page, '列出近似加法器的三种误差指标')).toBeVisible({ timeout: 8000 })
  } finally {
    await run.close()
    rmSync(mc.dir, { recursive: true, force: true })
  }
})
