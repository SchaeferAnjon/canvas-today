/**
 * 画布今日的 API Key（task-587os，设计页第 4 节「Key 借用」）：画布今日自己一份，用 Electron safeStorage 加密（钥匙串里「Canvas Today Safe Storage」），
 * 密文在画布今日的 userData/ai-keys.json。第一次要用一把 Key（画布笔记的「小活」选的是 Claude API 这类）而画布今日还没有时，
 * 界面问一句「用画布笔记里存的 Anthropic Key？」，同意后从画布笔记那份解出来、存一份到画布今日自己这里。
 * 不做两个软件共用一个钥匙串项（那要两边同一签名加钥匙串共享权限，签名没定之前做不稳）。
 *
 * 画布笔记那份怎么解：它也是 safeStorage（Chromium 的 OSCrypt，macOS 上是「v10」开头、AES-128-CBC，钥匙是钥匙串里
 * 「Canvas Notes Safe Storage」那一项的密码经 PBKDF2-SHA1（盐 saltysalt、1003 次）得来，IV 是 16 个空格）。
 * 读那一项密码用系统的 security 命令：系统会弹一次「允许访问」，这是用户刚刚同意过的那一下。
 * 测试实例（E2E）不碰钥匙串：Key 只放内存，画布笔记那份从 CT_TEST_NOTES_KEYS（{"anthropic":"sk-…"}）来。
 */
import { safeStorage } from 'electron'
import { execFile } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ApiId, isApi } from '../../../notes/src/shared/ai-sources'
import { KeyStore } from '../../../notes/src/main/plugins/translate/keys'
import { E2E } from './test-mode'

let store: KeyStore | null = null
let notesDir: string | null = null

export function initKeys(userData: string, notes: string | null) {
  notesDir = notes
  store = E2E
    ? new KeyStore(null, null)
    : new KeyStore(join(userData, 'ai-keys.json'), {
        encrypt: (s) => {
          if (!safeStorage.isEncryptionAvailable()) throw new Error('这台 Mac 的钥匙串现在用不了，Key 没存')
          return safeStorage.encryptString(s)
        },
        decrypt: (b) => safeStorage.decryptString(b),
      })
}

/** 画布今日自己存的这一家的 Key */
export const todayKey = (id: ApiId): string | undefined => store?.get(id)
export const todayKeyTail = (id: ApiId): string | undefined => store?.tail(id)

/** 不用了：删掉画布今日自己存的那一份 */
export function dropTodayKey(id: ApiId) {
  store?.delete(id)
}

/** 画布笔记那边有没有这一家的 Key（只看有没有，不解） */
export function notesHasKey(id: ApiId): boolean {
  if (E2E) return !!testNotesKeys()[id]
  if (!notesDir) return false
  try {
    const raw = JSON.parse(readFileSync(join(notesDir, 'ai', 'keys.json'), 'utf8')) as { keys?: Record<string, { data?: unknown }> }
    return typeof raw.keys?.[id]?.data === 'string'
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || e instanceof SyntaxError) return false
    throw e
  }
}

/** 要问「用画布笔记那把？」吗：这一家要 Key、画布今日没有、画布笔记有 */
export function needBorrow(engine: string): ApiId | null {
  if (!isApi(engine) || todayKey(engine)) return null
  return notesHasKey(engine) ? engine : null
}

function testNotesKeys(): Record<string, string> {
  try {
    return JSON.parse(process.env.CT_TEST_NOTES_KEYS ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/** Chromium OSCrypt（macOS）的解法：v10 + AES-128-CBC，钥匙 PBKDF2-SHA1(密码, saltysalt, 1003, 16)，IV 16 个空格 */
export function decryptSafeStorage(data: Buffer, password: string): string {
  if (data.subarray(0, 3).toString('latin1') !== 'v10') throw new Error('不认识的加密格式')
  const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
  const d = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
  return Buffer.concat([d.update(data.subarray(3)), d.final()]).toString('utf8')
}

/** 钥匙串里画布笔记的那一项密码（系统会弹一次「允许访问」） */
function notesSafePassword(): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile('/usr/bin/security', ['find-generic-password', '-w', '-s', 'Canvas Notes Safe Storage'], { timeout: 60_000 }, (err, stdout) => (err ? reject(new Error('没读到画布笔记在钥匙串里的那一项（没允许，或者画布笔记还没存过 Key）')) : resolve(stdout.trim()))),
  )
}

/** 用画布笔记那把：解出来，存一份到画布今日自己这里 */
export async function borrowFromNotes(id: ApiId): Promise<void> {
  if (!store) throw new Error('还没准备好')
  if (E2E) {
    const k = testNotesKeys()[id]
    if (!k) throw new Error('画布笔记里没有这一家的 Key')
    store.set(id, k)
    return
  }
  if (!notesDir) throw new Error('没找到画布笔记的设置目录')
  const raw = JSON.parse(readFileSync(join(notesDir, 'ai', 'keys.json'), 'utf8')) as { keys?: Record<string, { data?: string }> }
  const data = raw.keys?.[id]?.data
  if (!data) throw new Error('画布笔记里没有这一家的 Key')
  store.set(id, decryptSafeStorage(Buffer.from(data, 'base64'), await notesSafePassword()))
}
