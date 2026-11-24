/**
 * 估时（排一天的时间块多长）：写在那一行里，Dataview 的行内字段「[估时:: 30分钟]」（2026-11-23 画布今日排一天定）。
 * 为什么是它：开始的钟点本来就在 📅 后面（📅 2026-11-23 10:30），块多长是唯一要新加的；Obsidian Tasks 没有时长这一项，
 * Dataview 的行内字段是 Obsidian 里大家都认的写法（Dataview 查得出来、Tasks 当标题的字原样留着），
 * 记号照旧、内容写中文（同 🔔 提前1小时、🔁 每周日）。读的时候也认 [duration:: 30m]、[时长:: 1h] 这几种别人写的。
 * 读写位置在 line.ts（dv 字段）和 edit.ts（setDuration）；这里只管字和分钟互换。
 */

/** 认作估时的 Dataview 键（小写）；写的时候用第一个 */
export const DURATION_KEYS: readonly string[] = ['估时', '时长', 'duration', 'estimate']

/** 最长一块 12 小时：再长的当写错了 */
const MAX = 12 * 60

/**
 * 「30分钟」「1小时」「1小时30分钟」「1.5小时」「30m」「1h30m」「90 min」「2 hours」→ 分钟；认不出、是 0、超过 12 小时是 null。
 * 只有数字（「45」）当分钟
 */
export function parseMinutes(s: string): number | null {
  const v = s.trim().toLowerCase().replace(/\s+/g, '')
  if (!v) return null
  if (/^\d+$/.test(v)) return ok(Number(v))
  const re = /(\d+(?:\.\d+)?)(小时|个小时|时|hours?|hrs?|h|分钟|分|minutes?|mins?|m)/gy
  let total = 0
  let at = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(v))) {
    const n = Number(m[1])
    total += /^(小时|个小时|时|h)/.test(m[2]!) ? n * 60 : n
    at = re.lastIndex
  }
  if (at !== v.length) return null
  return ok(Math.round(total))
}

const ok = (n: number) => (n > 0 && n <= MAX ? n : null)

/** 分钟 → 写进文件的字：「15分钟」「1小时」「1小时30分钟」 */
export function minutesText(n: number): string {
  const h = Math.floor(n / 60)
  const m = n % 60
  if (!h) return `${m}分钟`
  return m ? `${h}小时${m}分钟` : `${h}小时`
}

/** 原来是英文写法（30m、1h）的照英文写回去：别人手写的样子不换掉 */
export function minutesTextLike(n: number, old: string): string {
  if (!/[a-z]/i.test(old)) return minutesText(n)
  const h = Math.floor(n / 60)
  const m = n % 60
  return h ? `${h}h${m ? m + 'm' : ''}` : `${m}m`
}
