/**
 * 归档和置顶。左栏怎么分组在 recent.ts（「最近」按时间）和 left.ts（摘出来的文件夹）。纯函数，主进程和界面都用。
 *
 * 归档 = 很久没改过（按修改时间）。不挪文件、不改内容，只是左栏不显示；置顶的永不归档；
 * 收件箱不归档（那是等着整理的，藏起来就看不见堆了多少）。一编辑修改时间就变了，自然回到左栏。
 */
import type { NoteFile } from './api'

export const DAY_MS = 86400_000

/** 设置里能选的天数；0 = 不自动归档 */
export const ARCHIVE_CHOICES = [30, 60, 90, 180, 0] as const
export type ArchiveDays = (typeof ARCHIVE_CHOICES)[number]
export const DEFAULT_ARCHIVE_DAYS: ArchiveDays = 90
export const isArchiveDays = (v: unknown): v is ArchiveDays => ARCHIVE_CHOICES.includes(v as ArchiveDays)
export const archiveLabel = (d: ArchiveDays) => (d === 0 ? '不自动归档' : `${d}天没改过`)

/** 收件箱超过这么多条就提醒 */
export const INBOX_WARN = 20

export function isArchived(n: NoteFile, now: number, days: ArchiveDays, pinned: ReadonlySet<string>): boolean {
  if (days === 0 || n.kind === 'inbox' || pinned.has(n.path)) return false
  return now - n.mtimeMs > days * DAY_MS
}

// ---------- 置顶：库里的 .canvas-notes/置顶.json，跟着 Git 走 ----------

export const PINS_FILE = '.canvas-notes/置顶.json'

/** 读出来的可能被手改过或合并冲突过：只留 .md 路径和文件夹（「写作/」），去重，不许 .. 跳出库 */
export function normalizePins(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const p of raw) {
    if (typeof p !== 'string' || !(/\.md$/i.test(p) || (/[^/]\/$/.test(p) && !p.slice(0, -1).split('/').some((s) => !s || s.startsWith('.')))) || p.startsWith('/') || p.split('/').includes('..') || out.includes(p)) continue
    out.push(p)
  }
  return out
}

/** 写进文件的样子：两格缩进、最后一个换行 */
export const pinsJson = (pins: readonly string[]) => JSON.stringify(normalizePins(pins), null, 2) + '\n'

/** 置顶排到最后，取消就拿掉 */
export function setPin(pins: readonly string[], path: string, on: boolean): string[] {
  const rest = pins.filter((p) => p !== path)
  return on ? [...rest, path] : rest
}

/** 改名、挪走：置顶跟着换路径；删掉（to 是 null）就拿掉 */
export function movePin(pins: readonly string[], from: string, to: string | null): string[] {
  return pins.flatMap((p) => (p !== from ? [p] : to ? [to] : []))
}
