/**
 * 起画布今日（测试模式：窗口不上屏、不抢焦点、通知 / 打开外部 / 系统菜单换成记录器）：建一个临时库（Git 仓库，文件都提交好），
 * 临时设置目录，画布笔记的设置目录也换成临时的（不读用户真的设置、不碰用户真的库），钟拨到 2026-11-22 10:20。
 */
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import electronPath from 'electron'
import { NOW, VAULT } from './fixtures'

export interface Running {
  app: ElectronApplication
  page: Page
  vault: string
  userData: string
  root: string
  /** 库里一篇的字（原样，不去 \r） */
  read(path: string): string
  write(path: string, text: string): void
  close(): Promise<void>
}

export interface LaunchOpts {
  files?: Record<string, string>
  /** 画布今日自己的设置（外观不跟画布笔记，测试里定死主题和风格） */
  settings?: Record<string, unknown>
  env?: Record<string, string>
  now?: string
  size?: { width: number; height: number }
  /** 提交好以后、起软件之前再动一下库（改修改时间） */
  prepare?: (vault: string) => void
}

export const LOOK = (skin: 'sky' | 'petrol', frame: 'a' | 'b', lang: 'zh' | 'en' = 'zh') => ({ lang, followNotes: false, appearance: { followSystem: false, skin, day: 'sky', night: 'petrol', frame, winBg: 'aurora' } })

export async function launch(o: LaunchOpts = {}): Promise<Running> {
  const root = mkdtempSync(join(tmpdir(), 'ct-e2e-'))
  const vault = join(root, '测试库')
  const userData = join(root, 'user-data')
  const notesData = join(root, 'notes-data')
  mkdirSync(userData, { recursive: true })
  mkdirSync(notesData, { recursive: true })
  execFileSync('git', ['init', '-q', '-b', 'main', vault])
  execFileSync('git', ['-C', vault, 'config', 'user.name', 'Test'])
  execFileSync('git', ['-C', vault, 'config', 'user.email', 'test@example.com'])
  execFileSync('git', ['-C', vault, 'config', 'core.autocrlf', 'false'])
  for (const [name, content] of Object.entries(o.files ?? VAULT)) {
    mkdirSync(dirname(join(vault, name)), { recursive: true })
    writeFileSync(join(vault, name), content)
  }
  execFileSync('git', ['-C', vault, 'add', '-A'])
  execFileSync('git', ['-C', vault, 'commit', '-q', '-m', '样本'])
  o.prepare?.(vault)
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ ...LOOK('sky', 'b'), ...(o.settings ?? {}) }))

  const app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [join(__dirname, '../out/main/index.js')],
    env: {
      ...process.env,
      CT_E2E: '1',
      CT_VAULT: vault,
      CT_USER_DATA: userData,
      CT_NOTES_DATA: notesData,
      CT_NOW: o.now ?? NOW,
      CT_DEVICE: 'mac-test',
      CT_COMMIT_MS: '200',
      ...(o.env ?? {}),
    },
  })
  const page = await app.firstWindow()
  await page.setViewportSize(o.size ?? { width: 1420, height: 799 })
  await expect(page.locator('.win')).toBeVisible()
  // 等界面把事件都挂上（第一个快捷键不丢）
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))))
  return {
    app,
    page,
    vault,
    userData,
    root,
    read: (p) => readFileSync(join(vault, p), 'utf8'),
    write: (p, t) => {
      mkdirSync(dirname(join(vault, p)), { recursive: true })
      writeFileSync(join(vault, p), t)
    },
    async close() {
      await app.close()
      rmSync(root, { recursive: true, force: true, maxRetries: 5 })
    },
  }
}

/** 库里的提交说明（新的在前） */
export const commits = (vault: string) => execFileSync('git', ['-C', vault, 'log', '--format=%s'], { encoding: 'utf8' }).trim().split('\n')

/** 中间的一行待办 */
export const row = (page: Page, title: string) => page.locator('.center .row', { hasText: title }).first()

/** 左栏的一项 */
export const nav = (page: Page, k: string) => page.locator(`.nav[data-k="${k}"]`)

/** 真拖：按下、挪过 5、指到目标、松开（照原型 click.js 的 dragTo） */
export async function dragTo(page: Page, src: import('@playwright/test').Locator, dst: import('@playwright/test').Locator, dy?: number) {
  await src.scrollIntoViewIfNeeded()
  const a = (await src.boundingBox())!
  const b = (await dst.boundingBox())!
  await page.mouse.move(a.x + 40, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + 60, a.y + a.height / 2 + 10, { steps: 4 })
  await page.mouse.move(b.x + b.width / 2, b.y + (dy ?? b.height / 2), { steps: 10 })
  await page.mouse.up()
}
