/**
 * 用哪个库：先看画布笔记设置里上次打开的库（两个软件同一个库）；没有就出「选一个库」，选了打开（不是 Git 仓库的先建一个，改动照样提交）。
 */
import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'
import { LOOK } from './app'
import { NOW } from './fixtures'

function boot(root: string, env: Record<string, string>) {
  return electron.launch({
    executablePath: electronPath as unknown as string,
    args: [join(__dirname, '../out/main/index.js')],
    env: { ...process.env, CT_E2E: '1', CT_USER_DATA: join(root, 'ud'), CT_NOTES_DATA: join(root, 'nd'), CT_NOW: NOW, CT_DEVICE: 'mac-test', CT_COMMIT_MS: '200', ...env },
  })
}

test('没给 CT_VAULT：打开画布笔记设置里上次打开的那个库', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ct-vault-'))
  const vault = join(root, '我的笔记库')
  mkdirSync(join(vault, '收件箱'), { recursive: true })
  writeFileSync(join(vault, '收件箱/待办.md'), '# 待办\n\n- [ ] 从画布笔记的库来的 📅 2026-11-22\n')
  execFileSync('git', ['init', '-q', '-b', 'main', vault])
  mkdirSync(join(root, 'nd'))
  writeFileSync(join(root, 'nd', 'settings.json'), JSON.stringify({ lastVault: vault }))
  mkdirSync(join(root, 'ud'))
  writeFileSync(join(root, 'ud', 'settings.json'), JSON.stringify(LOOK('sky', 'b')))
  const app = await boot(root, {})
  try {
    const page = await app.firstWindow()
    await expect(page.locator('.center .row', { hasText: '从画布笔记的库来的' })).toBeVisible()
    await expect(page.locator('.status')).toContainText('我的笔记库 · main')
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('哪都没有库：出「选一个库」，选一个不是 Git 仓库的文件夹 → 建好 Git、打开，加的一条提交进去', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ct-vault-'))
  const picked = join(root, '新库')
  mkdirSync(join(picked, '写作'), { recursive: true })
  writeFileSync(join(picked, '写作/计划.md'), '# 计划\n\n- [ ] 写开题 📅 2026-11-22\n')
  mkdirSync(join(root, 'ud'))
  writeFileSync(join(root, 'ud', 'settings.json'), JSON.stringify(LOOK('sky', 'a')))
  const app = await boot(root, {})
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '选一个库' })).toBeVisible()
    // 系统的选文件夹面板换成「选了这个文件夹」
    await app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as typeof dialog.showOpenDialog
    }, picked)
    await page.getByRole('button', { name: '选文件夹…' }).click()
    await expect(page.locator('.center .row', { hasText: '写开题' })).toBeVisible()
    expect(execFileSync('git', ['-C', picked, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).trim()).toBe('true')
    await page.locator('#qa').fill('读三篇文献')
    await page.locator('#qa').press('Enter')
    // 写盘要一小会儿（原子写：临时文件、fsync、改名）：文件还没出现时接着等，不当成失败
    await expect.poll(() => (existsSync(join(picked, '收件箱/待办.md')) ? readFileSync(join(picked, '收件箱/待办.md'), 'utf8') : null)).toBe('# 待办\n\n- [ ] 读三篇文献 📅 2026-11-22\n')
    const log = () => {
      try {
        return execFileSync('git', ['-C', picked, 'log', '--format=%s'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      } catch {
        return '（还没有提交）'
      }
    }
    await expect.poll(log, { timeout: 8000 }).toContain('画布今日：加了「读三篇文献」')
    // 记下了：下次打开还是这个库（自己选的先于画布笔记上次的）
    expect(JSON.parse(readFileSync(join(root, 'ud', 'settings.json'), 'utf8'))).toMatchObject({ lastVault: picked, vaultChosen: true })
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})
