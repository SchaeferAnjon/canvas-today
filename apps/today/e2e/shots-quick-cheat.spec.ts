/**
 * 快速加一条小框的提示行（符号小抄）和 # 清单、! 优先级候选的截图：薄荷、深湖各一套。
 *   CT_CHEAT_SHOTS=<目录> [CT_CHEAT_TAG=before|after] npx playwright test e2e/shots-quick-cheat.spec.ts   （先 npx electron-vite build）
 * 不给 CT_CHEAT_SHOTS 就跳过。webContents.capturePage 拍 2 倍的 PNG（按小框真窗口大小）。
 */
import { expect, type ElectronApplication, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, type Running } from './app'

const OUT = process.env.CT_CHEAT_SHOTS
const TAG = process.env.CT_CHEAT_TAG ?? 'after'
test.skip(!OUT, '只在出截图时跑（CT_CHEAT_SHOTS=<目录>）')

async function capture(app: ElectronApplication): Promise<Buffer> {
  const b64 = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('/quick.html'))!
    return (await w.webContents.capturePage()).toPNG().toString('base64')
  })
  return Buffer.from(b64, 'base64')
}
const save = async (run: Running, name: string) => {
  await new Promise((r) => setTimeout(r, 400))
  mkdirSync(OUT!, { recursive: true })
  writeFileSync(join(OUT!, `${TAG}-${name}.png`), await capture(run.app))
}
const press = (run: Running) => run.app.evaluate(() => (globalThis as unknown as { ctQuick: { press(): Promise<void> } }).ctQuick.press())

for (const [skin, lang] of [
  ['mint', 'zh'],
  ['petrol', 'zh'],
  ['mint', 'en'],
] as const) {
  test(`小抄 ${skin} ${lang}`, async () => {
    const settings = { lang, followNotes: false, appearance: { followSystem: false, skin, day: 'mint', night: 'petrol', frame: 'b', winBg: 'aurora' }, plan: { onOpen: false, tray: true, journal: null } }
    const run = await launch({ settings })
    try {
      await press(run)
      await expect.poll(() => run.app.windows().some((w) => w.url().endsWith('/quick.html'))).toBe(true)
      const qp = run.app.windows().find((w) => w.url().endsWith('/quick.html'))!
      const box = qp.locator('.qp textarea')
      await expect(box).toBeVisible()
      await save(run, `empty-${skin}-${lang}`)
      if (lang === 'en') return
      await box.pressSequentially('交实验报告 #')
      await save(run, `hash-${skin}`)
      await box.pressSequentially('作')
      await save(run, `hash-typed-${skin}`)
      await box.fill('')
      await box.pressSequentially('交实验报告 !')
      await save(run, `bang-${skin}`)
    } finally {
      await run.close()
    }
  })
}
