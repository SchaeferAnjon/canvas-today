/**
 * AI 对话里还没定的那张改动卡（勾着的几条）：中间的清单、日历、四象限同时画出改完的样子（task-ykkoz，设计稿第 2–4 屏）。
 * 右栏开着 AI、卡还没收下也没说不要时才有；收下、不要、换对话、收起右栏就清掉。
 */
import { useSyncExternalStore } from 'react'
import type { PlanChange } from '../shared/ai-chat'
import { type Lang, tr } from '../shared/i18n'

let cur: ReadonlyMap<string, PlanChange> = new Map()
const subs = new Set<() => void>()

export function setPreview(changes: readonly PlanChange[] | null) {
  const next = new Map((changes ?? []).map((c) => [c.key, c]))
  if (next.size === 0 && cur.size === 0) return
  cur = next
  subs.forEach((f) => f())
}

export const usePreview = (): ReadonlyMap<string, PlanChange> =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => cur,
  )

/** 收下后撤销了（提示条、卡上的「撤销」）：对话里那张卡改成「撤销了」 */
export const UNDONE_EVENT = 'ct-undone'

const PRIO_MARK = ['', '🔽', '🔼', '⏫']
/** 「⏫ 高」「没设」：和文件里一样的记号 */
export function prioText(lang: Lang, p: number) {
  return p ? `${PRIO_MARK[p]} ${tr(lang, p === 3 ? 'hi' : p === 2 ? 'mid' : 'lo')}` : tr(lang, 'prioNone')
}
