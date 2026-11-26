/**
 * 真的 Claude Code 走一遍全局快速输入框问 AI（方案 B）。平时跳过：
 *   CT_REAL_AI=1 npx playwright test e2e/real-quick.spec.ts（跑之前去掉继承来的 CLAUDECODE、CLAUDE_CODE_* 这些环境变量，留着 CLAUDE_CONFIG_DIR）
 * 测试库是 launch 建的临时库，不碰真的笔记库。打到输出里：每一问用了多久、回答、库里多了什么。
 * 1. 全能模式关着：贴一张蓝色的图问「这张图是什么颜色」，只回答（答里有「蓝」，库里不变）
 * 2. 在小框里打开全能模式，说「明天下午三点交报告加个待办」：库里真多一条交报告，日子是明天 15:00
 */
import { expect, type Page, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, type Running } from './app'
import { solidPng } from '../../notes/e2e/fixtures/png'

test.skip(process.env.CT_REAL_AI !== '1', '真 AI：CT_REAL_AI=1 才跑')

const press = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctQuick: { press(): Promise<void> } }).ctQuick.press())

async function waitAnswer(qp: Page, n: number) {
  const talk = qp.locator('[data-part="小框里的对话"]')
  await expect(talk.locator('.qa-a:not(.qa-run)')).toHaveCount(n, { timeout: 600_000 })
  return talk.locator('.qa-a:not(.qa-run)').last()
}

test('真的 Claude Code：小框里贴图问一句（全能关着只回答），打开全能模式说加个待办真加上', async () => {
  test.setTimeout(1_200_000)
  const run = await launch()
  try {
    mkdirSync(join(run.root, 'notes-data', 'ai'), { recursive: true })
    writeFileSync(join(run.root, 'notes-data', 'ai', 'settings.json'), JSON.stringify({ omni: false }))
    await press(run)
    await expect.poll(() => run.app.windows().some((w) => w.url().endsWith('/quick.html'))).toBe(true)
    const qp = run.app.windows().find((w) => w.url().endsWith('/quick.html'))!
    const box = qp.locator('.qp textarea')
    await box.press('Tab')
    const sw = qp.locator('[data-part="全能模式"] [role="switch"]')
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    const inbox = run.read('收件箱/待办.md')

    await qp.evaluate(
      ([bytes]) => {
        const el = document.querySelector('.qp textarea') as HTMLTextAreaElement
        el.focus()
        const dt = new DataTransfer()
        dt.items.add(new File([new Uint8Array(bytes as number[])], 'image.png', { type: 'image/png' }))
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      },
      [[...solidPng(160, 100, [40, 90, 220])]] as const,
    )
    await expect(qp.locator('[data-part="贴的图"] .qimg')).toHaveCount(1)
    await box.pressSequentially('这张图是什么颜色？一句话回答')
    let t0 = Date.now()
    await box.press('Enter')
    const a1 = await waitAnswer(qp, 1)
    const say1 = await a1.innerText()
    console.log(`[真小框] 1 用时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒\n${say1}`)
    expect(say1).toMatch(/蓝/)
    expect(run.read('收件箱/待办.md')).toBe(inbox)

    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await box.click()
    await box.pressSequentially('明天下午三点交报告加个待办')
    t0 = Date.now()
    await box.press('Enter')
    const a2 = await waitAnswer(qp, 2)
    console.log(`[真小框] 2 用时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒\n${await a2.innerText()}`)
    await expect.poll(() => run.read('收件箱/待办.md'), { timeout: 30_000 }).toMatch(/- \[ \] [^\n]*交报告[^\n]*📅 2026-11-23 15:00/)
    const added = run.read('收件箱/待办.md').split('\n').filter((l) => l.includes('交报告'))
    console.log(`[真小框] 收件箱多的一行：${JSON.stringify(added)}`)
    console.log(`[真小框] 最近一次提交：${execFileSync('git', ['-C', run.vault, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()}`)
  } finally {
    await run.close()
  }
})
