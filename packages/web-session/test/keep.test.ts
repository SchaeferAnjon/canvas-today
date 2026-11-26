// 登录留得住（@cn/web-session，ui-b A11）：会话 cookie 改成带过期时间的；cookie 变了半秒内写盘、一直在变也照样写；
// 分区不持久报错；从 Chrome 导进来的会话 cookie 带上过期时间、导完写盘。真的 Electron 分区在 e2e（apps/notes/e2e/uib-web-login.spec.ts）里测
import { createCipheriv, createHash, pbkdf2Sync } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { type CookieSet, importChromeLogin, keepLogins, kept, type LoginSession, SESSION_DAYS, type SessionCookie } from '../src/index'

type Listener = Parameters<LoginSession['cookies']['on']>[1]

function fakeSession(persistent = true) {
  const sets: CookieSet[] = []
  let flushes = 0
  const listeners = new Set<Listener>()
  const ses: LoginSession = {
    isPersistent: () => persistent,
    flushStorageData: () => {},
    cookies: {
      set: async (d) => void sets.push(d),
      flushStore: async () => void flushes++,
      on: (_e, l) => listeners.add(l),
      removeListener: (_e, l) => listeners.delete(l),
    },
  }
  const fire = (c: Partial<SessionCookie>, removed = false) => {
    for (const l of listeners) l({}, { name: 'n', value: 'v', sameSite: 'lax', ...c }, 'explicit', removed)
  }
  return { ses, sets, fire, flushes: () => flushes, listeners }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('会话 cookie → 带过期时间的同一个：只认这个域名的不写 domain（__Host- 才设得上），域 cookie 带 domain', () => {
  const now = 1_800_000_000
  expect(kept({ name: '__Host-sid', value: 'a', domain: 'example.com', hostOnly: true, path: '/', secure: true, httpOnly: true, session: true, sameSite: 'lax' }, now)).toEqual({
    url: 'https://example.com/',
    name: '__Host-sid',
    value: 'a',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    expirationDate: now + SESSION_DAYS * 86400,
  })
  expect(kept({ name: 'tab', value: 'b', domain: '.example.com', hostOnly: false, path: '/app', session: true, sameSite: 'unspecified' }, now, 1)).toEqual({
    url: 'http://example.com/app',
    name: 'tab',
    value: 'b',
    domain: '.example.com',
    path: '/app',
    secure: false,
    httpOnly: false,
    sameSite: 'unspecified',
    expirationDate: now + 86400,
  })
})

it('keepLogins：网站设的会话 cookie 改写成带过期时间的；持久的、删掉的不改写，半秒内写一次盘', async () => {
  const f = fakeSession()
  const stop = keepLogins(f.ses)
  f.fire({ name: 'tab', domain: '127.0.0.1', hostOnly: true, session: true })
  f.fire({ name: 'keep', domain: '127.0.0.1', hostOnly: true, session: false, expirationDate: 2e9 })
  f.fire({ name: 'gone', domain: '127.0.0.1', session: true }, true)
  expect(f.sets.map((s) => [s.name, typeof s.expirationDate])).toEqual([['tab', 'number']])
  expect(f.flushes()).toBe(0)
  await vi.advanceTimersByTimeAsync(499)
  expect(f.flushes()).toBe(0)
  await vi.advanceTimersByTimeAsync(1)
  expect(f.flushes()).toBe(1)
  stop()
  expect(f.listeners.size).toBe(0)
})

it('keepLogins：cookie 一直在变也每半秒写一次，不会一直往后拖', async () => {
  const f = fakeSession()
  keepLogins(f.ses)
  for (let i = 0; i < 20; i++) {
    f.fire({ name: `k${i}`, session: false, expirationDate: 2e9 })
    await vi.advanceTimersByTimeAsync(100)
  }
  expect(f.flushes()).toBe(4)
})

it('keepLogins：分区不持久（名字没有 persist:）报错', () => {
  expect(() => keepLogins(fakeSession(false).ses)).toThrow('persist:')
})

it('importChromeLogin：Chrome 里的会话 cookie 带上过期时间，持久的照原样，导完写盘', async () => {
  vi.useRealTimers()
  const root = mkdtempSync(join(tmpdir(), 'ws-chrome-'))
  try {
    mkdirSync(join(root, 'Default', 'Network'), { recursive: true })
    writeFileSync(join(root, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: '工作' } }, profiles_order: ['Default'] } }))
    const key = pbkdf2Sync('pw', 'saltysalt', 1003, 16, 'sha1')
    const db = new DatabaseSync(join(root, 'Default', 'Network', 'Cookies'))
    db.exec(`CREATE TABLE meta(key TEXT, value TEXT); INSERT INTO meta VALUES ('version', '24');
      CREATE TABLE cookies(host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, path TEXT, expires_utc INTEGER,
        is_secure INTEGER, is_httponly INTEGER, has_expires INTEGER, samesite INTEGER, top_frame_site_key TEXT)`)
    const ins = db.prepare('INSERT INTO cookies VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    const enc = (host: string, v: string) => {
      const c = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
      return Buffer.concat([Buffer.from('v10'), c.update(Buffer.concat([createHash('sha256').update(host).digest(), Buffer.from(v)])), c.final()])
    }
    const later = Math.round((Date.now() / 1000 + 86400 + 11644473600) * 1e6)
    ins.run('.example.com', 'keep', '', enc('.example.com', 'k'), '/', later, 1, 1, 1, 1, '')
    ins.run('.example.com', 'tab', '', enc('.example.com', 't'), '/', 0, 1, 1, 0, 1, '')
    db.close()
    const f = fakeSession()
    const r = await importChromeLogin(f.ses, 'Default', { root, password: async () => 'pw' })
    expect(r).toEqual({ imported: 2, expired: 0, skipped: 0, sites: ['example.com'] })
    const byName = Object.fromEntries(f.sets.map((s) => [s.name, s]))
    expect(byName.keep!.expirationDate! - Date.now() / 1000).toBeCloseTo(86400, -2)
    expect(byName.tab!.expirationDate! - Date.now() / 1000).toBeCloseTo(SESSION_DAYS * 86400, -2)
    expect(f.flushes()).toBe(1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
