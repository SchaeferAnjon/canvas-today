/**
 * 待办分类和画布笔记对齐（画布今日待办分类，用户「记得把canvas today也改了」）：左栏「全部」（含没写日子的，按文件夹、笔记分）、
 * 「已完成」（按完成那天倒着，点勾选框取消勾回到原来那组）、一篇笔记里勾掉的收成一行「已完成 N 条 ›」。规则是 @cn/tasks lists.ts 同一份。
 * 一律真点。CT_SHOTS=<目录> 时顺手截「全部」「已完成」两张（默认主题天青、浮岛书桌）。
 */
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launch, nav, row } from './app'

const SHOTS = process.env.CT_SHOTS

test('「全部」：没写日子的也在，按文件夹、笔记分；笔记里有日子的在前；点笔记名开这一篇；勾掉马上移走', async () => {
  const run = await launch()
  const { page } = run
  try {
    await nav(page, 'all').click()
    await expect(page.locator('.center h1')).toHaveText('全部')
    // 收件箱文件夹在最前，下面是「收件箱/待办」那篇，没写日子的「买打印纸」在里面
    const folders = page.locator('.center .grp.folder')
    await expect(folders.first()).toContainText('收件箱')
    await expect(folders).toContainText(['收件箱', '课程 › 线性代数', '课程 › ecp', '阅读', '周记', '写作', '项目', '生活'])
    await expect(row(page, '买打印纸')).toBeVisible()
    await expect(row(page, '读第四章')).toBeVisible()
    await expect(row(page, '换床单')).toBeVisible()
    // 已经勾掉的、取消了的不在「全部」
    await expect(page.locator('.center .row', { hasText: '和导师约时间' })).toHaveCount(0)
    await expect(page.locator('.center .row', { hasText: '不做的那一条' })).toHaveCount(0)
    // 一篇里：有日子的照日子在前，没写日子的在后（照文件里的先后）；笔记名下面不再写出处
    const paper = page.locator('.center .grp.notehead', { hasText: '小论文计划' })
    await expect(paper).toContainText('4')
    const titles = await page.locator('.center .row .rt').allInnerTexts()
    const i = titles.indexOf('读完三篇相关论文')
    expect(titles.slice(i, i + 4)).toEqual(['读完三篇相关论文', '交论文初稿', '补实验图', '改摘要'])
    expect(titles[i + 4]).toBe('写本周周报')
    await expect(row(page, '改摘要').locator('.acc.note')).toHaveCount(0)
    // 左栏的数是没做完的总数
    const n0 = Number(await nav(page, 'all').locator('.cnt').innerText())
    expect(n0).toBe(await page.locator('.center .row').count())
    if (SHOTS) await page.screenshot({ path: join(SHOTS, '1-全部.png') })
    // 勾掉「买打印纸」：马上从「全部」里移走，左栏的数少一
    await row(page, '买打印纸').locator('.cb').click()
    await expect(page.locator('.toast')).toContainText('勾掉了「买打印纸」')
    await expect(page.locator('.center .row', { hasText: '买打印纸' })).toHaveCount(0)
    await expect(nav(page, 'all').locator('.cnt')).toHaveText(String(n0 - 1))
    // 点笔记名：开这一篇的清单
    await paper.click()
    await expect(page.locator('.center h1')).toHaveText('小论文计划')
    await expect(nav(page, 'list:写作/小论文计划.md')).toHaveClass(/on/)
  } finally {
    await run.close()
  }
})

test('「已完成」：按完成那天倒着（今天勾的在最上），点勾选框取消勾，回到原来那组', async () => {
  const run = await launch()
  const { page } = run
  try {
    // 先在「全部」勾掉一条没日子的
    await nav(page, 'all').click()
    await row(page, '买打印纸').locator('.cb').click()
    await expect.poll(() => run.read('收件箱/待办.md')).toContain('- [x] 买打印纸 ✅ 2026-11-22')
    await nav(page, 'done').click()
    await expect(page.locator('.center h1')).toHaveText('已完成')
    await expect(page.locator('.center #qa')).toHaveCount(0)
    await expect(page.locator('.center .grp')).toHaveText(['今天 · 11月22日1', '昨天 · 11月21日1', '周五 · 11月20日1', '11月15日1', '11月14日1'])
    await expect(page.locator('.center .row .rt')).toHaveText(['买打印纸', '和导师约时间', '下载讲义', '买书', '交 ecp 作业 1'])
    // 一条子任务（没日子的「Attention Is All You Need」）不单列，和别的看法一样
    await expect(page.locator('.center .row', { hasText: 'Attention' })).toHaveCount(0)
    await expect(page.locator('.center .row.done')).toHaveCount(5)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, '2-已完成.png') })
    // 取消勾「和导师约时间」：文件里只那一行变回 - [ ]，从「已完成」移走，回到「全部」写作/小论文计划那组
    const before = run.read('写作/小论文计划.md')
    await row(page, '和导师约时间').locator('.cb').click()
    await expect(page.locator('.toast')).toContainText('和导师约时间')
    await expect.poll(() => run.read('写作/小论文计划.md')).toBe(before.replace('- [x] 和导师约时间 ✅ 2026-11-21', '- [ ] 和导师约时间'))
    await expect(page.locator('.center .row', { hasText: '和导师约时间' })).toHaveCount(0)
    await expect(page.locator('.center .grp', { hasText: '昨天' })).toHaveCount(0)
    await nav(page, 'all').click()
    await expect(row(page, '和导师约时间')).toBeVisible()
    // 没日子，照文件里的先后排在「改摘要」前面
    const titles = await page.locator('.center .row .rt').allInnerTexts()
    const i = titles.indexOf('读完三篇相关论文')
    expect(titles.slice(i, i + 5)).toEqual(['读完三篇相关论文', '交论文初稿', '补实验图', '和导师约时间', '改摘要'])
  } finally {
    await run.close()
  }
})

test('一篇笔记里勾掉的收成一行「已完成 N 条 ›」：默认收着，点开列出来（完成日子倒着）；再勾一条数加一', async () => {
  const run = await launch()
  const { page } = run
  try {
    await nav(page, 'list:写作/小论文计划.md').click()
    await expect(page.locator('.center h1')).toHaveText('小论文计划')
    const fold = page.locator('.center .more.donefold')
    await expect(fold).toHaveText('已完成 1 条 ›')
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.center .row', { hasText: '和导师约时间' })).toHaveCount(0)
    // 勾掉「改摘要」：从「## 下周」那组移进去
    await row(page, '改摘要').locator('.cb').click()
    await expect(fold).toHaveText('已完成 2 条 ›')
    await expect(page.locator('.center .row', { hasText: '改摘要' })).toHaveCount(0)
    await fold.click()
    await expect(fold).toHaveText('已完成 2 条 ⌄')
    // 今天勾的在上
    const done = page.locator('.center .row.done .rt')
    await expect(done).toHaveText(['改摘要', '和导师约时间'])
    // 在里面取消勾：回到原来那组
    await row(page, '改摘要').locator('.cb').click()
    await expect(fold).toHaveText('已完成 1 条 ⌄')
    await expect(page.locator('.center .row:not(.done)', { hasText: '改摘要' })).toBeVisible()
    // 换一篇再回来：又收着
    await nav(page, 'list:生活/冰岛行程.md').click()
    await expect(page.locator('.center .more.donefold')).toHaveCount(0)
    await nav(page, 'list:写作/小论文计划.md').click()
    await expect(page.locator('.center .more.donefold')).toHaveText('已完成 1 条 ›')
  } finally {
    await run.close()
  }
})
