/**
 * 排一天「从全库挑」加「别的笔记里没定日子的」（用户「可以 加进来」）：真点。
 * 一篇一行、默认收着，笔记按最近改过的在前；隐藏文件夹里的不出现，.首页.json 旁边的笔记照常出现；
 * 点开看、一篇超过 5 条「再看 N 条」；「+ 今天做」那一行写上今天、一次提交、能撤回。
 */
import { expect, test } from '@playwright/test'
import { utimesSync } from 'node:fs'
import { join } from 'node:path'
import { commits, launch, LOOK, quit } from './app'

const NOW = '2026-11-25T10:10:00'

const FILES: Record<string, string> = {
  '收件箱/待办.md': '# 待办\n\n- [ ] 收件箱里没日子的\n',
  '项目/新想法.md': '# 新想法\n\n' + ['一', '二', '三', '四', '五', '六', '七'].map((n) => `- [ ] 想法${n}\n`).join('') + '- [ ] 有日子的 📅 2026-12-01\n- [x] 做完的\n',
  '课程/ecp/讲义.md': '# 讲义\n\n- [ ] 推一遍链式法则\n',
  '课程/ecp/.首页.json': '{"cards":[]}\n',
  '阅读/书单.md': '# 书单\n\n- [ ] 读《人类简史》\n- [ ] 读《枪炮、病菌与钢铁》\n',
  '.隐藏/秘密.md': '# 秘密\n\n- [ ] 隐藏文件夹里的\n',
}

/** 改动时间：项目/新想法 最近，课程/ecp/讲义 其次，阅读/书单 最早 */
function prepare(vault: string) {
  const at = (p: string, d: string) => utimesSync(join(vault, p), new Date(d), new Date(d))
  at('阅读/书单.md', '2026-11-01T09:00:00')
  at('课程/ecp/讲义.md', '2026-11-20T09:00:00')
  at('项目/新想法.md', '2026-11-24T21:00:00')
}

test('从全库挑：别的笔记里没定日子的按笔记收着、最近改过的在前、隐藏的不出、点开、再看 N 条、+ 今天做写进文件能撤回', async () => {
  test.setTimeout(180_000)
  const settings = { ...LOOK('mint', 'b'), plan: { onOpen: true, tray: true, journal: null } }
  const run = await launch({ files: FILES, prepare, settings, now: NOW, size: { width: 1470, height: 956 } })
  const { page } = run
  try {
    await page.locator('.pstep[data-step="pick"]').click()
    const grp = page.locator('[data-part="别的笔记"]')
    await expect(grp).toBeVisible()
    await expect(grp.locator('.pgrp')).toContainText('别的笔记里没定日子的')
    await expect(grp.locator('.pgrp .n')).toHaveText('10')
    // 一篇一行，最近改过的在前；收件箱、隐藏文件夹里的不在这组
    const notes = grp.locator('.pnote-g')
    await expect(notes).toHaveCount(3)
    expect(await notes.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.note))).toEqual(['项目/新想法.md', '课程/ecp/讲义.md', '阅读/书单.md'])
    await expect(page.getByText('隐藏文件夹里的')).toHaveCount(0)
    await expect(grp).not.toContainText('收件箱里没日子的')
    await expect(page.locator('[data-part="收件箱"]')).toContainText('收件箱里没日子的')
    // 默认收着：一行笔记名 + 条数，没有任务行
    await expect(grp.locator('.prow')).toHaveCount(0)
    const head = grp.locator('[data-note="项目/新想法.md"] .pnote-h')
    await expect(head).toContainText('项目 › 新想法')
    await expect(head.locator('.n')).toHaveText('7')
    await expect(head).toHaveAttribute('aria-expanded', 'false')

    // 点开：先露 5 条，「再看2条」
    await head.click()
    await expect(head).toHaveAttribute('aria-expanded', 'true')
    const rows = grp.locator('[data-note="项目/新想法.md"] .prow')
    await expect(rows).toHaveCount(5)
    await expect(rows.first()).toContainText('想法一')
    const more = grp.locator('[data-note="项目/新想法.md"]').getByRole('button', { name: '再看2条' })
    await expect(more).toBeVisible()
    await more.click()
    await expect(rows).toHaveCount(7)
    await expect(more).toHaveCount(0)
    // 有日子的、做完的不在
    await expect(grp).not.toContainText('有日子的')
    await expect(grp).not.toContainText('做完的')

    // .首页.json 旁边的笔记照常出现
    await grp.locator('[data-note="课程/ecp/讲义.md"] .pnote-h').click()
    await expect(grp.locator('[data-note="课程/ecp/讲义.md"] .prow')).toContainText('推一遍链式法则')

    // 「+ 今天做」：那一行写上今天、一次提交，挪进上面「今天」那组
    const six = rows.filter({ hasText: '想法六' })
    await six.getByRole('button', { name: '今天做' }).click()
    await expect.poll(() => run.read('项目/新想法.md')).toContain('- [ ] 想法六 📅 2026-11-25\n')
    await expect.poll(() => commits(run.vault)[0]).toBe('画布今日：「想法六」改到 2026-11-25')
    await expect(page.locator('[data-part="今天的"]')).toContainText('想法六')
    await expect(grp.locator('[data-note="项目/新想法.md"] .pnote-h .n')).toHaveText('6')
    // 撤回：回原样，又回到这一组
    await page.locator('.toast').getByRole('button', { name: '撤回' }).click()
    await expect.poll(() => run.read('项目/新想法.md')).toContain('- [ ] 想法六\n')
    await expect(grp.locator('[data-note="项目/新想法.md"] .pnote-h .n')).toHaveText('7')
    // 再收起
    await head.click()
    await expect(rows).toHaveCount(0)
  } finally {
    await quit(run)
  }
})
