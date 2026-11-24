/**
 * 翻译 API 的 Key：用 Electron safeStorage 加密（加密钥匙在这台 Mac 的钥匙串里），密文存在插件自己的文件夹，
 * 不进库、不进 Git。Key 只在主进程里：界面只拿得到「有没有、最后 4 位」。
 * 真要用 Key（翻译、测试连接）时才解密，打开软件、看设置页都不碰钥匙串。
 * 加密由外面给（Electron 的 safeStorage；单元测试给假的；端到端测试只放内存，不碰真的钥匙串），这里不碰 Electron。
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { atomicWriteSync } from '@cn/atomic'

export interface Cipher {
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

/** Key 的最后 4 位（界面上「sk-••••a3f9」） */
export const keyTail = (key: string) => key.slice(-4)

/** 粘贴进来的 Key：去掉空白和引号，太短、带空格的不收 */
export function cleanKey(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Key 不对')
  const k = raw.trim().replace(/^["'`]|["'`]$/g, '').replace(/^Bearer\s+/i, '')
  if (k.length < 8 || k.length > 400 || /\s/.test(k)) throw new Error('这不像一个 API Key：粘贴完整的一串，不带空格')
  return k
}

interface Entry {
  /** 密文（base64）；只放内存时没有 */
  data?: string
  tail: string
  /** 解开过的 */
  plain?: string
}

export class KeyStore {
  private map = new Map<string, Entry>()

  /** file 或 cipher 为 null：只放内存（端到端测试） */
  constructor(
    private file: string | null,
    private cipher: Cipher | null,
  ) {
    if (!file || !cipher) return
    let raw: { v?: number; keys?: Record<string, { data?: unknown; tail?: unknown }> }
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return
      throw e
    }
    for (const [id, e] of Object.entries(raw.keys ?? {})) {
      if (typeof e?.data === 'string' && typeof e.tail === 'string') this.map.set(id, { data: e.data, tail: e.tail })
    }
  }

  has(id: string): boolean {
    return this.map.has(id)
  }

  /** 用的时候才解密 */
  get(id: string): string | undefined {
    const e = this.map.get(id)
    if (!e) return undefined
    if (e.plain === undefined) e.plain = this.cipher!.decrypt(Buffer.from(e.data!, 'base64'))
    return e.plain
  }

  tail(id: string): string | undefined {
    return this.map.get(id)?.tail
  }

  set(id: string, key: string) {
    this.map.set(id, { plain: key, tail: keyTail(key), ...(this.cipher && this.file ? { data: this.cipher.encrypt(key).toString('base64') } : {}) })
    this.save()
  }

  delete(id: string) {
    this.map.delete(id)
    this.save()
  }

  private save() {
    if (!this.file || !this.cipher) return
    const keys = Object.fromEntries([...this.map].map(([id, e]) => [id, { data: e.data, tail: e.tail }]))
    mkdirSync(dirname(this.file), { recursive: true })
    atomicWriteSync(this.file, JSON.stringify({ v: 1, keys }), { mode: 0o600 })
  }
}
