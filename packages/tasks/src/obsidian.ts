/**
 * 从 Obsidian 导入（Obsidian Tasks 的写法换成我们的）：
 * 📅 ✅ ⏫ 🔼 🔽 🆔 原样；⏰ HH:MM 并进 📅 后面（没有 📅 就用 ⏰ 带的日子）；
 * 🔁 every day / every week on Monday / every month on the 1st / every 3 days / when done 换成中文；认不出的原样留着；
 * ⏳ 🛫 ➕ 我们不用，原样留在行里不动。只换待办那几行，别的行（属性、代码块里的）一个字节都不动。
 */
import { setDate, setRepeat, setTime } from './edit'
import { editLine, scanTasks } from './file'
import { parseTaskLine } from './line'
import { monFirst } from './recur'

const WD = '日一二三四五六'
const DAY: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }

/** Obsidian Tasks 的英文重复规则 → 中文；认不出返回 null */
export function repeatFromObsidian(raw: string): string | null {
  let s = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  let tail = ''
  if (/ when done$/.test(s)) {
    tail = '（做完后）'
    s = s.replace(/ when done$/, '')
  }
  let m: RegExpExecArray | null
  if (s === 'every day') return '每天' + tail
  if ((m = /^every (\d+) days?$/.exec(s))) return (m[1] === '1' ? '每天' : `每${Number(m[1])}天`) + tail
  if (s === 'every weekday') return '工作日' + tail
  if (s === 'every week') return '每周' + tail
  if ((m = /^every (\d+) weeks?$/.exec(s))) return (m[1] === '1' ? '每周' : `每${Number(m[1])}周`) + tail
  if ((m = /^every week on ([a-z, ]+)$/.exec(s))) {
    const names = m[1]!.split(/,\s*|\s+and\s+|\s+/).filter(Boolean)
    if (!names.every((n) => n in DAY)) return null
    const days = [...new Set(names.map((n) => DAY[n]!))].sort(monFirst)
    return '每周' + days.map((d) => WD[d]).join('、') + tail
  }
  if (s === 'every month') return '每月' + tail
  if ((m = /^every (\d+) months?$/.exec(s))) return (m[1] === '1' ? '每月' : `每${Number(m[1])}个月`) + tail
  if ((m = /^every month on the (\d{1,2})(?:st|nd|rd|th)$/.exec(s))) return `每月${Number(m[1])}日` + tail
  if (s === 'every year') return '每年' + tail
  return null
}

/** 换一行；不是待办、没有要换的就原样返回 */
export function importObsidianLine(line: string): string {
  const t = parseTaskLine(line)
  if (!t) return line
  let out = line
  const rep = t.fields.find((f) => f.kind === 'repeat')
  if (rep) {
    const zh = repeatFromObsidian(rep.value)
    if (zh) out = setRepeat(out, zh)
  }
  const alarm = parseTaskLine(out)!.fields.find((f) => f.kind === 'alarm')
  if (alarm) {
    const m = /^(?:(\d{4}-\d{2}-\d{2})[ \t]+)?(\d{1,2}:\d{2})$/.exec(alarm.value)
    const day = m?.[1] ?? parseTaskLine(out)!.date
    // 有日子可并（📅 或 ⏰ 自己带的）才换：先拿掉 ⏰ 这一段，再把钟点放到 📅 后面；只有钟点、没有日子的原样留着
    if (m && day) {
      out = out.slice(0, alarm.start) + out.slice(alarm.end)
      const time = m[2]!.padStart(5, '0')
      out = parseTaskLine(out)!.date ? setTime(out, time) : setTime(setDate(out, day), time)
    }
  }
  return out
}

/** 换整篇：只动待办那几行 */
export function importObsidianText(text: string): string {
  let out = text
  for (const t of scanTasks(text)) out = editLine(out, t.line, importObsidianLine)
  return out
}
