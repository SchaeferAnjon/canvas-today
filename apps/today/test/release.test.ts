/**
 * 发版要的几样对得上：名字、Bundle ID、仓库只在 brand.json 一处，package.json、打包配置、软件里的 BRAND 都和它一样；
 * 检查更新的文案（中英文）把 electron-updater / Squirrel 的原话换成看得懂的话。
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { UpdateState } from '../src/shared/api'
import { BRAND, releaseUrl } from '../src/shared/brand'
import { normalizeToday } from '../src/shared/settings'
import { barKind, menuLabel, updateError, updateLine } from '../src/shared/update'

const APP = join(__dirname, '..')
const brand = JSON.parse(readFileSync(join(APP, 'brand.json'), 'utf8'))
const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'))
const req = createRequire(import.meta.url)

function builderConfig(env: Record<string, string>) {
  const keep = { ...process.env }
  Object.assign(process.env, env)
  try {
    const p = req.resolve(join(APP, 'electron-builder.cjs'))
    delete req.cache[p]
    return req(p)
  } finally {
    for (const k of Object.keys(env)) delete process.env[k]
    Object.assign(process.env, keep)
  }
}

describe('名字和标识只写在 brand.json', () => {
  it('package.json、软件里的 BRAND 和它一样', () => {
    expect(pkg.productName).toBe(brand.name)
    expect(pkg.author).toBe(brand.author)
    expect(pkg.license).toBe(brand.license)
    expect(BRAND).toMatchObject(brand)
    expect(releaseUrl('0.1.0')).toBe(`https://github.com/${brand.repo}/releases/tag/v0.1.0`)
  })

  it('本机包：本地签名、不写 publish（装上后不查更新）；发布包：Developer ID、hardened runtime、dmg + zip、查 brand.json 的仓库', () => {
    const local = builderConfig({})
    expect(local).toMatchObject({ appId: brand.appId, productName: brand.name, publish: null, mac: { identity: '-', hardenedRuntime: false, target: 'dir' } })
    expect(local.protocols[0].schemes).toEqual([brand.scheme])
    expect(() => builderConfig({ CT_RELEASE: '1' })).toThrow(/CT_SIGN_IDENTITY/)
    const rel = builderConfig({ CT_RELEASE: '1', CT_SIGN_IDENTITY: 'Some Name (ABCDE12345)' })
    expect(rel.mac).toMatchObject({ identity: 'Some Name (ABCDE12345)', hardenedRuntime: true, target: ['dmg', 'zip'], entitlements: 'build/entitlements.mac.plist', notarize: false })
    const [owner, repo] = brand.repo.split('/')
    expect(rel.publish).toEqual({ provider: 'github', owner, repo, releaseType: 'release' })
    expect(rel.artifactName).toBe(`${brand.artifact}-\${version}-\${os}-\${arch}.\${ext}`)
  })

  it('检查更新要的 electron-updater 在 dependencies 里（打进包），别的都在 devDependencies（构建时打进 out/）', () => {
    expect(Object.keys(pkg.dependencies)).toEqual(['electron-updater'])
  })
})

const st = (p: Partial<UpdateState>): UpdateState => ({ phase: 'idle', current: '0.1.0', version: '', percent: 0, error: '', checkedAt: 0, inApps: true, ...p })
const NOW = new Date('2026-11-22T10:20:00').getTime()

describe('检查更新的文案', () => {
  it('各个阶段的状态行，中文和英文', () => {
    expect(updateLine(st({ phase: 'off' }), true, 'zh')).toBe('开发版，不自动更新')
    expect(updateLine(st({ phase: 'off' }), true, 'en')).toBe('Development build, no automatic updates')
    expect(updateLine(st({}), true, 'zh')).toBe('还没查过；打开30秒后会自动查一次')
    expect(updateLine(st({}), false, 'zh')).toBe('自动检查已关')
    expect(updateLine(st({ checkedAt: new Date('2026-11-21T21:05:00').getTime() }), true, 'zh', NOW)).toBe('上次昨天 21:05查过，是最新的')
    expect(updateLine(st({ phase: 'latest', checkedAt: new Date('2026-11-22T09:00:00').getTime() }), true, 'en', NOW)).toBe('Up to date · checked today 09:00')
    expect(updateLine(st({ phase: 'downloading', version: '0.1.1', percent: 42 }), true, 'zh')).toBe('正在下载新版本0.1.1 · 42%')
    expect(updateLine(st({ phase: 'ready', version: '0.1.1' }), true, 'en')).toBe('Version 0.1.1 is ready')
  })

  it('原话换成看得懂的话：签名对不上、只读位置、下载不到是「没装上」（底栏出一项）；没网、还没有能更新的版本是「没查成」', () => {
    const sign = st({ phase: 'error', version: '0.1.1', error: 'Error: code failed to satisfy specified code requirement(s)' })
    expect(updateLine(sign, true, 'zh')).toBe('没装上：新版本的签名和装着的这一版对不上，没有装；去GitHub发布页重新下载安装一次就好')
    expect(barKind(sign, 'zh')).toBe('failed')
    expect(updateError('EROFS: read-only file system', '0.1.1', 'en').blocking).toBe(true)
    expect(updateError('Cannot download "https://x/CanvasToday-0.1.1-mac-arm64.zip", status 404:', '0.1.1', 'zh').text).toBe('新版本0.1.1的安装包下载不到（404），过一会儿再试')
    const net = st({ phase: 'error', error: 'net::ERR_INTERNET_DISCONNECTED' })
    expect(updateLine(net, true, 'en')).toBe('Check failed: Cannot reach GitHub; check your network. It will check again later')
    expect(barKind(net, 'en')).toBeNull()
    expect(updateError('Cannot find channel "latest-mac.yml" update info', '', 'zh')).toMatchObject({ blocking: false, soft: true })
    expect(updateError('x'.repeat(100), '', 'zh').text).toHaveLength(81)
    expect(barKind(st({ phase: 'ready', version: '0.1.1' }), 'zh')).toBe('ready')
  })

  it('软件菜单那一项', () => {
    expect(menuLabel(st({}), 'zh')).toBe('检查更新…')
    expect(menuLabel(st({ phase: 'downloading' }), 'en')).toBe('Downloading Update…')
    expect(menuLabel(st({ phase: 'ready', version: '0.1.1' }), 'zh')).toBe('重启并更新到 0.1.1')
  })

  it('设置里自动检查默认开着，查过的时间留着', () => {
    expect(normalizeToday({}).autoUpdate).toBe(true)
    expect(normalizeToday({ autoUpdate: false, updateCheckedAt: 123 })).toMatchObject({ autoUpdate: false, updateCheckedAt: 123 })
    expect(normalizeToday({ updateCheckedAt: 'x' }).updateCheckedAt).toBeUndefined()
  })
})
