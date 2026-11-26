import { createCipheriv, createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { decryptCookieValue, deriveCookieKey, rowToCookie } from '../src/chrome'

const key = deriveCookieKey('pw')
const enc = (plain: Buffer) => {
  const c = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
  return Buffer.concat([Buffer.from('v10'), c.update(plain), c.final()])
}

it('解密：v24 起去掉前面的 host 哈希；钥匙不对解不开', () => {
  const hash = createHash('sha256').update('.example.com').digest()
  expect(decryptCookieValue(enc(Buffer.concat([hash, Buffer.from('abc')])), null, key, 24, '.example.com')).toBe('abc')
  expect(decryptCookieValue(enc(Buffer.from('plain-old')), null, key, 23, '.example.com')).toBe('plain-old')
  expect(decryptCookieValue(enc(Buffer.from('abc')), null, deriveCookieKey('wrong'), 23, 'x')).toBeUndefined()
  expect(decryptCookieValue(null, 'unencrypted', key, 24, 'x')).toBe('unencrypted')
})

it('换成 Electron cookie：域 cookie 带 domain，过期的、分区的跳过', () => {
  const now = 1_800_000_000
  const future = (now + 3600 + 11644473600) * 1e6
  const row = { host_key: '.example.com', name: 'sid', value: null, encrypted_value: null, path: '/', expires_utc: future, is_secure: 1, is_httponly: 1, has_expires: 1, samesite: 1 }
  expect(rowToCookie(row, 'v', now)).toEqual({
    kind: 'ok',
    details: { url: 'https://example.com/', name: 'sid', value: 'v', path: '/', secure: true, httpOnly: true, sameSite: 'lax', domain: '.example.com', expirationDate: now + 3600 },
  })
  expect(rowToCookie({ ...row, expires_utc: (now - 1 + 11644473600) * 1e6 }, 'v', now)).toEqual({ kind: 'expired' })
  expect(rowToCookie({ ...row, top_frame_site_key: 'https://a.com' }, 'v', now)).toEqual({ kind: 'skipped' })
  expect(rowToCookie({ ...row, samesite: 0, is_secure: 0 }, 'v', now)).toEqual({ kind: 'skipped' })
  const host = rowToCookie({ ...row, host_key: 'a.com', has_expires: 0 }, 'v', now)
  expect(host.kind === 'ok' && host.details.domain === undefined && host.details.expirationDate === undefined).toBe(true)
})
