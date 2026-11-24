/**
 * 起画布今日（测试模式：窗口不上屏、不抢焦点、通知 / 打开外部 / 系统菜单换成记录器）：建一个临时库（Git 仓库，文件都提交好），
 * 临时设置目录，画布笔记的设置目录也换成临时的（不读用户真的设置、不碰用户真的库），钟拨到 2026-11-22 10:20。
 * 提醒事项：小助手（scripts/build-helper.mjs 编好的）一律带 --memory，用临时目录里的假提醒事项（reminders 给种子），不碰真的提醒事项。
 */
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import electronPath from 'electron'
import { NOW, VAULT } from './fixtures'

/** 编好的提醒事项小助手（node scripts/build-helper.mjs） */
export const HELPER = process.env.CT_REMINDERS_HELPER ?? join(__dirname, '../native/reminders/.build/apple/Products/Release/canvas-today-reminders')

export interface Running {
  app: ElectronApplication
  page: Page
  vault: string
  userData: string
  root: string
  /** 假提醒事项存在哪（小助手 --memory 的那个文件） */
  remFile: string
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
  /** 假提醒事项的种子（MemState：auth、icloud、denyRequest、lists、items）；不给就是没问过、开着 iCloud、一个列表都没有 */
  reminders?: Record<string, unknown>
  /** 接着用上一次的目录（重开软件）：库、设置、假提醒事项都留着 */
  root?: string
}

/** 测试里的设置：外观定死；排一天（打开时先排一天）关着，老测试照旧从「今天」开始 */
export const LOOK = (skin: 'sky' | 'petrol', frame: 'a' | 'b', lang: 'zh' | 'en' = 'zh') => ({ lang, followNotes: false, appearance: { followSystem: false, skin, day: 'sky', night: 'petrol', frame, winBg: 'aurora' }, plan: { onOpen: false, tray: true, journal: null } })

export async function launch(o: LaunchOpts = {}): Promise<Running> {
  const again = !!o.root
  const root = o.root ?? mkdtempSync(join(tmpdir(), 'ct-e2e-'))
  const vault = join(root, '测试库')
  const userData = join(root, 'user-data')
  const notesData = join(root, 'notes-data')
  const remFile = join(root, 'reminders-mem.json')
  if (!existsSync(HELPER)) throw new Error(`没有编好的提醒事项小助手 ${HELPER}：先在 apps/today 下跑 node scripts/build-helper.mjs`)
  if (!again) {
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
    if (o.reminders) writeFileSync(remFile, JSON.stringify(o.reminders))
  }

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
      CT_REMINDERS_HELPER: HELPER,
      CT_REMINDERS_MEMORY: remFile,
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
    remFile,
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

/** 关掉软件，目录留着（之后用 launch({ root }) 重开） */
export async function quit(run: Running) {
  await run.app.close()
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
