/**
 * AI 建的带钟点的待办默认写「🔔 准时」（2026-11-24 用户定）：用户说了提前多久的，AI 照说的写（画布笔记 AGENT_SYSTEM 的规矩）；
 * AI 忘了写的，这一轮结束软件补上：和这一轮开始时那一篇比，新多出来的、没勾、有日子有钟点、没写 🔔 的待办加「🔔 准时」。
 * 原来就有的（同标题的待办这一轮开始时就在这篇里）不补：那是 AI 改了用户的，不是新建的。
 */
import { setRemind } from './edit'
import { editLine, scanTasks } from './file'
import { IMPLICIT_REMIND } from './remind'

export function remindNewTimed(before: string, after: string): { text: string; n: number } {
  const had = new Set(scanTasks(before).map((t) => t.task.title.trim()))
  let text = after
  let n = 0
  for (const t of scanTasks(after)) {
    const k = t.task
    if (k.done || k.cancelled || !k.date || !k.time || k.remind || had.has(k.title.trim())) continue
    text = editLine(text, t.line, (l) => setRemind(l, IMPLICIT_REMIND))
    n++
  }
  return { text, n }
}
