/** 置顶列表存在库里的 .canvas-notes/置顶.json（和首页设置同一个文件夹，跟着 Git 走） */
import { readFile } from 'node:fs/promises'
import { movePin, normalizePins, pinsJson, PINS_FILE, setPin } from '../shared/sidebar'
import type { Vault } from './vault'
import { writeQueued } from '@cn/atomic'

export async function readPins(vault: Vault): Promise<string[]> {
  try {
    return normalizePins(JSON.parse(await readFile(vault.abs(PINS_FILE), 'utf8')))
  } catch (e) {
    // 没有文件是还没置顶过；文件坏了（手改、合并冲突）当没置顶，不挡着左栏
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || e instanceof SyntaxError) return []
    throw e
  }
}

async function writePins(vault: Vault, pins: string[]): Promise<string[]> {
  const text = pinsJson(pins)
  const p = vault.abs(PINS_FILE)
  const cur = await readFile(p, 'utf8').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return null
    throw e
  })
  // 一样就不写，免得 Git 里多出假改动；还没置顶过、也没要置顶的，不建文件
  if (cur !== text && !(cur === null && pins.length === 0)) {
    await writeQueued(p, text, { mkdir: true })
  }
  return normalizePins(pins)
}

export async function pinNote(vault: Vault, path: string, on: boolean): Promise<string[]> {
  vault.abs(path)
  return writePins(vault, setPin(await readPins(vault), path, on))
}

/** 文件夹改名、删掉之后：里面的置顶一起换路径（map 返回新路径）或拿掉（返回 null）；返回有没有写 */
export async function repinAll(vault: Vault, map: (p: string) => string | null | undefined): Promise<boolean> {
  const pins = await readPins(vault)
  const next = pins.flatMap((p) => {
    const to = map(p)
    return to === undefined ? [p] : to === null ? [] : [to]
  })
  if (next.join('\n') === pins.join('\n')) return false
  await writePins(vault, next)
  return true
}

/** 改名、挪走、删掉之后：置顶跟着换路径或拿掉；没置顶这篇就什么都不写 */
export async function repin(vault: Vault, from: string, to: string | null): Promise<void> {
  const pins = await readPins(vault)
  if (!pins.includes(from)) return
  await writePins(vault, movePin(pins, from, to))
}
