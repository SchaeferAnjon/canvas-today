/**
 * 真的自动更新一次（打好的包，同一张 Developer ID 签的两个版本）：旧版查本机的更新服务器、在后台下好新版、底栏出「重启更新到 x」，
 * 退出后 Squirrel 把 .app 换成新版，签名照样过，新版起得来。窗口一直不上屏（测试模式）。没给下面两个就跳过：
 *   CT_UPDATE_OLD=<旧版的 Canvas Today.app>   比如把 version 改成 0.1.98 用 release.mjs --try --arch=arm64 打的那份
 *   CT_UPDATE_DIR=<新版的 release/<版本>/mac>  里面有 latest-mac.yml 和 zip（0.1.99 那份）
 * 旧版先拷到临时文件夹再开（Squirrel 要能改它所在的文件夹），原来那份不动。
 */
import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LOOK } from './app'
import { NOW, PROTO } from './fixtures'

const OLD = process.env.CT_UPDATE_OLD
const DIR = process.env.CT_UPDATE_DIR
test.skip(!OLD || !DIR, '只在测真更新时跑（CT_UPDATE_OLD、CT_UPDATE_DIR）')

const versionOf = (app: string) => readFileSync(join(app, 'Contents/Info.plist'), 'utf8').match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)![1]!

test('旧版查到新版、后台下好、退出时换成新版，签名照样过', async () => {
  test.setTimeout(240_000)
  const want = readFileSync(join(DIR!, 'latest-mac.yml'), 'utf8').match(/^version: (.+)$/m)![1]!.trim()
  const root = mkdtempSync(join(tmpdir(), 'ct-upd-'))
  const app = join(root, 'Canvas Today.app')
  execFileSync('ditto', [OLD!, app])
  const from = versionOf(app)
  expect(from).not.toBe(want)

  // 本机的更新服务器：照 GitHub Release 的样子放 latest-mac.yml 和 zip
  const server = createServer((req, res) => {
    const f = join(DIR!, decodeURIComponent(new URL(req.url!, 'http://x').pathname))
    if (!f.startsWith(DIR!) || !existsSync(f) || !statSync(f).isFile()) return void res.writeHead(404).end()
    res.writeHead(200, { 'content-length': statSync(f).size })
    createReadStream(f).pipe(res)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`

  const vault = join(root, '测试库')
  execFileSync('git', ['init', '-q', '-b', 'main', vault])
  for (const [p, t] of Object.entries(PROTO)) {
    mkdirSync(join(vault, p, '..'), { recursive: true })
    writeFileSync(join(vault, p), t)
  }
  execFileSync('git', ['-C', vault, '-c', 'user.name=Test', '-c', 'user.email=t@example.com', 'add', '-A'])
  execFileSync('git', ['-C', vault, '-c', 'user.name=Test', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', '样本'])
  mkdirSync(join(root, 'ud'))
  writeFileSync(join(root, 'ud', 'settings.json'), JSON.stringify(LOOK('sky', 'b')))
  const env = { ...process.env, CT_E2E: '1', CT_VAULT: vault, CT_USER_DATA: join(root, 'ud'), CT_NOTES_DATA: join(root, 'nd'), CT_NOW: NOW, CT_DEVICE: 'mac-test' }
  try {
    const old = await electron.launch({ executablePath: join(app, 'Contents/MacOS/Canvas Today'), env: { ...env, CT_UPDATE_URL: url } })
    const page = await old.firstWindow()
    await expect(page.locator('.vhead h1')).toHaveText('今天')
    await page.locator('.ab[data-k="settings"]').click()
    const line = page.getByTestId('update-line')
    await expect(line).toContainText(`版本${from}`)
    await page.getByRole('button', { name: '现在查一次' }).click()
    // 下好、Squirrel 验过签才算 ready
    await expect(line).toContainText(`新版本${want}已下好`, { timeout: 120_000 })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('update-bar')).toHaveText(`重启更新到${want}`)
    await old.close()
    // 退出后 ShipIt 换掉 .app
    await expect.poll(() => versionOf(app), { timeout: 90_000, intervals: [1000] }).toBe(want)
    execFileSync('codesign', ['--verify', '--deep', '--strict', app])

    const neu = await electron.launch({ executablePath: join(app, 'Contents/MacOS/Canvas Today'), env })
    try {
      expect(await neu.evaluate(({ app }) => app.getVersion())).toBe(want)
      await expect((await neu.firstWindow()).locator('.vhead h1')).toHaveText('今天')
    } finally {
      await neu.close()
    }
  } finally {
    server.close()
    rmSync(root, { recursive: true, force: true })
  }
})
