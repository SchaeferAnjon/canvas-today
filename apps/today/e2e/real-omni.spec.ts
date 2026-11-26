/**
 * 真的 Claude Code 全能模式（2026-11-25）：用户原话真问一遍，记下它做了什么。平时跳过：
 *   CT_REAL_AI=1 npx playwright test e2e/real-omni.spec.ts（跑之前去掉继承来的 CLAUDE_* 环境变量）
 * 工作目录是测试库的副本（launch 建的临时库），「整台电脑」是一个临时目录（CT_COMPUTER_ROOT），不碰真的笔记库、iCloud。
 * 桌面全能模式不停下来问（偏好「桌面全能模式不问」）；万一出了「等你点头」照样点「不要」并记下。步骤、回答、提交、库里改了什么打到输出里；CT_SHOTS 给了就截图。
 */
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commits, launch } from './app'
import { VAULT } from './fixtures'

test.skip(process.env.CT_REAL_AI !== '1', '真 AI：CT_REAL_AI=1 才跑')

const ASK = '我总感觉我有什么没做，你从我的生活学习工作三方面给我找一下，找整个电脑'

test('真的 Claude Code 全能模式：用户原话', async () => {
  test.setTimeout(900_000)
  const mac = mkdtempSync(join(tmpdir(), 'ct-real-mac-'))
  mkdirSync(join(mac, 'Documents', '工作'), { recursive: true })
  mkdirSync(join(mac, 'Downloads'), { recursive: true })
  writeFileSync(join(mac, 'Documents', '报税提醒.txt'), '2026 年的报税表还没交，11 月 30 日截止，材料在 Downloads/工资单.pdf。\n')
  writeFileSync(join(mac, 'Documents', '工作', '合同.txt'), '实习合同：签字页还没寄回人事处（要在 12 月 1 日前）。\n')
  writeFileSync(join(mac, 'Downloads', '课程通知.txt'), 'ECP 课程：期末报告 12 月 10 日交，组队名单 11 月 28 日前发给助教。\n')
  const files = {
    ...VAULT,
    '生活/搬家清单.md': '# 搬家清单\n\n房东说年底前要交还钥匙。\n\n- [ ] 找房东退押金 📅 2026-12-20\n- [ ] 改银行卡上的地址\n',
  }
  const run = await launch({ files, env: { CT_COMPUTER_ROOT: mac } })
  const { page } = run
  try {
    await page.locator('.abar.r .ab[data-k="ai"]').click()
    const p = page.locator('[data-part="AI 对话"]')
    await expect(p.getByRole('switch', { name: '全能模式' })).toHaveAttribute('aria-checked', 'true')
    const before = commits(run.vault).length
    const ta = p.locator('[data-testid="ai-input"] textarea')
    await ta.fill(ASK)
    const t0 = Date.now()
    await ta.press('Enter')
    const asked: string[] = []
    // 答完之前：要点头的一律「不要」
    while (await p.getByRole('button', { name: '停下' }).isVisible()) {
      const ask = p.locator('[data-part="等你点头"]').first()
      if (await ask.isVisible().catch(() => false)) {
        asked.push(await ask.innerText())
        await ask.getByRole('button', { name: '不要' }).click()
      }
      if (Date.now() - t0 > 840_000) throw new Error('15 分钟没答完')
      await page.waitForTimeout(500)
    }
    const a = p.locator('.aim-a').last()
    console.log(`[真全能] 用时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒，谁答的：${await a.locator('.who').innerText()}`)
    console.log(`[真全能] 步骤：\n${(await a.locator('[data-testid="ai-step"]').allInnerTexts()).map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`)
    console.log(`[真全能] 问过点头：${JSON.stringify(asked)}`)
    console.log(`[真全能] 回答：\n${await a.locator('.txt, .aerr').first().innerText()}`)
    const log = commits(run.vault)
    console.log(`[真全能] 新提交：${JSON.stringify(log.slice(0, log.length - before))}`)
    if (log.length > before) console.log(`[真全能] 改了：\n${execFileSync('git', ['-C', run.vault, 'show', '--stat', '--format=', 'HEAD'], { encoding: 'utf8' })}${execFileSync('git', ['-C', run.vault, 'show', '--format=', 'HEAD'], { encoding: 'utf8' }).slice(0, 3000)}`)
    if (process.env.CT_SHOTS) await page.screenshot({ path: join(process.env.CT_SHOTS, 'real-omni.png') })
  } finally {
    await run.close()
    rmSync(mac, { recursive: true, force: true })
  }
})
