/**
 * 两个软件之间的链接：
 * 「打开笔记，到这一行」→ canvas-notes://open?file=<库里的路径>&line=<第几行>（测试模式里「用浏览器打开」换成记录器，记下网址）；
 * canvas-today://task/<🆔>（画布笔记、通知、提醒事项里的链接）→ 选中那一条、换到能看到它的那一页、闪一下。
 */
import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import electronPath from 'electron'
import { launch, row } from './app'
import { armMenus, pickMenu } from './menu'

const screenLog = (run: Awaited<ReturnType<typeof launch>>) => run.app.evaluate(() => (globalThis as unknown as { cnScreen: string[] }).cnScreen)

test('「打开笔记，到这一行」：交给画布笔记 canvas-notes://open?file=…&line=…；右键里那一项、清单底下「在画布笔记里打开这一篇」也是', async () => {
  const run = await launch()
  const { page } = run
  await armMenus(run)
  try {
    await row(page, '交论文初稿').click()
    await page.locator('[data-part="详情"]').getByRole('button', { name: '打开笔记，到这一行' }).click()
    await expect(page.locator('.toast')).toContainText('在画布笔记里打开《小论文计划》第11行')
    expect(await screenLog(run)).toContain('用浏览器打开 canvas-notes://open?file=%E5%86%99%E4%BD%9C%2F%E5%B0%8F%E8%AE%BA%E6%96%87%E8%AE%A1%E5%88%92.md&line=11')
    await row(page, '复习 Lecture05').click({ button: 'right' })
    await pickMenu(run, '打开笔记，到这一行')
    await expect.poll(async () => (await screenLog(run)).at(-1)).toBe(`用浏览器打开 canvas-notes://open?file=${encodeURIComponent('课程/ecp/Lecture05 笔记.md')}&line=7`)
    await page.locator('.nav[data-k="list:生活/冰岛行程.md"]').click()
    await page.getByRole('button', { name: '在画布笔记里打开这一篇' }).click()
    await expect.poll(async () => (await screenLog(run)).at(-1)).toBe(`用浏览器打开 canvas-notes://open?file=${encodeURIComponent('生活/冰岛行程.md')}`)
  } finally {
    await run.close()
  }
})

test('canvas-today://task/<🆔>：选中那一条，没有的说一句', async () => {
  const run = await launch({ files: { '收件箱/待办.md': '# 待办\n\n- [ ] 甲\n', '写作/周报.md': '# 周报\n\n- [ ] 写周报 📅 2026-11-29 🆔 zb0001\n' } })
  const { page } = run
  try {
    await run.app.evaluate(({ app }) => app.emit('open-url', { preventDefault() {} }, 'canvas-today://task/zb0001'))
    await expect(page.locator('.vhead h1')).toHaveText('周报')
    await expect(page.locator('[data-part="详情"] .dtitle input')).toHaveValue('写周报')
    await expect(row(page, '写周报')).toHaveClass(/on/)
    await run.app.evaluate(({ app }) => app.emit('open-url', { preventDefault() {} }, 'canvas-today://task/nope00'))
    await expect(page.locator('.toast')).toContainText('链接里的那一条找不到了')
  } finally {
    await run.close()
  }
})

/** 画布笔记构建好的主进程（私有仓库里先 cd apps/notes && npx electron-vite build；公开的 canvas-today 仓库里没有画布笔记，跳过） */
const NOTES_MAIN = join(__dirname, '../../notes/out/main/index.js')

test('一路走通：画布今日点「打开笔记，到这一行」得到的网址交给画布笔记，画布笔记开那一篇、光标在那一行', async () => {
  test.skip(!existsSync(NOTES_MAIN), '没有构建好的画布笔记')
  const run = await launch()
  const { page } = run
  try {
    await row(page, '交论文初稿').click()
    await page.locator('[data-part="详情"]').getByRole('button', { name: '打开笔记，到这一行' }).click()
    await expect.poll(async () => (await screenLog(run)).some((s) => s.startsWith('用浏览器打开 canvas-notes://'))).toBe(true)
    const url = (await screenLog(run)).find((s) => s.startsWith('用浏览器打开 canvas-notes://'))!.replace('用浏览器打开 ', '')
    // 同一个库起画布笔记（它自己的测试模式），把网址交给它
    const notes = await electron.launch({
      executablePath: electronPath as unknown as string,
      args: [NOTES_MAIN],
      env: { ...process.env, CN_E2E: '1', CN_VAULT: run.vault, CN_USER_DATA: join(run.root, 'notes-user'), CN_NO_AX: '1', CN_QUICK_KEY: 'Alt+Command+Shift+F19', CN_TRASH_DIR: join(run.root, 'trash') },
    })
    try {
      const np = await notes.firstWindow()
      await expect(np.locator('.vault b')).toHaveText('测试库')
      await notes.evaluate(({ app }, u) => app.emit('open-url', { preventDefault() {} }, u), url)
      await expect(np.locator('.tabs .tab.on')).toContainText('小论文计划')
      await expect
        .poll(() =>
          np.evaluate(() => {
            const n = document.getSelection()?.focusNode
            const el = (n?.nodeType === 1 ? n : n?.parentElement) as HTMLElement | null
            return el?.closest('.cm-line')?.textContent ?? ''
          }),
        )
        .toContain('交论文初稿')
    } finally {
      await notes.close()
    }
  } finally {
    await run.close()
  }
})
