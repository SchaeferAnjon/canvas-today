/** 左栏摘了哪些文件夹、文件夹的图标和颜色：库里的 .canvas-notes/左栏.json（和置顶同一个文件夹，跟着 Git 走） */
import { readFile } from 'node:fs/promises'
import { cleanLeft, type LeftConfig, leftJson, LEFT_FILE, normalizeLeft, remapLeft, sameAsDefault } from '../shared/left'
import type { Vault } from './vault'
import { writeQueued } from '@cn/atomic'

export async function readLeft(vault: Vault): Promise<LeftConfig> {
  try {
    return normalizeLeft(JSON.parse(await readFile(vault.abs(LEFT_FILE), 'utf8')))
  } catch (e) {
    // 没有文件是还没设过；文件坏了（手改、合并冲突）当没设过，不挡着左栏
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || e instanceof SyntaxError) return normalizeLeft(null)
    throw e
  }
}

/** 界面交来的整份设置（{ left, looks }）：先过一遍 normalize 再写 */
export async function writeLeft(vault: Vault, raw: unknown): Promise<LeftConfig> {
  const c = cleanLeft((raw && typeof raw === 'object' ? raw : {}) as Partial<LeftConfig>)
  const text = leftJson(c)
  const p = vault.abs(LEFT_FILE)
  const cur = await readFile(p, 'utf8').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return null
    throw e
  })
  // 一样就不写，免得 Git 里多出假改动；还是默认的样子、也没有文件，不建文件
  if (cur !== text && !(cur === null && sameAsDefault(c))) {
    await writeQueued(p, text, { mkdir: true })
  }
  return c
}

/** 文件夹改名、挪走、删掉之后：左边和图标跟着换路径或拿掉；返回有没有写 */
export async function relookAll(vault: Vault, map: (p: string) => string | null | undefined): Promise<boolean> {
  const cur = await readLeft(vault)
  const next = remapLeft(cur, map)
  if (leftJson(next) === leftJson(cur)) return false
  await writeLeft(vault, next)
  return true
}
