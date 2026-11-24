/**
 * AI 动手时的流光（DESIGN.v3 2.3，2026-11-21 用户选方向 A，A2：慢一点、一道光、边缘柔化、颜色淡）：
 * 主进程和界面共用的几件事——一个工具算不算动手、动的是整块还是只一处，做完、停下时提示条上那句话。
 * 不依赖 Electron，单元测试在 test/ai-act.test.ts。
 */
import type { AiActArea } from './agent'
import { t as tNow } from './i18n'

/** 这一轮做了多少：做完时「整理好了 · 挪了4张卡」、停下时「做完的N步留着」从这里来 */
export interface ActTally {
  /** 挪了几张卡（挪到空白处、放进一列、排整齐时一张一张挪） */
  moved: number
  /** 加了几张卡、文档里加了几段 */
  added: number
  /** 改了几张卡、文档里改了几段 */
  changed: number
  /** 网页里剪了几段 */
  clipped: number
}

export const noTally = (): ActTally => ({ moved: 0, added: 0, changed: 0, clipped: 0 })

/** 这一轮改到的一篇在这次提交里加减了几行（文档栏收尾「改好了 · +20 −0」，和改动卡同一个数） */
export interface ActLines {
  added: number
  removed: number
}

/** 当前标签：哪篇、现在是白板看法还是文档看法、这篇是不是白板 */
export interface ActTab {
  path: string | null
  mode: 'board' | 'doc' | null
  board: boolean
}

export interface ActScope {
  area: AiActArea
  /** true：整块亮（四边一道光绕圈、顶上提示条）；false：只亮那一处（加的那张卡、写的那一段） */
  whole: boolean
  path: string | null
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const md = (p: string) => (/\.md$/i.test(p) ? p : `${p}.md`)

/**
 * 这个工具在哪动手：只是看（board_list、doc_read）不算，光只在 AI 真动手的地方；
 * 只加一张卡（board_add_card）只亮那一张；别的改白板的整块亮；改开着的这篇（写一段 doc_insert、换掉选中的一段、整篇改写 note_write）
 * 整篇四边亮（2026-11-24 用户：AI 改文档时也要白板那样的边），改到的那一段另有竖线（ai-spot.ts）；
 * 网页的每一步都算整块（亮哪一页由主进程 webGlow 认，path 是那一页）。null：不画。
 */
export function actScope(name: string, args: Record<string, unknown>, tab: ActTab): ActScope | null {
  if (name.startsWith('web_')) return { area: 'web', whole: true, path: null }
  if (name === 'board_list' || name === 'doc_read') return null
  const boardHere = tab.path && (tab.board || tab.mode === 'board') ? tab.path : null
  if (name.startsWith('board_')) {
    const path = str(args.path) ?? boardHere
    return path ? { area: 'board', whole: name !== 'board_add_card', path } : null
  }
  if (name === 'doc_insert' || name === 'doc_replace_selection') return tab.path && tab.mode !== 'board' ? { area: 'doc', whole: true, path: tab.path } : null
  if (name === 'note_write') {
    const p = str(args.path)
    if (!p || !tab.path || md(p) !== tab.path) return null
    return { area: tab.mode === 'board' ? 'board' : 'doc', whole: true, path: tab.path }
  }
  return null
}

/** 做完时提示条上的话（原型 A：「整理好了 · 挪了4张卡」「改好了 · 改了3段」），后面跟「撤回」 */
export function actDoneText(area: AiActArea, t: ActTally): string {
  if (area === 'board') {
    const parts = [t.moved && tNow('挪了{n}张卡', { n: t.moved }), t.added && tNow('加了{n}张卡', { n: t.added }), t.changed && tNow('改了{n}张卡', { n: t.changed })].filter(Boolean)
    return [tNow('整理好了'), ...parts].join(' · ')
  }
  if (area === 'doc') {
    const parts = [t.changed && tNow('改了{n}段', { n: t.changed }), t.added && tNow('加了{n}段', { n: t.added })].filter(Boolean)
    return [tNow('改好了'), ...parts].join(' · ')
  }
  return t.clipped ? tNow('做好了 · 剪了{n}段', { n: t.clipped }) : tNow('做好了')
}

/** 文档栏收尾那句的前半（后面跟这一篇加减的行数「+20 −0」，数字照改动卡上色）：做完「改好了」，停下「停下了 · 改的留着」 */
export function docLinesHead(stopped: boolean): string {
  return stopped ? tNow('停下了 · 改的留着') : tNow('改好了')
}

/** 停下以后（这一步做完了）提示条上的话 */
export function actHaltText(t: ActTally): string {
  const n = t.moved + t.added + t.changed + t.clipped
  return n ? tNow('停下了 · 做完的{n}步留着', { n }) : tNow('停下了 · 什么也没改')
}

/** 整篇改写时改了几段：新的一篇里有几段是原来没有的（按空行分段，空段不算） */
export function changedParas(before: string, after: string): number {
  const paras = (s: string) =>
    s
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
  const old = new Map<string, number>()
  for (const p of paras(before)) old.set(p, (old.get(p) ?? 0) + 1)
  let n = 0
  for (const p of paras(after)) {
    const k = old.get(p) ?? 0
    if (k > 0) old.set(p, k - 1)
    else n++
  }
  return n
}
