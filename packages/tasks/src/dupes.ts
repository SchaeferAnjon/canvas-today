/**
 * 抄了好几遍的同一条（滴答清单同步每天把没做完的抄进当天日记，同一条最多抄了 30 遍）：只在列表里合成一条显示，文件不动。
 * 「同一条」：标题一样（空白不计），并且 ^块编号一样，或者日子一样（连起来算：甲和乙同编号、乙和丙同日子，三条是一条）。
 * 没有编号也没有日子的不合（「- [ ] 读书」在好几篇里各是各的）。
 * 显示哪一份：没做完的里面路径排在最后的（日记按日子起名，就是最新那篇）；都做完了就是路径最后的那份。
 * 合成的那一条算没做完：只要还有一份没做完。勾掉、改日子这些写回每一份（「文件里每一行的状态都对」），由各个 App 照 all 去改。
 */
import { type ISODate } from './dates'
import { setCancelled, setDate, setDone, setTime, setTitle } from './edit'
import { editLine, removeBlock } from './file'
import { parseTaskLine } from './line'

export interface DupInput {
  key: string
  path: string
  line: number
  title: string
  date: string | null
  block: string | null
  done: boolean
  cancelled: boolean
}

export interface DupGroup {
  /** 显示的那一份 */
  rep: string
  /** 所有几份（照路径、行号排），含 rep */
  all: string[]
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** 合了的几组：每一份的 key → 它在的那一组（不和别的合的不在里面） */
export function sameTasks(items: readonly DupInput[]): Map<string, DupGroup> {
  const up = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (up.get(r) !== r) r = up.get(r)!
    // 路径压缩
    let c = x
    while (c !== r) {
      const n = up.get(c)!
      up.set(c, r)
      c = n
    }
    return r
  }
  const join = (a: string, b: string) => up.set(find(a), find(b))
  for (const t of items) {
    up.set(t.key, t.key)
    const title = norm(t.title)
    if (!title) continue
    for (const k of [t.block ? `b\u0000${title}\u0000${t.block}` : null, t.date ? `d\u0000${title}\u0000${t.date}` : null]) {
      if (!k) continue
      if (!up.has(k)) up.set(k, k)
      join(t.key, k)
    }
  }
  const groups = new Map<string, DupInput[]>()
  for (const t of items) {
    const r = find(t.key)
    const g = groups.get(r)
    if (g) g.push(t)
    else groups.set(r, [t])
  }
  const out = new Map<string, DupGroup>()
  const order = (a: DupInput, b: DupInput) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line)
  for (const g of groups.values()) {
    if (g.length < 2) continue
    g.sort(order)
    const open = g.filter((t) => !t.done && !t.cancelled)
    const rep = (open.length ? open : g)[(open.length ? open : g).length - 1]!.key
    const grp: DupGroup = { rep, all: g.map((t) => t.key) }
    for (const t of g) out.set(t.key, grp)
  }
  return out
}

/** 列表里的一条（两个 App 的 TaskView / TodoItem 都有这几样）：dupOf、dups 照 sameTasks 填好的 */
export interface DupItem {
  key: string
  path: string
  line: number
  raw: string
  dupOf: string | null
  dups: string[]
}

/** 点的是 at 这一行：同一条的另外几份（不含它自己；不是抄了几遍的是空的）。先按行号和原文认，再只按原文认 */
export function copiesOf<T extends DupItem>(items: readonly T[], at: { path: string; line: number; raw: string }): T[] {
  const me = items.find((t) => t.path === at.path && t.line === at.line && t.raw === at.raw) ?? items.find((t) => t.path === at.path && t.raw === at.raw)
  const rep = me?.dupOf ? items.find((t) => t.key === me.dupOf) : me
  if (!me || !rep) return []
  const keys = new Set([rep.key, ...rep.dups])
  keys.delete(me.key)
  return items.filter((t) => keys.has(t.key))
}

/**
 * 合成一条的另外几份跟着改的那几样：做没做完、日子钟点、标题（这几样不跟着改，下回就认不成同一条、或者状态对不上）、删掉。
 * 提醒、重复、优先级、加子任务、挪走只改显示的那一份（勾掉重复的也只有那一份在下面加下一次）。
 * date 是 undefined：日子不动只改钟点；time 是 undefined：钟点不动
 */
export type CopyEdit = { op: 'done'; done: boolean } | { op: 'cancel' } | { op: 'when'; date?: ISODate | null; time?: string | null } | { op: 'title'; title: string } | { op: 'delete' }

/** 另外一份（第 n 行）跟着改；取消了的那份不勾 */
export function editCopy(text: string, n: number, e: CopyEdit, today: ISODate): string {
  switch (e.op) {
    case 'done':
      return editLine(text, n, (l) => (parseTaskLine(l)?.cancelled ? l : setDone(l, e.done, today)))
    case 'cancel':
      // 不做了：没做完的那几份一起标成 [-]（不然下一份又冒出来）；勾掉了的不动
      return editLine(text, n, (l) => (parseTaskLine(l)?.done ? l : setCancelled(l, today)))
    case 'when':
      return editLine(text, n, (l) => {
        const x = e.date === undefined ? l : setDate(l, e.date)
        return e.time === undefined || e.date === null ? x : setTime(x, e.time, today)
      })
    case 'title':
      return e.title.trim() ? editLine(text, n, (l) => setTitle(l, e.title)) : text
    case 'delete':
      return removeBlock(text, n).text
  }
}
