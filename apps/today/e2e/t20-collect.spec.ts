/**
 * 全库待办收齐（画布今日地基，用户真库 1192 条只收到 1040 条、401 条日子没认出来）：
 * - 引用块、提示块里的「> - [ ]」收进来，勾掉时「> 」留着
 * - 行尾有 ^块编号、#标签、<!-- 注释 --> 的，前面的 📅 照认；勾掉时 ✅ 加在块编号前面
 * - ⏳ 计划日、Dataview 的 [due:: …] 认成日子；[/] 进行中半格、[-] 取消一道横线（点了改回没做完）
 * - 滴答同步抄进几篇日记的同一条只显示一份（写着几处）；勾掉、拖到明天，几篇里的每一份都改，一个撤销回到原来的字节
 * 一律真点、真拖；无头（CT_E2E=1）、临时库。
 */
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { commits, dragTo, launch, nav, row } from './app'

const D1 = '日记/2026-11-18.md'
const D2 = '日记/2026-11-19.md'
const D3 = '日记/2026-11-20.md'
const HW = '课程/作业.md'
const FILES: Record<string, string> = {
  [D1]: '# 2026-11-18\n\n- [ ] 🚗 驾照刷题 📅 2026-11-17 ^dida-6a98574d\n- [x] meeting ✅ 2026-11-18 ^dida-6a97eec6\n',
  [D2]: '# 2026-11-19\n\n- [ ] 🚗 驾照刷题 📅 2026-11-17 ^dida-6a98574d\n- [ ] 给房东转账 📅 2026-11-21 ^dida-67a15930\n',
  // Windows 换行的一篇：改完 \r\n 一个不少
  [D3]: '# 2026-11-20\r\n\r\n- [ ] 🚗 驾照刷题 📅 2026-11-17 ^dida-6a98574d\r\n- [ ] 给房东转账📅 2026-11-21 ^dida-67a15930334c517faa13ab5a\r\n',
  [HW]: '# 作业\n\n> [!todo] 这周要交\n> - [ ] Q1 读完 11 个原子 📅 2026-11-22\n> - [x] Q0 编译通过 ✅ 2026-11-20\n\n- [/] 做了一半的实验 📅 2026-11-22\n- [-] 不做的那一条 📅 2026-11-22\n- [ ] 导图主题 📅 2026-11-22 <!-- id=k1 -->\n- [ ] 行尾标签 📅 2026-11-23 #工作\n- [ ] 内联字段 [due:: 2026-11-22] [priority:: high]\n- [ ] 只有计划日 ⏳ 2026-11-22\n',
  '收件箱/待办.md': '# 待办\n\n- [ ] 买打印纸\n',
}

/** 两份字只差第 n 行（按 \n 切，\r 留在行里） */
function onlyLine(before: string, after: string, n: number) {
  const a = before.split('\n')
  const b = after.split('\n')
  expect(b.length).toBe(a.length)
  a.forEach((l, i) => {
    if (i !== n) expect(b[i], `第 ${i + 1} 行不该变`).toBe(l)
  })
  return b[n]
}

test('今天：引用里的、行尾带编号 / 注释的、⏳、due:: 都在；抄在三篇日记里的驾照刷题只一条，写着 3 处；左栏不列只有抄件的日记', async () => {
  const run = await launch({ files: FILES })
  const { page } = run
  try {
    await nav(page, 'today').click()
    const center = page.locator('.center')
    const titles = () => center.locator('.row .rt').allTextContents()
    // 标题里不再带着「📅 2026-11-17 ^dida-…」
    await expect.poll(titles).toEqual(expect.arrayContaining(['🚗 驾照刷题', '给房东转账', 'Q1 读完 11 个原子', '做了一半的实验', '导图主题', '内联字段', '只有计划日']))
    const all = await titles()
    expect(all.filter((t) => t === '🚗 驾照刷题')).toHaveLength(1)
    // 给房东转账：短编号、长编号两种，📅 前面一个有空格一个没有，同一天：也是一条
    expect(all.filter((t) => t.startsWith('给房东转账'))).toHaveLength(1)
    expect(all.some((t) => /📅|\^dida|<!--|due::|⏳/.test(t))).toBe(false)
    // 取消了的不在「今天」
    expect(all).not.toContain('不做的那一条')
    await expect(row(page, '驾照刷题').locator('.acc.dup')).toHaveText('3处')
    await expect(row(page, '驾照刷题').locator('.acc.dup')).toHaveAttribute('title', /抄在3处/)
    await expect(row(page, '给房东转账').locator('.acc.dup')).toHaveText('2处')
    // 进行中：勾选框填一半
    await expect(row(page, '做了一半的实验').locator('.cb')).toHaveClass(/half/)
    // 行尾 #标签 的那条明天到期
    await expect(page.locator('.center .grp', { hasText: '明天' })).toBeVisible()
    // 左栏「有待办的笔记」：只有抄件的两篇日记不列，显示那一份所在的最新一篇列着
    await expect(nav(page, `list:${HW}`)).toBeVisible()
    await expect(nav(page, `list:${D3}`)).toBeVisible()
    await expect(nav(page, `list:${D1}`)).toHaveCount(0)
    await expect(nav(page, `list:${D2}`)).toHaveCount(0)
  } finally {
    await run.close()
  }
})

test('勾掉抄了三遍的「驾照刷题」：三篇各只改那一行，✅ 在 ^块编号前面、\\r\\n 不动；一次提交；撤销三篇回到原来的字节', async () => {
  const run = await launch({ files: FILES })
  const { page } = run
  try {
    await nav(page, 'today').click()
    const before = [D1, D2, D3].map((p) => run.read(p))
    await row(page, '驾照刷题').locator('.cb').click()
    await expect(page.locator('.toast')).toContainText('勾掉了「🚗 驾照刷题」')
    await expect(page.locator('.toast')).toContainText('3处一起勾上了')
    await expect.poll(() => run.read(D1)).not.toBe(before[0])
    expect(onlyLine(before[0]!, run.read(D1), 2)).toBe('- [x] 🚗 驾照刷题 📅 2026-11-17 ✅ 2026-11-22 ^dida-6a98574d')
    expect(onlyLine(before[1]!, run.read(D2), 2)).toBe('- [x] 🚗 驾照刷题 📅 2026-11-17 ✅ 2026-11-22 ^dida-6a98574d')
    expect(onlyLine(before[2]!, run.read(D3), 2)).toBe('- [x] 🚗 驾照刷题 📅 2026-11-17 ✅ 2026-11-22 ^dida-6a98574d\r')
    await expect.poll(() => commits(run.vault)[0]).toBe('画布今日：勾掉「🚗 驾照刷题」（3处一起改）')
    // 那一次提交只动了三篇、每篇一行
    const stat = execFileSync('git', ['-C', run.vault, 'show', '--numstat', '--format=', 'HEAD'], { encoding: 'utf8' }).trim().split('\n').sort()
    expect(stat).toEqual([`1\t1\t${D1}`, `1\t1\t${D2}`, `1\t1\t${D3}`])
    // 列表里还是一条（今天勾掉的那组，划掉）
    await expect(page.locator('.center .row.done .rt', { hasText: /^🚗 驾照刷题$/ })).toHaveCount(1)
    await expect(page.locator('.center .row .rt', { hasText: /^🚗 驾照刷题$/ })).toHaveCount(1)
    await page.locator('.toast').getByRole('button', { name: '撤回' }).click()
    await expect.poll(() => [D1, D2, D3].map((p) => run.read(p))).toEqual(before)
  } finally {
    await run.close()
  }
})

test('提示块里的待办勾掉：「> 」留着，✅ 在行尾；进行中的勾掉变 [x]；取消了的在那一篇里划掉，点一下改回没做完', async () => {
  const run = await launch({ files: FILES })
  const { page } = run
  try {
    await nav(page, 'today').click()
    const before = run.read(HW)
    await row(page, 'Q1 读完 11 个原子').locator('.cb').click()
    await expect.poll(() => run.read(HW)).not.toBe(before)
    expect(onlyLine(before, run.read(HW), 3)).toBe('> - [x] Q1 读完 11 个原子 📅 2026-11-22 ✅ 2026-11-22')
    await page.locator('.toast').getByRole('button', { name: '撤回' }).click()
    await expect.poll(() => run.read(HW)).toBe(before)

    await row(page, '做了一半的实验').locator('.cb').click()
    await expect.poll(() => run.read(HW)).not.toBe(before)
    expect(onlyLine(before, run.read(HW), 6)).toBe('- [x] 做了一半的实验 📅 2026-11-22 ✅ 2026-11-22')
    await page.locator('.toast').getByRole('button', { name: '撤回' }).click()
    await expect.poll(() => run.read(HW)).toBe(before)

    // 那一篇：取消了的也列着，划掉、勾选框一道横线
    await nav(page, `list:${HW}`).click()
    const cancelled = row(page, '不做的那一条')
    await expect(cancelled).toHaveClass(/cancel/)
    await expect(cancelled.locator('.cb')).toHaveClass(/off/)
    await expect(cancelled.locator('.rt')).toHaveCSS('text-decoration-line', 'line-through')
    await cancelled.locator('.cb').click()
    await expect.poll(() => run.read(HW)).not.toBe(before)
    expect(onlyLine(before, run.read(HW), 7)).toBe('- [ ] 不做的那一条 📅 2026-11-22')
  } finally {
    await run.close()
  }
})

test('拖「给房东转账」到左栏「明天」：两篇日记里的 📅 都换成明天，块编号还在行尾；内联字段的日子照 [due:: ] 的写法改', async () => {
  const run = await launch({ files: FILES })
  const { page } = run
  try {
    await nav(page, 'today').click()
    const b2 = run.read(D2)
    const b3 = run.read(D3)
    await dragTo(page, row(page, '给房东转账'), nav(page, 'tomorrow'))
    await expect.poll(() => run.read(D2)).not.toBe(b2)
    expect(onlyLine(b2, run.read(D2), 3)).toBe('- [ ] 给房东转账 📅 2026-11-23 ^dida-67a15930')
    expect(onlyLine(b3, run.read(D3), 3)).toBe('- [ ] 给房东转账📅 2026-11-23 ^dida-67a15930334c517faa13ab5a\r')
    // 那一篇里拖（今天那页刚重排过，换个稳的地方拖）
    await nav(page, `list:${HW}`).click()
    await expect(row(page, '内联字段')).toBeVisible()
    const hw = run.read(HW)
    await dragTo(page, row(page, '内联字段'), nav(page, 'tomorrow'))
    await expect.poll(() => run.read(HW)).not.toBe(hw)
    expect(onlyLine(hw, run.read(HW), 10)).toBe('- [ ] 内联字段 [due:: 2026-11-23] [priority:: high]')
  } finally {
    await run.close()
  }
})
