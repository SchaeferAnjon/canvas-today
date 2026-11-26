/**
 * AI 改白板（2026-11-21 起的写法：白板就是这篇文档，## 是列、一段是一张卡，doc-board.ts）用的纯函数：读进 md 文字，改完还是 md 文字。
 * 卡的 id 是白板上同一个名字（unitKeys：空白处的卡、连线两头的卡用注释里的编号，别的用字的签名）；列的 id 就是列名。
 * 和手动在白板上做一样：放进列就是插进那一节，拖到空白处就是这段前面多一行位置，加列就是新起一节。
 */
import {
  addSection,
  BOARD_COL_GAP,
  BOARD_COL_W,
  pushApart,
  appendPlaced,
  type DocBoard,
  type DocColumn,
  type DocUnit,
  insertInColumn,
  linksOf,
  linkUnits,
  moveUnit,
  placeUnit,
  splitDoc,
  unitKeys,
} from '@cn/format'
import type { ArrangeMode, BoardSummary, NewCard, Size } from './board-ops'

const GAP = 24
const COL_W = BOARD_COL_W

function find(text: string, id: string): { b: DocBoard; u: DocUnit } {
  const b = splitDoc(text)
  for (const [u, k] of unitKeys(b)) if (k === id) return { b, u }
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  throw new Error(`白板上没有 id 是 ${id} 的卡片（先用 board_list 看现在的 id，改过字的卡 id 会变）`)
}

function column(b: DocBoard, id: string): DocColumn {
  const c = b.columns.find((x) => x.head && (x.title === id || x.place?.id === id))
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  if (!c) throw new Error(`白板上没有叫「${id}」的列（列的 id 就是列名）`)
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  if (c.ask) throw new Error('「问过 AI」这一列是软件记的，不能往里放')
  return c
}

/** 新加的那张卡的 id：按字找回它（同样的字有几张时取文件里最后那张） */
function idOf(text: string, body: string): string {
  const b = splitDoc(text)
  let hit = ''
  for (const [u, k] of unitKeys(b)) if (u.text.trim() === body.trim()) hit = k
  return hit
}

export function summarize(text: string): BoardSummary {
  const b = splitDoc(text)
  const keys = unitKeys(b)
  const out: BoardSummary = { cards: [], columns: [], links: linksOf(text), loose: [] }
  // 告诉 AI 的位置照白板上画的：原来按 276 宽摆的、加宽以后叠了的已经推开（pushApart）；一排的列按第几个一排的列算
  const shown = pushApart([...b.columns.flatMap((c) => (c.place ? [{ id: 'c:' + c.place.id, x: c.place.x }] : [])), ...b.placed.map((u) => ({ id: 'u:' + u.place!.id, x: u.place!.x }))])
  let flow = 0
  b.columns.forEach((c) => {
    const x = c.place ? (shown.get('c:' + c.place.id) ?? c.place.x) : flow++ * (COL_W + BOARD_COL_GAP)
    const cards = c.cards.filter((u) => u.kind !== 'gap')
    // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
    const id = c.title ?? '开头'
    // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
    if (c.head || cards.length) out.columns.push({ id, title: c.title ?? '（开头没有列名的一组）', x, y: c.place?.y ?? 64, w: COL_W, cards: cards.map((u) => keys.get(u)!), ...(c.ask ? { fixed: true as const } : {}) })
    for (const u of cards) out.cards.push({ id: keys.get(u)!, text: u.text, column: id })
  })
  for (const u of b.placed) out.cards.push({ id: keys.get(u)!, text: u.text, x: shown.get('u:' + u.place!.id) ?? u.place!.x, y: u.place!.y, w: COL_W })
  return out
}

/** 加一张卡：给 column（列名）就插进那一节末尾；给坐标就放在空白处（文末带一行位置）；都不给就加在文末那一节 */
export function addCard(text: string, card: NewCard): { text: string; id: string } {
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  if (!card.text.trim()) throw new Error('卡片内容是空的')
  const b = splitDoc(text)
  let next: string
  if (card.column) next = insertInColumn(text, column(b, card.column), null, card.text)
  else if (card.x !== undefined && card.y !== undefined) next = appendPlaced(text, card.text, card.x, card.y)
  else {
    const last = [...b.columns].reverse().find((c) => !c.ask && (c.head || !b.placed.length))
    if (last) next = insertInColumn(text, last, null, card.text)
    else if (b.placed.length) {
      // 白板上只有散着的卡（没分节）：新卡也放在空白处，摆在最下面那张的下面（排整齐时一起排）
      const low = b.placed.reduce((m, u) => (u.place!.y > m.place!.y ? u : m))
      next = appendPlaced(text, card.text, low.place!.x, low.place!.y + 200)
    } else next = text.replace(/\n*$/, '\n\n') + card.text.trim() + '\n'
  }
  return { text: next, id: idOf(next, card.text) }
}

/** 加一列 = 文档末尾新起一节；列的 id 就是列名 */
export function addColumn(text: string, col: { title: string }): { text: string; id: string } {
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  const title = col.title.replace(/\s+/g, ' ').trim() || '新的列'
  const b = splitDoc(text)
  if (b.columns.some((c) => c.title === title)) return { text, id: title }
  return { text: addSection(text, title, null, b.level), id: title }
}

export function setCardText(text: string, id: string, body: string): string {
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  if (!body.trim()) throw new Error('卡片内容是空的；要删卡片请让用户自己删')
  const { u } = find(text, id)
  return text.slice(0, u.from) + body.trim() + text.slice(u.to)
}

/** 挪到空白处的 (x, y)：这段前面多一行位置（列里的卡从列里拿出来），正文顺序不变 */
export function moveTo(text: string, id: string, x: number, y: number): string {
  const { u } = find(text, id)
  return placeUnit(text, u, Math.max(0, x), Math.max(0, y), id)
}

/** 放进列：position 从 0 数，不给就放最后；文档里这段也挪进那一节 */
export function putInColumn(text: string, id: string, col: string, position?: number): string {
  const { b, u } = find(text, id)
  const c = column(b, col)
  const cards = c.cards.filter((x) => x.kind !== 'gap' && x.from !== u.from)
  const at = position === undefined ? cards.length : Math.max(0, Math.min(cards.length, Math.floor(position)))
  return moveUnit(text, u, c, cards[at] ?? null)
}

export function link(text: string, from: string, to: string): string {
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  if (from === to) throw new Error('不能自己连自己')
  const a = find(text, from).u
  const b = find(text, to).u
  return linkUnits(text, a, b, [from, to]).text
}

/** 只改一张空白处的卡的坐标 */
export function placeAt(text: string, id: string, x: number, y: number): string {
  return moveTo(text, id, x, y)
}

/**
 * 排整齐：空白处的卡按现在的阅读顺序重新摆（列已经是一排，跟着文档的节走，不动）。
 * grid：一行 per 个；columns：per 竖，下一张放进最矮的那一竖
 */
export function arrangeSteps(text: string, mode: ArrangeMode, opts: { per?: number; sizes?: Record<string, Size> } = {}): { id: string; x: number; y: number }[] {
  const b = splitDoc(text)
  const keys = unitKeys(b)
  const placed = b.placed.map((u) => ({ id: keys.get(u)!, x: u.place!.x, y: u.place!.y, h: opts.sizes?.[keys.get(u)!]?.h ?? 160 }))
  if (!placed.length) return []
  const order = [...placed].sort((a, c) => (Math.abs(a.y - c.y) < 40 ? a.x - c.x : a.y - c.y))
  const x0 = Math.min(...order.map((p) => p.x))
  const y0 = Math.min(...order.map((p) => p.y))
  const per = Math.max(1, Math.min(8, Math.floor(opts.per ?? (mode === 'grid' ? Math.ceil(Math.sqrt(order.length)) : Math.min(3, order.length)))))
  const spot = new Map<string, { x: number; y: number }>()
  if (mode === 'grid') {
    let y = y0
    for (let r = 0; r * per < order.length; r++) {
      const row = order.slice(r * per, r * per + per)
      row.forEach((p, c) => spot.set(p.id, { x: x0 + c * (COL_W + GAP), y }))
      y += Math.max(...row.map((p) => p.h)) + GAP
    }
  } else {
    const hs = new Array<number>(per).fill(y0)
    for (const p of order) {
      const c = hs.indexOf(Math.min(...hs))
      spot.set(p.id, { x: x0 + c * (COL_W + GAP), y: hs[c]! })
      hs[c] = hs[c]! + p.h + GAP
    }
  }
  return order.map((p) => ({ id: p.id, x: Math.round(spot.get(p.id)!.x), y: Math.round(spot.get(p.id)!.y) })).filter((s) => {
    const p = placed.find((x) => x.id === s.id)!
    return p.x !== s.x || p.y !== s.y
  })
}

export function arrange(text: string, mode: ArrangeMode, opts: { per?: number; sizes?: Record<string, Size> } = {}): string {
  let out = text
  for (const s of arrangeSteps(text, mode, opts)) out = placeAt(out, s.id, s.x, s.y)
  return out
}
