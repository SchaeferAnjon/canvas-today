/**
 * 积累记录：什么时候剪了一段。剪进来的东西拖上白板、挪进素材之后文件就不在收件箱了，
 * 光看文件数不准，所以剪的那一刻记一笔。只是给首页数数用的缓存，放在软件的设置目录，不进库。
 */
import { app } from 'electron'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ActivityEntry {
  t: number
  kind: 'clip'
  path: string
}

const file = (vaultRoot: string) =>
  join(app.getPath('userData'), 'activity', createHash('sha1').update(vaultRoot).digest('hex').slice(0, 16) + '.jsonl')

export async function logActivity(vaultRoot: string, entry: ActivityEntry): Promise<void> {
  const f = file(vaultRoot)
  await mkdir(join(f, '..'), { recursive: true })
  await appendFile(f, JSON.stringify(entry) + '\n')
}

export async function readActivity(vaultRoot: string): Promise<ActivityEntry[]> {
  let raw: string
  try {
    raw = await readFile(file(vaultRoot), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
  return raw
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ActivityEntry)
}

export const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
