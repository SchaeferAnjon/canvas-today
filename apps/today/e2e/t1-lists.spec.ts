/**
 * 清单：快速加一条、勾掉（只改那一行、字节对比）、重复的勾掉生成下一条、撤销回到原来的字节、拖到左栏「明天」、右键删除再撤销、子任务、详情改字段。
 * 一律真点、真打字、真拖、真右键（系统菜单用 e2e/menu.ts 读、点）。
 */
import { expect, test } from '@playwright/test'
import { commits, dragTo, launch, nav, row } from './app'
import { armMenus, openedMenu, pickMenu } from './menu'

/** 两份字只差第 n 行（行数一样），返回改后的那一行 */
function onlyLine(before: string, after: string, n: number) {
  const a = before.split('\n')
  const b = after.split('\n')
  expect(b.length).toBe(a.length)
  a.forEach((l, i) => {
    if (i !== n) expect(b[i], `第 ${i + 1} 行不该变`).toBe(l)
  })
  return b[n]
}

test('快速加「明天下午三点交论文」：先说认出了什么，回车写进 收件箱/待办.md 的最后一条后面，提交一次', async () => {
  const run = await launch()
  const { page } = run
  try {
    const before = run.read('收件箱/待办.md')
    const tomorrow = page.locator('.center .grp', { hasText: '明天' })
    const n0 = Number((await tomorrow.locator('.n').innerText()) || 0)
    await page.locator('#qa').click()
    await page.keyboard.type('明天下午三点交论文')
    await expect(page.locator('#qachips')).toContainText('认出来：')
    await expect(page.locator('#qachips .chip')).toHaveText('明天 15:00')
    await expect(page.locator('#qachips')).toContainText('「交论文」')
    await page.keyboard.press('Enter')
    await expect(page.locator('.toast')).toContainText('加上了「交论文」 · 明天 15:00')
    await expect(page.locator('.toast')).toContainText('写进了 收件箱/待办.md：- [ ] 交论文 📅 2026-11-23 15:00')
    await expect(page.locator('#qa')).toHaveValue('')
    expect(run.read('收件箱/待办.md')).toBe(before + '- [ ] 交论文 📅 2026-11-23 15:00\n')
    // 明天那一组多了一条（今天这页「明天」组）
    await expect(tomorrow.locator('.n')).toHaveText(String(n0 + 1))
    await expect.poll(() => commits(run.vault)[0]).toBe('画布今日：加了「交论文」')
  } finally {
    await run.close()
  }
})

test('勾掉「读完三篇相关论文」：文件里只那一行变成 - [x] … ✅ 今天；撤销回到原来的字节', async () => {
  const run = await launch()
  const { page } = run
  try {
    const before = run.read('写作/小论文计划.md')
    await row(page, '读完三篇相关论文').locator('.cb').click()
    await expect(page.locator('.toast')).toContainText('勾掉了「读完三篇相关论文」')
    await expect(page.locator('.toast')).toContainText('《小论文计划》第7行改成了 - [x]')
    await expect.poll(() => run.read('写作/小论文计划.md')).not.toBe(before)
    expect(onlyLine(before, run.read('写作/小论文计划.md'), 6)).toBe('- [x] 读完三篇相关论文 📅 2026-11-22 🔼 ✅ 2026-11-22')
    // 挪到「今天勾掉的」那一组
    await expect(page.locator('.center .grp', { hasText: '今天勾掉的' })).toBeVisible()
    await page.locator('.toast').getByRole('button', { name: '撤销' }).click()
    await expect(page.locator('.toast')).toContainText('撤销了')
    await expect.poll(() => run.read('写作/小论文计划.md')).toBe(before)
  } finally {
    await run.close()
  }
})

test('勾掉重复的「整理这周的读书笔记」：这一行打 ✅，下面加下一周的一行', async () => {
  const run = await launch()
  const { page } = run
  try {
    const before = run.read('周记/第47周.md')
    await row(page, '整理这周的读书笔记').locator('.cb').click()
    await expect(page.locator('.toast')).toContainText('下一次：11月29日 · 《第47周》里这一行打了 ✅，下面加了新的一行')
    await expect
      .poll(() => run.read('周记/第47周.md'))
      .toBe(before.replace('- [ ] 整理这周的读书笔记 📅 2026-11-22 🔁 每周日\n', '- [x] 整理这周的读书笔记 📅 2026-11-22 🔁 每周日 ✅ 2026-11-22\n- [ ] 整理这周的读书笔记 📅 2026-11-29 🔁 每周日\n'))
  } finally {
    await run.close()
  }
})

test('Windows 换行的一篇勾掉：别的行和 \\r\\n 一个字节不动', async () => {
  const run = await launch()
  const { page } = run
  try {
    const before = run.read('写作/周报.md')
    await row(page, '写本周周报').locator('.cb').click()
    await expect.poll(() => run.read('写作/周报.md')).not.toBe(before)
    // 重复的：这一行打 ✅，下面加下一周的一行，两行都是 \r\n
    expect(run.read('写作/周报.md')).toBe(before.replace('- [ ] 写本周周报 📅 2026-11-22 21:00 🔁 每周日\r\n', '- [x] 写本周周报 📅 2026-11-22 21:00 🔁 每周日 ✅ 2026-11-22\r\n- [ ] 写本周周报 📅 2026-11-29 21:00 🔁 每周日\r\n'))
  } finally {
    await run.close()
  }
})

test('拖到左栏「明天」：那一行的 📅 换成明天、钟点留着', async () => {
  const run = await launch()
  const { page } = run
  try {
    const before = run.read('课程/ecp/Lecture05 笔记.md')
    await dragTo(page, row(page, '复习 Lecture05'), nav(page, 'tomorrow'))
    await expect(page.locator('.toast')).toContainText('「复习 Lecture05 的神经元结构图」挪到了明天 11:00')
    await expect.poll(() => run.read('课程/ecp/Lecture05 笔记.md')).toBe(before.replace('📅 2026-11-22 11:00', '📅 2026-11-23 11:00'))
    // 拖到收件箱：去掉日子
    await nav(page, 'tomorrow').click()
    await dragTo(page, row(page, '复习 Lecture05'), nav(page, 'inbox'))
    await expect(page.locator('.toast')).toContainText('拿掉了日子')
    await expect.poll(() => run.read('课程/ecp/Lecture05 笔记.md')).toBe(before.replace(' 📅 2026-11-22 11:00', ''))
  } finally {
    await run.close()
  }
})

test('右键：系统菜单（今天、明天、下周的哪天，打开笔记，删除）；删除再撤销回到原来的字节', async () => {
  const run = await launch()
  const { page } = run
  await armMenus(run)
  try {
    const before = run.read('课程/ecp/Lecture05 笔记.md')
    await row(page, '交 ecp 作业 2').click({ button: 'right' })
    const m = await openedMenu(run)
    expect(m.map((i) => i.label)).toEqual(['今天', '明天', '周二', '—', '打开笔记，到这一行', '—', '删除'])
    expect(m.slice(0, 3).map((i) => i.sublabel)).toEqual(['11月22日', '11月23日', '11月24日'])
    await pickMenu(run, '删除')
    await expect(page.locator('.toast')).toContainText('删掉了「交 ecp 作业 2」')
    await expect(page.locator('.toast')).toContainText('《Lecture05 笔记》里这一行删掉了')
    await expect.poll(() => run.read('课程/ecp/Lecture05 笔记.md')).toBe(before.replace('- [ ] 交 ecp 作业 2 📅 2026-11-21 23:59 ⏫\n', ''))
    await expect(row(page, '交 ecp 作业 2')).toHaveCount(0)
    await page.locator('.toast').getByRole('button', { name: '撤销' }).click()
    await expect.poll(() => run.read('课程/ecp/Lecture05 笔记.md')).toBe(before)
    await expect(row(page, '交 ecp 作业 2')).toBeVisible()
    // 右键「明天」：改到明天
    await row(page, '交 ecp 作业 2').click({ button: 'right' })
    await pickMenu(run, '明天')
    await expect.poll(() => run.read('课程/ecp/Lecture05 笔记.md')).toBe(before.replace('📅 2026-11-21 23:59', '📅 2026-11-23 23:59'))
  } finally {
    await run.close()
  }
})

test('详情：改日子、时间、提醒、重复、优先级、标题、加一步子任务、勾子任务，「存在哪」那一行原文跟着变', async () => {
  const run = await launch()
  const { page } = run
  try {
    await row(page, '交论文初稿').click()
    const d = page.locator('[data-part="详情"]')
    const md = d.locator('.md')
    await expect(md).toHaveText('- [ ] 交论文初稿 📅 2026-11-23 15:00 🔔 提前1小时 ⏫')
    await expect(d.locator('.nh')).toHaveText('小论文计划第11行')
    await d.getByRole('button', { name: '周二' }).click()
    await expect(md).toHaveText('- [ ] 交论文初稿 📅 2026-11-24 15:00 🔔 提前1小时 ⏫')
    await d.getByLabel('时间').selectOption('18:30')
    await expect(md).toHaveText('- [ ] 交论文初稿 📅 2026-11-24 18:30 🔔 提前1小时 ⏫')
    await d.getByLabel('重复').selectOption('每周二')
    await expect(md).toHaveText('- [ ] 交论文初稿 📅 2026-11-24 18:30 🔔 提前1小时 🔁 每周二 ⏫')
    await d.getByRole('button', { name: '中', exact: true }).click()
    await expect(md).toHaveText('- [ ] 交论文初稿 📅 2026-11-24 18:30 🔔 提前1小时 🔁 每周二 🔼')
    await d.getByLabel('任务名').fill('交论文终稿')
    await d.getByLabel('任务名').press('Enter')
    await expect(md).toHaveText('- [ ] 交论文终稿 📅 2026-11-24 18:30 🔔 提前1小时 🔁 每周二 🔼')
    await d.getByLabel('加一步，回车').fill('导出 PDF')
    await d.getByLabel('加一步，回车').press('Enter')
    await expect(md).toHaveText('- [ ] 交论文终稿 📅 2026-11-24 18:30 🔔 提前1小时 🔁 每周二 🔼\n    - [ ] 导出 PDF')
    await d.getByRole('button', { name: '勾掉「导出 PDF」' }).click()
    await expect(md).toHaveText('- [ ] 交论文终稿 📅 2026-11-24 18:30 🔔 提前1小时 🔁 每周二 🔼\n    - [x] 导出 PDF ✅ 2026-11-22')
    await expect(d.locator('.dsec').first()).toContainText('1/1')
    await expect
      .poll(() => run.read('写作/小论文计划.md'))
      .toContain('- [ ] 交论文终稿 📅 2026-11-24 18:30 🔔 提前1小时 🔁 每周二 🔼\n    - [x] 导出 PDF ✅ 2026-11-22\n- [x] 和导师约时间')
    await d.getByRole('button', { name: '不定' }).click()
    await expect(md).toHaveText('- [ ] 交论文终稿 🔔 提前1小时 🔁 每周二 🔼\n    - [x] 导出 PDF ✅ 2026-11-22')
  } finally {
    await run.close()
  }
})

test('左栏：有待办的笔记点进去按 ## 标题分组，在这里加的写进这一篇；新清单', async () => {
  const run = await launch()
  const { page } = run
  try {
    await nav(page, 'list:写作/小论文计划.md').click()
    await expect(page.locator('.vhead h1')).toHaveText('小论文计划')
    await expect(page.locator('.vhead .t2')).toHaveText('写作/小论文计划.md')
    await expect(page.locator('.center .grp').nth(0)).toContainText('## 这周')
    await expect(page.locator('.center .grp').nth(1)).toContainText('## 下周')
    await page.locator('#qa').fill('查参考文献格式 !高')
    await page.locator('#qa').press('Enter')
    await expect.poll(() => run.read('写作/小论文计划.md')).toContain('- [ ] 改摘要\n- [ ] 查参考文献格式 ⏫\n')
    // 新清单
    await page.getByRole('button', { name: '新清单' }).click()
    await page.getByRole('textbox', { name: '新清单' }).fill('读书会')
    await page.getByRole('textbox', { name: '新清单' }).press('Enter')
    await expect(page.locator('.vhead h1')).toHaveText('读书会')
    await page.locator('#qa').fill('选下个月的书')
    await page.locator('#qa').press('Enter')
    await expect.poll(() => run.read('收件箱/读书会.md')).toBe('# 读书会\n\n- [ ] 选下个月的书\n')
  } finally {
    await run.close()
  }
})
