/**
 * 软件里的「现在」：平时就是系统时间；测试用 CT_NOW=2026-11-22T10:20:00（本地钟点）把钟拨到那一刻，之后照常往前走，
 * 测试模式里还能用 globalThis.ctSetClock('2026-11-23T13:59:58') 当场拨钟（测到点提醒不用真等）。界面拿同一个差值。
 */
import { E2E } from './test-mode'

let offset = 0
const subs = new Set<(offset: number) => void>()

function parseLocal(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s)
  if (!m) throw new Error(`钟点写法不对：${s}（要 2026-11-22T10:20:00）`)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)).getTime()
}

if (process.env.CT_NOW) offset = parseLocal(process.env.CT_NOW) - Date.now()

export const now = () => Date.now() + offset
export const clockOffset = () => offset

export function onClock(f: (offset: number) => void): () => void {
  subs.add(f)
  return () => subs.delete(f)
}

export function setClock(local: string) {
  offset = parseLocal(local) - Date.now()
  for (const f of subs) f(offset)
}

if (E2E) (globalThis as unknown as { ctSetClock: (s: string) => void }).ctSetClock = setClock
