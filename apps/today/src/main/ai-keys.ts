/**
 * 画布今日的 API Key（task-587os，设计页第 4 节「Key 借用」）：画布今日自己一份，用 Electron safeStorage 加密（钥匙串里「Canvas Today Safe Storage」），
 * 密文在画布今日的 userData/ai-keys.json。第一次要用一把 Key（画布笔记的「小活」选的是 Claude API 这类）而画布今日还没有时，
 * 界面问一句「用画布笔记里存的 Anthropic Key？」，同意后从画布笔记那份解出来、存一份到画布今日自己这里。
 * 不做两个软件共用一个钥匙串项（那要两边同一签名加钥匙串共享权限，签名没定之前做不稳）。
 * 画布笔记那份怎么读、怎么解在共用包 @cn/ai-engines 的 keys.ts（ParaRead 也照这个借）。
 * 测试实例（E2E）不碰钥匙串：Key 只放内存，画布笔记那份从 CT_TEST_NOTES_KEYS（{"anthropic":"sk-…"}）来。
 */
import { safeStorage } from 'electron'
import { join } from 'node:path'
import { KeyStore, type NotesKeys, notesHasKey as notesHas, parseTestKeys, readNotesKey } from '@cn/ai-engines'
import { type ApiId, isApi } from '@cn/ai-engines/shared'
import { E2E } from './test-mode'

let store: KeyStore | null = null
let notes: NotesKeys = { dir: null }

export function initKeys(userData: string, notesDir: string | null) {
  notes = { dir: notesDir, test: E2E ? parseTestKeys(process.env.CT_TEST_NOTES_KEYS ?? '{}') : null }
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
export const notesHasKey = (id: ApiId): boolean => notesHas(notes, id)

/** 要问「用画布笔记那把？」吗：这一家要 Key、画布今日没有、画布笔记有 */
export function needBorrow(engine: string): ApiId | null {
  if (!isApi(engine) || todayKey(engine)) return null
  return notesHasKey(engine) ? engine : null
}

/** 用画布笔记那把：解出来，存一份到画布今日自己这里 */
export async function borrowFromNotes(id: ApiId): Promise<void> {
  if (!store) throw new Error('还没准备好')
  store.set(id, await readNotesKey(notes, id))
}
