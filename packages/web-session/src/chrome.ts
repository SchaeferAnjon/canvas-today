/**
 * 一键导入 Chrome 登录状态：把 Chrome 某个用户的 cookie 解密后放进内置浏览器的登录分区。
 * 思路和解密细节来自用户自己在 Dispatch IDE 里的实现（patches/browser-import-chrome.patch，MIT）。
 * 2026-11-25 从画布笔记的 main/chrome-import.ts 搬进 @cn/web-session（ui-b A11），画布订阅也用这一份。
 *
 * macOS 上 Chromium 的格式：<用户数据>/Local State 列出用户；每个用户文件夹里 Network/Cookies（老版本是 Cookies）
 * 是 SQLite；cookie 值用钥匙串里「Chrome Safe Storage」的密码派生出的 AES-128-CBC 密钥加密。
 */
import { execFile } from 'node:child_process'
import { createDecipheriv, createHash, pbkdf2Sync } from 'node:crypto'
import { copyFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export interface ChromeProfile {
  id: string
  name: string
  account?: string
}

export interface CookieDetails {
  url: string
  name: string
  value: string
  domain?: string
  path: string
  secure: boolean
  httpOnly: boolean
  expirationDate?: number
  sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}

export interface ImportResult {
  imported: number
  expired: number
  skipped: number
  /** 导进来的是哪些网站（cookie 的域名去掉开头的点，排好序；界面上说「导入了哪些网站」、过期提示用） */
  sites: string[]
}

/** 本机 Chrome 的用户数据目录（测试时调的人换成一个假的，见 ImportOptions.root） */
export const defaultChromeRoot = () => join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome')

const EPOCH_OFFSET_S = 11644473600

export function deriveCookieKey(password: string): Buffer {
  return pbkdf2Sync(Buffer.from(password, 'utf8'), 'saltysalt', 1003, 16, 'sha1')
}

/** 解不开（换了密钥、格式不认识）返回 undefined */
export function decryptCookieValue(encrypted: Uint8Array | null, plain: string | null, key: Buffer, dbVersion: number, hostKey: string): string | undefined {
  if (!encrypted || encrypted.length === 0) return plain ?? ''
  const buf = Buffer.from(encrypted)
  const prefix = buf.subarray(0, 3).toString('latin1')
  if (prefix !== 'v10' && prefix !== 'v11') return undefined
  let out: Buffer
  try {
    const d = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
    out = Buffer.concat([d.update(buf.subarray(3)), d.final()])
  } catch {
    return undefined
  }
  // 数据库版本 24 起，明文前面是 SHA-256(host_key)
  if (out.length >= 32) {
    const hostHash = createHash('sha256').update(hostKey, 'utf8').digest()
    if (dbVersion >= 24 || out.subarray(0, 32).equals(hostHash)) out = out.subarray(32)
  }
  const text = out.toString('utf8')
  if (text.includes('�') || /[\x00-\x08\x0e-\x1f\x7f]/.test(text)) return undefined
  return text
}

export interface CookieRow {
  host_key: string
  name: string
  value: string | null
  encrypted_value: Uint8Array | null
  path: string
  expires_utc: number | bigint
  is_secure: number | bigint
  is_httponly: number | bigint
  has_expires: number | bigint
  samesite: number | bigint
  top_frame_site_key?: string | null
}

const SAME_SITE: Record<number, CookieDetails['sameSite']> = { [-1]: 'unspecified', 0: 'no_restriction', 1: 'lax', 2: 'strict' }

export type Mapped = { kind: 'ok'; details: CookieDetails } | { kind: 'expired' } | { kind: 'skipped' }

/** 一行解密好的 cookie → Electron cookies.set 的参数。过期的、分区的（CHIPS）、SameSite=None 却不 Secure 的跳过 */
export function rowToCookie(row: CookieRow, value: string, nowSeconds: number): Mapped {
  const host = row.host_key.startsWith('.') ? row.host_key.slice(1) : row.host_key
  if (!host || (!row.name && !value)) return { kind: 'skipped' }
  if (row.top_frame_site_key) return { kind: 'skipped' }
  let expirationDate: number | undefined
  const expires = BigInt(row.expires_utc)
  if (Number(row.has_expires) && expires > 0n) {
    expirationDate = Number(expires / 1000n) / 1000 - EPOCH_OFFSET_S
    if (expirationDate <= nowSeconds) return { kind: 'expired' }
  }
  const secure = !!Number(row.is_secure)
  const sameSite = SAME_SITE[Number(row.samesite)] ?? 'unspecified'
  if (sameSite === 'no_restriction' && !secure) return { kind: 'skipped' }
  const path = row.path || '/'
  const details: CookieDetails = {
    url: `${secure ? 'https' : 'http'}://${host}${path.startsWith('/') ? path : '/' + path}`,
    name: row.name,
    value,
    path,
    secure,
    httpOnly: !!Number(row.is_httponly),
    sameSite,
  }
  if (row.host_key.startsWith('.')) details.domain = row.host_key
  if (expirationDate !== undefined) details.expirationDate = expirationDate
  return { kind: 'ok', details }
}

/** Chrome 的用户（Local State 里列的、文件夹还在的），按 Chrome 自己的顺序 */
export async function listChromeProfiles(root = defaultChromeRoot()): Promise<ChromeProfile[]> {
  let state: { profile?: { info_cache?: Record<string, { name?: string; user_name?: string }>; profiles_order?: string[] } }
  try {
    state = JSON.parse(await readFile(join(root, 'Local State'), 'utf8'))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
  const cache = state.profile?.info_cache ?? {}
  const order = (state.profile?.profiles_order ?? []).filter((id) => id in cache)
  const ids = [...order, ...Object.keys(cache).filter((id) => !order.includes(id))]
  const out: ChromeProfile[] = []
  for (const id of ids) {
    try {
      await stat(join(root, id))
    } catch {
      continue
    }
    const info = cache[id] ?? {}
    out.push({ id, name: info.name || id, ...(info.user_name ? { account: info.user_name } : {}) })
  }
  return out
}

/** 钥匙串里 Chrome 的密码；macOS 会问一次要不要允许 */
export function keychainPassword(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/security', ['find-generic-password', '-w', '-s', 'Chrome Safe Storage'], { timeout: 120_000 }, (err, stdout) => {
      if (err) reject(new Error('没有拿到钥匙串里 Chrome 的密码（弹窗里要点「允许」），所以没导入。'))
      else resolve(stdout.trim())
    })
  })
}

export interface ImportOptions {
  /** Chrome 的用户数据目录，默认本机的（测试给一个假的） */
  root?: string
  /** 解 cookie 的密码，默认问钥匙串（测试直接给） */
  password?: () => Promise<string>
}

/**
 * 读出一个 Chrome 用户的 cookie，解密好交给 set（写进内置浏览器的登录分区）。
 * Chrome 里没有过期时间的会话 cookie 交出去时也没有过期时间（要留住它由 set 那边定，见 importChromeLogin）
 */
export async function importCookies(profileId: string, set: (c: CookieDetails) => Promise<void>, opts: ImportOptions = {}): Promise<ImportResult> {
  if (!/^[\w .-]+$/.test(profileId) || profileId.includes('..')) throw new Error('Chrome 用户名不对')
  const dir = join(opts.root ?? defaultChromeRoot(), profileId)
  let db = join(dir, 'Network', 'Cookies')
  try {
    await stat(db)
  } catch {
    db = join(dir, 'Cookies')
  }
  // Chrome 开着时数据库是锁着的：拷一份出来读
  const work = await mkdtemp(join(tmpdir(), 'cn-chrome-'))
  try {
    const copy = join(work, 'Cookies')
    await copyFile(db, copy)
    for (const suffix of ['-wal', '-journal']) await copyFile(db + suffix, copy + suffix).catch(() => undefined)
    const { DatabaseSync } = await import('node:sqlite')
    const sql = new DatabaseSync(copy, { readOnly: true })
    let rows: CookieRow[]
    let version = 0
    try {
      version = Number((sql.prepare(`SELECT value FROM meta WHERE key = 'version'`).get() as { value?: string } | undefined)?.value ?? 0)
      // Chrome 的时间是 1601 年起的微秒数，超过 JS 数字的精确范围，按大整数读
      const stmt = sql.prepare('SELECT * FROM cookies')
      stmt.setReadBigInts(true)
      rows = stmt.all() as unknown as CookieRow[]
    } finally {
      sql.close()
    }
    const key = deriveCookieKey(await (opts.password ?? keychainPassword)())
    const now = Date.now() / 1000
    const result: ImportResult = { imported: 0, expired: 0, skipped: 0, sites: [] }
    const sites = new Set<string>()
    for (const row of rows) {
      const value = decryptCookieValue(row.encrypted_value, row.value, key, version, row.host_key)
      if (value === undefined) {
        result.skipped++
        continue
      }
      const m = rowToCookie(row, value, now)
      if (m.kind === 'expired') result.expired++
      else if (m.kind === 'skipped') result.skipped++
      else {
        try {
          await set(m.details)
          result.imported++
          sites.add(row.host_key.replace(/^\./, ''))
        } catch {
          // Electron 不收的个别 cookie（格式怪）跳过，不影响其他
          result.skipped++
        }
      }
    }
    result.sites = [...sites].sort()
    return result
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
