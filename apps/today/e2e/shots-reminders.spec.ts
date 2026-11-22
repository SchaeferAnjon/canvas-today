/**
 * 提醒事项（task-b9y8i）的并排对照图：浅色一组（B 浮岛书桌 · 天青）、深色一组（A 照 VS Code · 深湖）。
 * 这一块原型里没有画（原型只画了日历左栏「连接系统日历和提醒事项」那一块，后来改成选 A），左边放邻页（改之前那一屏、同一个弹窗的上一步）
 * 或规格图（CT_SPEC=<放 7-import-light.png 这些图的目录>），右边是软件。还拍一张「在哪」标注图（where.png）。
 *   CT_SHOTS_REM=<目录> [CT_SPEC=<规格图目录>] npx playwright test e2e/shots-reminders.spec.ts（先 electron-vite build、node scripts/build-helper.mjs）
 */
import { chromium, type ElectronApplication, type Page, test } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { launch, LOOK, type Running } from './app'

const OUT = process.env.CT_SHOTS_REM
const SPEC = process.env.CT_SPEC
test.skip(!OUT, '只在出对照图时跑（CT_SHOTS_REM=<目录>）')

const W = 1420
const H = 799
type Look = { name: string; frame: 'a' | 'b'; skin: 'sky' | 'petrol'; tone: 'light' | 'dark' }
const LOOKS: Look[] = [
  { name: 'light', frame: 'b', skin: 'sky', tone: 'light' },
  { name: 'dark', frame: 'a', skin: 'petrol', tone: 'dark' },
]
const label = (l: Look) => (l.tone === 'light' ? 'B 浮岛书桌 · 天青' : 'A 照 VS Code · 深湖')

const SEED = {
  lists: [
    { id: 'L-shop', title: '购物', icloud: true, color: '#FF9500' },
    { id: 'L-work', title: '工作', icloud: true, color: '#34C759' },
    { id: 'L-home', title: '家里', icloud: true, color: '#AF52DE' },
  ],
  items: [
    { rid: 's1', list: 'L-shop', title: '牛奶', due: '2026-11-23', alarms: [{ at: '2026-11-23T09:00' }], created: 1 },
    { rid: 's2', list: 'L-shop', title: '鸡蛋', priority: 1, created: 2 },
    { rid: 's3', list: 'L-shop', title: '面包', completed: true, completedAt: '2026-11-20T08:00', created: 3 },
    { rid: 'w1', list: 'L-work', title: '交周报', due: '2026-11-27 17:00', alarms: [{ offset: -3600 }], rules: [{ freq: 'weekly', interval: 1, days: [{ day: 6, week: 0 }] }], notes: '发给王老师', created: 4 },
    { rid: 'w2', list: 'L-work', title: '月底对账', due: '2026-11-27', rules: [{ freq: 'monthly', interval: 1, days: [{ day: 6, week: -1 }] }], created: 5 },
    { rid: 'w3', list: 'L-work', title: '找房东修暖气', alarms: [{ place: '家' }], created: 6 },
    { rid: 'h1', list: 'L-home', title: '浇花', due: '2026-11-24', created: 7 },
  ],
}

const shell = () => {
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  return readdirSync(cache)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort()
    .reverse()
    .map((d) => join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'))
    .find((p) => existsSync(p))
}

/** 真的渲染、2 倍图（同 shots-compare：page.screenshot 的 1 倍图表情会画大一圈） */
async function capture(app: ElectronApplication): Promise<Buffer> {
  const b64 = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString('base64'))
  return Buffer.from(b64, 'base64')
}

async function start(l: Look, reminders: Record<string, unknown> = SEED): Promise<Running> {
  const run = await launch({ settings: LOOK(l.skin, l.frame), size: { width: W, height: H }, reminders })
  await run.app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w as number, h as number), [W, H] as const)
  await run.page.waitForTimeout(300)
  return run
}

async function shot(run: Running): Promise<Buffer> {
  await run.page.mouse.move(700, 790)
  await run.page.waitForTimeout(400)
  return capture(run.app)
}

const img = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`

/** 左右两张拼成一张，上面一行写各是什么 */
async function pair(name: string, left: { title: string; buf: Buffer }, right: { title: string; buf: Buffer }) {
  mkdirSync(OUT!, { recursive: true })
  const b = await chromium.launch({ executablePath: shell() })
  try {
    const p = await b.newPage({ viewport: { width: W * 2 + 60, height: H + 80 }, deviceScaleFactor: 1 })
    await p.setContent(`<html><body style="margin:0;background:#e9eef1;font:14px -apple-system,'PingFang SC',sans-serif;color:#0f2230">
      <div style="display:flex;gap:20px;padding:12px 20px 0;font-weight:600"><div style="width:${W}px">${left.title}</div><div style="width:${W}px">${right.title}</div></div>
      <div style="display:flex;gap:20px;padding:10px 20px 20px">
        <div style="width:${W}px;height:${H}px;display:grid;place-items:center;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)"><img src="${img(left.buf)}" style="max-width:${W}px;max-height:${H}px"></div>
        <img src="${img(right.buf)}" width="${W}" height="${H}" style="box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div></body></html>`)
    writeFileSync(join(OUT!, `${name}.png`), await p.screenshot({ fullPage: true }))
  } finally {
    await b.close()
  }
}

const spec = (name: string): Buffer | null => (SPEC && existsSync(join(SPEC, name)) ? readFileSync(join(SPEC, name)) : null)

async function openSettings(p: Page) {
  await p.locator('.ab[data-k="settings"]').click()
  await p.locator('.setw').waitFor()
}
async function connect(p: Page) {
  await openSettings(p)
  await p.locator('[data-row="rem"]').getByRole('button').first().click()
  await p.locator('[data-row="remImport"]').waitFor()
  await p.waitForTimeout(600)
}
async function scrollToRem(p: Page) {
  await p.locator('[data-row="rem"]').evaluate((e) => e.scrollIntoView({ block: 'center' }))
}

for (const l of LOOKS) {
  test(`设置 › 提醒事项：没连、连上 · ${label(l)}`, async () => {
    const run = await start(l)
    try {
      await openSettings(run.page)
      await scrollToRem(run.page)
      const before = await shot(run)
      await run.page.locator('[data-row="rem"]').getByRole('button').first().click()
      await run.page.locator('[data-row="remImport"]').waitFor()
      await run.page.waitForTimeout(5600)
      await scrollToRem(run.page)
      const after = await shot(run)
      await pair(`1-settings-${l.name}`, { title: `设置 › 提醒事项 · 没连 · ${label(l)}`, buf: before }, { title: `连上以后（镜像开关、放进哪个列表、导入）· ${label(l)}`, buf: after })
    } finally {
      await run.close()
    }
  })

  test(`导入提醒事项：选列表、先看看、删前再问 · ${label(l)}`, async () => {
    const run = await start(l)
    const { page } = run
    try {
      await connect(page)
      await page.locator('[data-row="remImport"]').getByRole('button').click()
      const dlg = page.locator('.impw')
      await dlg.getByRole('checkbox', { name: /购物/ }).click()
      await dlg.getByRole('checkbox', { name: /工作/ }).click()
      const pick = await shot(run)
      const left = spec(l.tone === 'light' ? '7-import-light.png' : '7-import-dark.png')
      await pair(`2-import-pick-${l.name}`, left ? { title: '规格 7-import（一步步、写进哪篇）', buf: left } : { title: '同一个弹窗的样子：设置', buf: pick }, { title: `导入提醒事项 · 选列表 · ${label(l)}`, buf: pick })
      await dlg.getByRole('button').filter({ hasText: /先看看|Preview/ }).click()
      await dlg.locator('.impfile').first().waitFor()
      const preview = await shot(run)
      await pair(`3-import-preview-${l.name}`, { title: `导入提醒事项 · 选列表 · ${label(l)}`, buf: pick }, { title: `先看看会搬什么 · ${label(l)}`, buf: preview })
      await dlg.locator('.impfoot .btn.pri').click()
      await page.waitForTimeout(600)
      const done = await shot(run)
      // 再导一次，选上「搬完删掉」：删之前再问一次
      await page.locator('.ab[data-k="settings"]').click()
      await page.locator('[data-row="remImport"]').getByRole('button').click()
      await dlg.getByRole('checkbox', { name: /家里/ }).click()
      await dlg.getByRole('switch').nth(1).click()
      await dlg.getByRole('button').filter({ hasText: /先看看|Preview/ }).click()
      await dlg.locator('.impfile').first().waitFor()
      await dlg.locator('.impfoot .btn.pri').click()
      await page.locator('.askw').waitFor()
      const ask = await shot(run)
      await pair(`4-import-done-ask-${l.name}`, { title: `导入完：提示条带撤销 · ${label(l)}`, buf: done }, { title: `选了「搬完删掉」：删之前再问一次 · ${label(l)}`, buf: ask })
    } finally {
      await run.close()
    }
  })

  test(`详情和底栏：没镜像、镜像着 · ${label(l)}`, async () => {
    const run = await start(l)
    const { page } = run
    try {
      await page.locator('.row', { hasText: '交论文初稿' }).first().click()
      const before = await shot(run)
      await connect(page)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(5600)
      await page.locator('.row', { hasText: '交论文初稿' }).first().click()
      const after = await shot(run)
      await pair(`5-detail-${l.name}`, { title: `没连提醒事项：本机响，「到点的样子」· ${label(l)}`, buf: before }, { title: `镜像着：「提醒事项里响」，底栏「提醒事项已连接」· ${label(l)}`, buf: after })
    } finally {
      await run.close()
    }
  })

  test(`在提醒事项里删掉那条：提示一次 · ${label(l)}`, async () => {
    const run = await start(l)
    const { page } = run
    try {
      await page.locator('.row', { hasText: '读完三篇相关论文' }).locator('.cb').click()
      await page.waitForTimeout(400)
      const tick = await shot(run)
      await page.waitForTimeout(5400)
      await connect(page)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(5600)
      const id = /交论文初稿[^\n]*🆔 ([a-z0-9]{6})/.exec(run.read('写作/小论文计划.md'))![1]
      await run.app.evaluate((_e, id) => (globalThis as unknown as { ctRem: { external: (p: unknown) => Promise<unknown> } }).ctRem.external({ op: 'delete', task: id }), id)
      await page.locator('.toast', { hasText: '交论文初稿' }).waitFor()
      const del = await shot(run)
      await pair(`6-toast-${l.name}`, { title: `邻页：勾掉一条的提示条 · ${label(l)}`, buf: tick }, { title: `在提醒事项里删掉了那条：库里只去 🔔，提示一次、能撤销 · ${label(l)}`, buf: del })
    } finally {
      await run.close()
    }
  })

  test(`没开 iCloud 提醒事项：顶上提示一次 · ${label(l)}`, async () => {
    const run = await start(l, { icloud: false })
    const { page } = run
    try {
      const before = await shot(run)
      await connect(page).catch(() => undefined)
      await page.keyboard.press('Escape')
      await page.locator('.rbanner').waitFor()
      const after = await shot(run)
      await pair(`7-banner-${l.name}`, { title: `邻页：今天 · ${label(l)}`, buf: before }, { title: `没开 iCloud 提醒事项：顶上提示一次（能点掉，下次不出）· ${label(l)}`, buf: after })
    } finally {
      await run.close()
    }
  })
}

for (const l of LOOKS) {
  test(`设置 › 提醒事项：没授权、没开 iCloud 提醒事项 · ${label(l)}`, async () => {
    const denied = await start(l, { denyRequest: true })
    let left: Buffer
    try {
      await openSettings(denied.page)
      await denied.page.locator('[data-row="rem"]').getByRole('button').first().click()
      await denied.page.waitForTimeout(5600)
      await scrollToRem(denied.page)
      left = await shot(denied)
    } finally {
      await denied.close()
    }
    const noCloud = await start(l, { icloud: false })
    try {
      await connect(noCloud.page)
      await scrollToRem(noCloud.page)
      const right = await shot(noCloud)
      await pair(`9-settings-states-${l.name}`, { title: `没授权：说清楚、留「连接提醒事项」· ${label(l)}`, buf: left }, { title: `没开 iCloud 提醒事项：不镜像、怎么打开、再试一次 · ${label(l)}`, buf: right })
    } finally {
      await noCloud.close()
    }
  })

  test(`「怎么打开」以后的提示条 · ${label(l)}`, async () => {
    const run = await start(l, { icloud: false })
    const { page } = run
    try {
      await connect(page)
      await page.keyboard.press('Escape')
      await page.locator('.rbanner').waitFor()
      await page.waitForTimeout(400)
      const before = await shot(run)
      await page.locator('.rbanner .link').click()
      await page.locator('.toast').waitFor()
      const after = await shot(run)
      await pair(`10-how-${l.name}`, { title: `顶上胶囊 · ${label(l)}`, buf: before }, { title: `点「怎么打开」：提示条写一步步怎么点（系统设置也打开了）· ${label(l)}`, buf: after })
    } finally {
      await run.close()
    }
  })
}

test('英文：设置里那一节、导入弹窗 · A 深湖', async () => {
  const l = LOOKS[1]!
  const run = await launch({ settings: LOOK(l.skin, l.frame, 'en'), size: { width: W, height: H }, reminders: SEED })
  const { page } = run
  try {
    await run.app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w as number, h as number), [W, H] as const)
    await connect(page)
    await scrollToRem(page)
    const set = await shot(run)
    await page.locator('[data-row="remImport"]').getByRole('button').click()
    const dlg = page.locator('.impw')
    await dlg.getByRole('checkbox', { name: /购物/ }).click()
    await dlg.getByRole('checkbox', { name: /工作/ }).click()
    await dlg.getByRole('button', { name: 'Preview' }).click()
    await dlg.locator('.impfile').first().waitFor()
    const preview = await shot(run)
    await pair('8-english-dark', { title: 'English · Settings › Reminders · A 深湖', buf: set }, { title: 'English · Import from Reminders · Preview · A 深湖', buf: preview })
  } finally {
    await run.close()
  }
})

/** 「在哪」标注图：主窗口（详情、底栏）和设置弹窗（提醒事项一节）、导入弹窗，编号框 */
test('在哪 · B 天青', async () => {
  const l = LOOKS[0]!
  const run = await start(l)
  const { page } = run
  try {
    await connect(page)
    await scrollToRem(page)
    const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!
    const s1 = await box('.setw .sgroup:has([data-row="rem"])')
    const setShot = await shot(run)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(5600)
    await page.locator('.row', { hasText: '交论文初稿' }).first().click()
    await page.waitForTimeout(300)
    const d2 = await box('[data-part="详情"] .remby')
    const st3 = await box('.status button:has-text("提醒事项已连接")')
    const mainShot = await shot(run)
    await page.locator('.ab[data-k="settings"]').click()
    await page.locator('[data-row="remImport"]').getByRole('button').click()
    const dlg = page.locator('.impw')
    await dlg.getByRole('checkbox', { name: /购物/ }).click()
    const i4 = await box('.impw')
    const impShot = await shot(run)
    const mark = (n: number, r: { x: number; y: number; width: number; height: number }) =>
      `<div style="position:absolute;left:${r.x - 6}px;top:${r.y - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;border:3px solid #e5484d;border-radius:10px"><b style="position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:14px;background:#e5484d;color:#fff;display:grid;place-items:center;font:700 16px -apple-system">${n}</b></div>`
    const frame = (buf: Buffer, marks: string, title: string) =>
      `<div><div style="font-weight:600;margin:0 0 8px">${title}</div><div style="position:relative;width:${W}px;height:${H}px;box-shadow:0 0 0 1px rgba(0,0,0,.15)"><img src="${img(buf)}" width="${W}" height="${H}">${marks}</div></div>`
    const b = await chromium.launch({ executablePath: shell() })
    try {
      const p = await b.newPage({ viewport: { width: W * 3 + 80, height: H + 70 }, deviceScaleFactor: 1 })
      await p.setContent(`<html><body style="margin:0;padding:14px 20px;background:#e9eef1;font:15px -apple-system,'PingFang SC',sans-serif;color:#0f2230;display:flex;gap:20px">
        ${frame(mainShot, mark(2, d2) + mark(3, st3), '主窗口：2 详情「提醒事项里响」· 3 底栏「提醒事项已连接」')}
        ${frame(setShot, mark(1, s1), '1 设置 › 提醒事项（连接、镜像开关、放进哪个列表、导入）')}
        ${frame(impShot, mark(4, i4), '4 导入提醒事项（设置里「导入…」、⌘K 也能开）')}</body></html>`)
      mkdirSync(OUT!, { recursive: true })
      writeFileSync(join(OUT!, 'where.png'), await p.screenshot({ fullPage: true }))
    } finally {
      await b.close()
    }
  } finally {
    await run.close()
  }
})
