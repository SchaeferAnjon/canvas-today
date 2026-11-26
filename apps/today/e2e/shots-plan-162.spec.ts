/**
 * 交付页 162-排一天日历和拖进时间 的截图（照用户截图的场景：13 寸屏 1470×956、排一天「今天做什么」、左栏和右栏 AI 都开着）。
 * 只在给了 CT_SHOTS（目录）时跑；CT_SHOT_SKIN=mint|petrol（E 一条跑十套），
 * CT_SHOT_TAG 加在文件名前（修前 / 修后用同一份脚本分别跑两份构建）。都是真点真拖。
 */
import { expect, type Page, test } from '@playwright/test'
import { mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { launch, LOOK } from './app'

const DIR = process.env.CT_SHOTS
test.skip(!DIR, '只在截图时跑（CT_SHOTS=目录）')
// 机器忙时起软件、拖几下要一两分钟
test.setTimeout(300_000)

const SKIN = process.env.CT_SHOT_SKIN ?? 'mint'
const TAG = process.env.CT_SHOT_TAG ?? ''
const NOW = '2026-11-25T10:10:00'
const SIZE = { width: 1470, height: 956 }

/** 用户截图里那几条：收件箱里没日子、估了 2 时的「做一个类似于 folo 那样的软件」，20:00 的退租合同，14:15 的研讨课 */
export const USER_VAULT: Record<string, string> = {
  '收件箱/待办.md': '# 待办\n\n- [ ] 给房东退租合同 📅 2026-11-25 20:00\n- [ ] 做一个类似于 folo 那样的软件 [估时:: 2小时]\n- [ ] 买打印纸\n',
  '生活/日历.md': '# 日历\n\n- [ ] Environmental Humanities in Japan（硕士研讨课） 📅 2026-11-25 14:15\n- [ ] Emerging Computing Paradigms（讲课+练习） 📅 2026-11-25 09:00\n',
  '课程/ecp/作业.md': '# 作业\n\n- [ ] 交 ecp 作业 3 📅 2026-11-27\n',
}
export const USER_CAL = {
  calAuth: 'full',
  calendars: [
    { id: 'C-uni', title: '课程表', color: '#7C6FAE', source: 'iCloud' },
    { id: 'C-home', title: '家里', color: '#B0805A', source: 'iCloud' },
  ],
  events: [
    { id: 'e1', title: 'Emerging Computing Paradigms', calendar: 'C-uni', allDay: false, start: '2026-11-25T09:00', end: '2026-11-25T13:00' },
    { id: 'e2', title: 'Environmental Humanities in Japan', calendar: 'C-uni', allDay: false, start: '2026-11-25T14:15', end: '2026-11-25T15:45' },
  ],
}

export async function shot(page: Page, name: string) {
  mkdirSync(DIR!, { recursive: true })
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(DIR!, `${TAG}${name}.png`) })
}

export async function openPlan(o: { files?: Record<string, string>; ai?: boolean; video?: string; skin?: string; cal?: typeof USER_CAL } = {}) {
  const settings = { ...LOOK(o.skin ?? SKIN, 'b'), calendar: { show: true }, plan: { onOpen: true, tray: true, journal: null } }
  const run = await launch({ files: o.files ?? USER_VAULT, reminders: o.cal ?? USER_CAL, settings, now: NOW, size: SIZE, env: { CT_AI_FAKE: '1' }, video: o.video })
  const { page } = run
  await page.locator('.pstep[data-step="pick"]').click()
  await expect(page.locator('.phead h1')).toContainText('今天做什么')
  if (o.ai !== false) {
    await page.locator('.ab[data-k="ai"]').click()
    await expect(page.locator('.body > .right')).toBeVisible()
  }
  await page.mouse.move(5, 5)
  return run
}

test(`A 栏宽拖动 · ${SKIN}`, async () => {
  const run = await openPlan()
  const { page } = run
  try {
    await shot(page, `a-0-${SKIN}`)
    // 按住中间和右栏 AI 之间那道缝（用户红框圈的那条）往左拖 160，拖着时截一张
    const rp = (await page.locator('.body > .right').boundingBox())!
    const x = rp.x - 3
    const y = rp.y + rp.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - 80, y, { steps: 5 })
    await page.mouse.move(x - 160, y, { steps: 5 })
    await shot(page, `a-1-drag-right-${SKIN}`)
    await page.mouse.up()
    await page.mouse.move(5, 5)
    await shot(page, `a-2-after-right-${SKIN}`)
  } finally {
    await run.close()
  }
})

test(`B 今天的时间默认宽 · ${SKIN}`, async () => {
  const run = await openPlan()
  const { page } = run
  try {
    await shot(page, `b-ai-${SKIN}`)
    await page.locator('.ab[data-k="ai"]').click()
    await expect(page.locator('.body > .right')).toBeHidden()
    await page.mouse.move(5, 5)
    await shot(page, `b-noai-${SKIN}`)
    // 列表和「今天的时间」之间那道分隔往左拖 120：拖着时、松手后各一张
    await page.locator('.ab[data-k="ai"]').click()
    await expect(page.locator('.body > .right')).toBeVisible()
    const s = (await page.locator('[data-sash="day"]').boundingBox())!
    await page.mouse.move(s.x + s.width / 2, s.y + 300)
    await page.mouse.down()
    await page.mouse.move(s.x + s.width / 2 - 60, s.y + 300, { steps: 5 })
    await page.mouse.move(s.x + s.width / 2 - 120, s.y + 300, { steps: 5 })
    await shot(page, `b-drag-${SKIN}`)
    await page.mouse.up()
    await page.mouse.move(5, 5)
    await shot(page, `b-dragged-${SKIN}`)
  } finally {
    await run.close()
  }
})

/** 用户截图 r159/2 的样子：「做一个类似于 folo 那样的软件」在今天里、估了 2 时、还没钟点 */
const C_VAULT = { ...USER_VAULT, '课程/ecp/作业.md': '# 作业\n\n- [ ] 交 ecp 作业 3 📅 2026-11-27\n', '收件箱/待办.md': '# 待办\n\n- [ ] 给房东退租合同 📅 2026-11-25 20:00\n- [ ] 做一个类似于 folo 那样的软件 [估时:: 2小时] 📅 2026-11-25\n- [ ] 买打印纸\n' }

/** 录屏里叠一条「文件里这一行」（测试叠加，不是界面的一部分）：读库里那一行，放在左下角 */
async function fileLine(page: Page, read: () => string) {
  const line = read().split('\n').find((l) => l.includes('folo')) ?? ''
  await page.evaluate((text) => {
    let el = document.getElementById('shot-file-line')
    if (!el) {
      el = document.createElement('div')
      el.id = 'shot-file-line'
      el.style.cssText = 'position:fixed;left:58px;bottom:44px;width:216px;z-index:9999;padding:8px 10px;border-radius:8px;background:rgba(20,24,28,.88);color:#e8f0ee;font:11px/1.5 ui-monospace,Menlo,monospace;pointer-events:none;white-space:pre-wrap;overflow-wrap:anywhere'
      document.body.appendChild(el)
    }
    el.textContent = '测试叠加：文件里这一行\n收件箱/待办.md\n' + text
  }, line)
}

test(`C 今天做什么拖进时间 · ${SKIN}`, async () => {
  const vid = join(DIR!, 'video-tmp')
  const run = await openPlan({ files: C_VAULT, ai: false, video: SKIN === 'mint' ? vid : undefined })
  const { page } = run
  try {
    const col = page.locator('.pday .cal-col[data-drop="day:2026-11-25"]')
    const hour = Number(await col.getAttribute('data-hour'))
    await col.evaluate((el, y) => el.closest('.cal-week')!.scrollTo({ top: y }), 8 * hour)
    await fileLine(page, () => run.read('收件箱/待办.md'))
    await page.waitForTimeout(800)
    await shot(page, `c-0-${SKIN}`)
    const row = page.locator('.prow[data-drag]', { hasText: '做一个类似于 folo 那样的软件' })
    const a = (await row.boundingBox())!
    const b = (await col.boundingBox())!
    await page.mouse.move(a.x + 120, a.y + a.height / 2, { steps: 4 })
    await page.waitForTimeout(400)
    await page.mouse.down()
    await page.mouse.move(a.x + 140, a.y + a.height / 2 + 10, { steps: 6 })
    await page.mouse.move(b.x + b.width / 2, b.y + 16 * hour + 4, { steps: 30 })
    await page.waitForTimeout(500)
    await page.mouse.move(b.x + b.width / 2, b.y + 15 * hour + 4, { steps: 20 })
    await page.waitForTimeout(700)
    await shot(page, `c-1-drag-${SKIN}`)
    await page.mouse.up()
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('📅 2026-11-25 15:00')
    await fileLine(page, () => run.read('收件箱/待办.md'))
    await page.mouse.move(5, 5, { steps: 6 })
    await page.waitForTimeout(600)
    await shot(page, `c-2-dropped-${SKIN}`)
    await page.waitForTimeout(1500)
    // 已排的块拖动改钟点：15:00 → 17:00
    const blk = page.locator('.pday .cal-blk[data-drag]', { hasText: '做一个类似于 folo 那样的软件' })
    const k = (await blk.boundingBox())!
    await page.mouse.move(k.x + 40, k.y + 20, { steps: 4 })
    await page.mouse.down()
    await page.mouse.move(k.x + 44, k.y + 30, { steps: 4 })
    await page.mouse.move(k.x + 40, b.y + 17 * hour + 4, { steps: 20 })
    await page.waitForTimeout(500)
    await shot(page, `c-3-move-${SKIN}`)
    await page.mouse.up()
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('📅 2026-11-25 17:00')
    await fileLine(page, () => run.read('收件箱/待办.md'))
    await page.mouse.move(5, 5, { steps: 6 })
    await page.waitForTimeout(1500)
    await shot(page, `c-4-moved-${SKIN}`)
  } finally {
    const v = SKIN === 'mint' ? page.video() : null
    await run.close()
    if (v) renameSync(await v.path(), join(DIR!, `${TAG}c-drag.webm`))
  }
})

/** 「从全库挑」加「别的笔记里没定日子的」：几篇笔记各有没日子的，一篇 7 条（再看 2 条） */
const D_VAULT: Record<string, string> = {
  ...USER_VAULT,
  '项目/画布订阅.md':
    '# 画布订阅\n\n' +
    ['抓 RSS 的超时设成 10 秒', '订阅列表能拖着排顺序', '文章存进画布笔记时带原文链接', '没读的数字放在图标上', '导入 OPML', '全文抓取失败时退回摘要', '夜间模式下图片不发白'].map((x) => `- [ ] ${x}\n`).join(''),
  '阅读/书单.md': '# 书单\n\n- [ ] 读《人类简史》\n- [ ] 读《枪炮、病菌与钢铁》\n',
  '生活/家务.md': '# 家务\n\n- [ ] 换床单\n',
}

test(`D 从全库挑加没日子的 · ${SKIN}`, async () => {
  const run = await openPlan({ files: D_VAULT, ai: false })
  const { page } = run
  try {
    const grp = page.locator('[data-part="别的笔记"]')
    await grp.scrollIntoViewIfNeeded()
    await page.mouse.move(5, 5)
    await shot(page, `d-0-closed-${SKIN}`)
    await grp.locator('[data-note="项目/画布订阅.md"] .pnote-h').click()
    await page.mouse.move(5, 5)
    await grp.scrollIntoViewIfNeeded()
    await shot(page, `d-1-open-${SKIN}`)
    await grp.getByRole('button', { name: '再看2条' }).click()
    await page.mouse.move(5, 5)
    await page.locator('.pmain').evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    await shot(page, `d-2-more-${SKIN}`)
  } finally {
    await run.close()
  }
})

/** 块颜色那一节：时间线上有排了钟点的待办（有估时、没估时）、做完的，日程用系统日历的几种颜色 */
const E_VAULT: Record<string, string> = {
  ...USER_VAULT,
  '收件箱/待办.md': '# 待办\n\n- [ ] 给房东退租合同 📅 2026-11-25 20:00\n- [ ] 做一个类似于 folo 那样的软件 [估时:: 2小时] 📅 2026-11-25 16:00\n- [x] 买打印纸 📅 2026-11-25 11:00 ✅ 2026-11-25\n',
}

/** 系统日历的几种默认颜色各一个日程 */
const E_CAL = {
  ...USER_CAL,
  calendars: [...USER_CAL.calendars, { id: 'C-red', title: '工作', color: '#FF3B30', source: 'iCloud' }, { id: 'C-blue', title: '家人', color: '#007AFF', source: 'iCloud' }, { id: 'C-yel', title: '生日', color: '#FFCC00', source: 'iCloud' }],
  events: [
    ...USER_CAL.events,
    { id: 'e3', title: '组会', calendar: 'C-red', allDay: false, start: '2026-11-25T18:00', end: '2026-11-25T19:00' },
    { id: 'e4', title: '和爸妈视频', calendar: 'C-blue', allDay: false, start: '2026-11-25T19:00', end: '2026-11-25T20:00' },
    { id: 'e5', title: '小林生日', calendar: 'C-yel', allDay: false, start: '2026-11-25T13:00', end: '2026-11-25T14:00' },
  ],
}

const SKINS10 = ['mint', 'sky', 'sakura', 'lilac', 'stone', 'pine', 'petrol', 'cocoa', 'ink', 'graphite']

test('E 十套主题的日历块（排一天那一屏，再加深湖的周看法、月看法）', async () => {
  test.skip(SKIN !== 'mint', '十套一次跑完，只在默认那一遍跑')
  for (const skin of SKINS10) {
    const run = await openPlan({ files: E_VAULT, ai: false, skin, cal: E_CAL })
    const { page } = run
    try {
      const col = page.locator('.pday .cal-col[data-drop="day:2026-11-25"]')
      const hour = Number(await col.getAttribute('data-hour'))
      await col.evaluate((el, y) => el.closest('.cal-week')!.scrollTo({ top: y }), 8.5 * hour)
      await page.mouse.move(5, 5)
      await shot(page, `e-${skin}`)
      if (skin === 'petrol') {
        await page.locator('.ab[data-k="calendar"]').click()
        await page.waitForTimeout(400)
        await shot(page, 'e-petrol-week')
        await page.locator('.cal-seg button', { hasText: '月' }).click()
        await shot(page, 'e-petrol-month')
      }
    } finally {
      await run.close()
    }
  }
})

/** 第三轮（块颜色四处）：周五那天 5 条待办（月看法「还有N条」），今天有排了钟点的、没排的 */
const F_VAULT: Record<string, string> = {
  ...E_VAULT,
  '收件箱/待办.md': E_VAULT['收件箱/待办.md']! + '- [ ] 买打印纸 [估时:: 1小时]\n' + ['交房租', '给猫买粮', '回导师邮件', '取快递', '订周末的票'].map((x) => `- [ ] ${x} 📅 2026-11-27\n`).join(''),
}

test('F 块颜色四处：日视图四套、月看法某天 5 条、拖进时间线后的提示条', async () => {
  test.skip(SKIN !== 'mint', '一次跑完，只在默认那一遍跑')
  for (const skin of ['petrol', 'ink', 'pine', 'mint']) {
    const run = await openPlan({ files: F_VAULT, ai: false, skin, cal: E_CAL })
    const { page } = run
    try {
      const col = page.locator('.pday .cal-col[data-drop="day:2026-11-25"]')
      const hour = Number(await col.getAttribute('data-hour'))
      await col.evaluate((el, y) => el.closest('.cal-week')!.scrollTo({ top: y }), 8.5 * hour)
      await page.mouse.move(5, 5)
      await shot(page, `r3-day-${skin}`)
      if (skin === 'petrol' || skin === 'mint') {
        // 拖「买打印纸」到 10:30，截提示条
        const row = page.locator('.prow[data-drag]', { hasText: '买打印纸' })
        const a = (await row.boundingBox())!
        const b = (await col.boundingBox())!
        await page.mouse.move(a.x + 60, a.y + a.height / 2)
        await page.mouse.down()
        await page.mouse.move(a.x + 80, a.y + a.height / 2 + 10, { steps: 4 })
        await page.mouse.move(b.x + b.width / 2, b.y + 10.5 * hour + 4, { steps: 12 })
        await page.mouse.up()
        await page.locator('.toast').waitFor()
        await page.mouse.move(5, 5)
        await shot(page, `r3-toast-${skin}`)
        // 月看法：周五 5 条
        await page.locator('.ab[data-k="calendar"]').click()
        await page.locator('.cal-seg button', { hasText: '月' }).click()
        await page.mouse.move(5, 5)
        await shot(page, `r3-month-${skin}`)
        const more = page.locator('.cal-mcell[data-drop="mday:2026-11-27"] button.cal-more')
        if (await more.count()) {
          await more.click()
          await shot(page, `r3-month-open-${skin}`)
        }
      }
    } finally {
      await run.close()
    }
  }
})
