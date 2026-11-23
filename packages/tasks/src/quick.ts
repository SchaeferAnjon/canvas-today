/**
 * 快速加一条：从一句话里认出日子、钟点、重复、提醒（parseWhen，when.ts），再加 #清单、!优先级，剩下的是标题。
 * 「明天下午三点交论文」→ 交论文 · 2026-11-23 15:00。中文为主，也认几种英文（tomorrow 3pm、every day、!high）。
 * #清单、!优先级先拿掉（「#周报」那篇的名字里的字不当成时间），剩下的交给 parseWhen。
 * hits 是认出来的原话，按在这句话里的先后（输入框下面那一行「认出来：…」照它写）。
 */
import { type ISODate } from './dates'
import type { Prio } from './line'
import { parseWhen } from './when'

export interface Quick {
  title: string
  date: ISODate | null
  time: string | null
  /** 写进 🔁 的中文 */
  repeat: string | null
  /** 写进 🔔 的中文（只写了提醒、没有日子的不算，是 null） */
  remind: string | null
  prio: Prio
  /** #后面的字：清单（笔记）名 */
  list: string | null
  hits: string[]
}

const PRIO: Record<string, Prio> = { 高: 3, 中: 2, 低: 1, high: 3, medium: 2, med: 2, low: 1 }

/** now：「2026-11-22」，或带钟点「2026-11-22T16:05」（只写了钟点、今天已经过了的算明天） */
export function parseQuick(text: string, now: ISODate | string): Quick {
  /** 拿掉 #清单、!优先级以后的一份（同样长，拿掉的换成空格，parseWhen 认出来的下标照旧对得上） */
  let s = text
  const own: { at: number; text: string }[] = []
  let prio: Prio = 0
  let list: string | null = null
  const cut = (m: RegExpExecArray, from: number) => {
    const to = m.index + m[0].length
    own.push({ at: from, text: text.slice(from, to).trim() })
    s = s.slice(0, from) + ' '.repeat(to - from) + s.slice(to)
  }
  const p = /[!！](高|中|低|high|medium|med|low)(?![\p{L}\d])/iu.exec(s)
  if (p) {
    prio = PRIO[p[1]!.toLowerCase()]!
    cut(p, p.index)
  }
  const l = /(?:^|\s)#([^\s#]+)/.exec(s)
  if (l) {
    list = l[1]!
    cut(l, l.index + l[0].indexOf('#'))
  }
  const w = parseWhen(s, now)
  const hits = [...(w?.hits ?? []).map((h) => ({ at: h.from, text: h.text })), ...own].sort((a, b) => a.at - b.at).map((h) => h.text)
  const title = w
    ? w.title
    : s
        .replace(/\s+/g, ' ')
        .trim()
        // 英文里留下的介词
        .replace(/\s+(?:at|on|by)$/i, '')
  return { title, date: w?.date ?? null, time: w?.time ?? null, repeat: w?.repeat ?? null, remind: w?.date ? w.remind : null, prio, list, hits }
}
