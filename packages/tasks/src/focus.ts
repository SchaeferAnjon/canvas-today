/**
 * 专注记录（番茄钟，v2 原型「专注」）：库里 .canvas-tasks/专注/<设备名>/YYYY-MM.csv，每台设备只写自己那份（Git 合并不打架），
 * 读的时候把所有设备的合起来看（和提醒记录 .canvas-tasks/提醒/ 一个做法）。第一行是表头，之后一行一次：
 *   开始,结束,分钟,🆔,标题,笔记
 *   2026-11-22T09:00,2026-11-22T09:25,25,a1b2c3,读完三篇相关论文,写作/小论文计划.md
 * 开始、结束是本地钟点（不带时区）；🆔 是那一条任务的编号（开始专注时它没有就给它加一个，行号变了也认得出）；
 * 标题、笔记是那时候的，给人看的，认任务只认 🆔。只有专注满了才记一行，中途放弃的不记。
 */

export const FOCUS_MINUTES = 25
export const FOCUS_HEADER = '开始,结束,分钟,🆔,标题,笔记'

export interface FocusRecord {
  /** 本地钟点「2026-11-22T09:00」 */
  start: string
  end: string
  minutes: number
  /** 那一条任务的 🆔（没挂任务是 null） */
  id: string | null
  title: string
  path: string
}

/** 记录那份文件放哪：.canvas-tasks/专注/<设备名>/YYYY-MM.csv */
export const focusPath = (device: string, month: string): string => `.canvas-tasks/专注/${device}/${month}.csv`

const cell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

export function focusLine(r: FocusRecord): string {
  return [r.start, r.end, String(r.minutes), r.id ?? '', r.title, r.path].map(cell).join(',')
}

/** 加一行（文件还没有：先写表头） */
export function appendFocus(text: string | null, r: FocusRecord): string {
  const base = text ? (text.endsWith('\n') ? text : text + '\n') : FOCUS_HEADER + '\n'
  return base + focusLine(r) + '\n'
}

/** 一行 CSV 拆成几格（引号里的逗号、两个引号照规矩） */
function cells(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** 读一份或几份合起来的字；表头、坏行（合并冲突留下的、手改坏的）跳过 */
export function parseFocus(text: string): FocusRecord[] {
  const out: FocusRecord[] = []
  for (const l of text.split(/\r?\n/)) {
    if (!l.trim() || l === FOCUS_HEADER) continue
    const c = cells(l)
    if (c.length < 6 || !STAMP.test(c[0]!) || !STAMP.test(c[1]!)) continue
    const minutes = Number(c[2])
    if (!Number.isFinite(minutes) || minutes <= 0) continue
    out.push({ start: c[0]!, end: c[1]!, minutes, id: c[3] || null, title: c[4]!, path: c[5]! })
  }
  return out
}

/** 某一天的（按开始的先后） */
export const focusOn = (rs: readonly FocusRecord[], day: string): FocusRecord[] => rs.filter((r) => r.start.slice(0, 10) === day).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))

/** 这一条任务专注过几次（🍅） */
export const pomodoros = (rs: readonly FocusRecord[], id: string | null): number => (id ? rs.filter((r) => r.id === id).length : 0)
