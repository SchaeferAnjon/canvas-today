/**
 * AI 改白板用的纯函数：读进 md 文字，改完还是 md 文字。只用 @cn/format 的白板读写，
 * 没动到的卡片一个字节都不变（和手动拖卡片一样，只改那张卡的注释行或正文）。
 * 2026-11-21 起白板就是这篇文档（## 是列、一段是一张卡）：新写法交给 doc-board-ops.ts；
 * 下面这些只管以前的写法（导图白板、撤回了转写法的旧白板）。
 */
import * as docOps from './doc-board-ops'
import {
  appendBlock,
  attr,
  type BoardDoc,
  content,
  type Link,
  looseParagraphs,
  moveBlock,
  newBlock,
  newId,
  num,
  parseBoard,
  parseLinks,
  serializeBoard,
  withAttrs,
  withContent,
  withLinks,
  hasOldLayout,
  isMindmap,
} from '@cn/format'

/** 这篇是新写法的白板（白板就是这篇文档） */
const docBoard = (text: string) => !isMindmap(text) && !hasOldLayout(text)

export const CARD_W = 280
export const COL_W = 300
const GAP = 24
const ORIGIN = 80

export interface Size {
  w: number
  h: number
}

export interface BoardSummary {
  cards: { id: string; text: string; x?: number; y?: number; w?: number; column?: string; color?: string }[]
  columns: { id: string; title: string; x: number; y: number; w: number; cards: string[]; fixed?: true }[]
  links: Link[]
  /** 还没放进卡片的段落（「未整理」） */
  loose: string[]
}

export function summarize(text: string): BoardSummary {
  if (docBoard(text)) return docOps.summarize(text)
  const doc = parseBoard(text)
  const out: BoardSummary = { cards: [], columns: [], links: parseLinks(doc), loose: looseParagraphs(doc).map((l) => l.text) }
  for (const b of doc.blocks) {
    const id = attr(b, 'id')
    if (!id) continue
    if (b.kind === 'column') {
      out.columns.push({ id, title: attr(b, 'title') ?? '', x: num(b, 'x', 0), y: num(b, 'y', 0), w: num(b, 'w', COL_W), cards: [] })
      continue
    }
    const column = attr(b, 'in')
    const card: BoardSummary['cards'][number] = { id, text: content(b) }
    if (column) card.column = column
    else Object.assign(card, { x: num(b, 'x', 0), y: num(b, 'y', 0), w: num(b, 'w', CARD_W) })
    const color = attr(b, 'color')
    if (color) card.color = color
    out.cards.push(card)
  }
  for (const c of out.cards) if (c.column) out.columns.find((col) => col.id === c.column)?.cards.push(c.id)
  return out
}

/** 量不到（白板没在屏幕上）时按字数估卡片高度：正文 13px、行高 1.65、内边距 14 */
export function estimateHeight(body: string, w: number): number {
  const inner = Math.max(80, w - 32)
  let lines = 0
  for (const line of body.split('\n')) {
    if (line.trim() === '') continue
    let width = 0
    for (const ch of line) width += /[⺀-￿]/.test(ch) ? 13 : 7
    lines += Math.max(1, Math.ceil(width / inner))
  }
  return Math.round(28 + Math.max(1, lines) * 21.5)
}

function index(doc: BoardDoc, id: string): number {
  const i = doc.blocks.findIndex((b) => attr(b, 'id') === id)
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  if (i === -1) throw new Error(`白板上没有 id 是 ${id} 的卡片或列`)
  return i
}

/** 顶层的东西（不在列里的卡片和列）的大小：量到的优先，量不到就估 */
function sizeOf(doc: BoardDoc, id: string, sizes: Record<string, Size>): Size {
  const b = doc.blocks[index(doc, id)]!
  const measured = sizes[id]
  if (measured) return measured
  if (b.kind === 'card') {
    const w = num(b, 'w', CARD_W)
    return { w, h: estimateHeight(content(b), w) }
  }
  const w = num(b, 'w', COL_W)
  const inner = doc.blocks.filter((x) => attr(x, 'in') === id)
  const h = 52 + inner.reduce((s, x) => s + (sizes[attr(x, 'id') ?? '']?.h ?? estimateHeight(content(x), w - 24)) + 8, 0) + 12
  return { w, h }
}

function topLevel(doc: BoardDoc): string[] {
  return doc.blocks.filter((b) => attr(b, 'id') && !attr(b, 'in')).map((b) => attr(b, 'id')!)
}

/** 新东西放在已有内容的下面，和最左边对齐 */
function nextSpot(doc: BoardDoc, sizes: Record<string, Size>): { x: number; y: number } {
  const ids = topLevel(doc)
  if (!ids.length) return { x: ORIGIN, y: ORIGIN }
  let minX = Infinity
  let bottom = 0
  for (const id of ids) {
    const b = doc.blocks[index(doc, id)]!
    minX = Math.min(minX, num(b, 'x', 0))
    bottom = Math.max(bottom, num(b, 'y', 0) + sizeOf(doc, id, sizes).h)
  }
  return { x: minX, y: bottom + GAP }
}

export interface NewCard {
  text: string
  x?: number
  y?: number
  w?: number
  column?: string
  color?: string
}

export function addCard(text: string, card: NewCard, sizes: Record<string, Size> = {}): { text: string; id: string } {
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  if (!card.text.trim()) throw new Error('卡片内容是空的')
  if (docBoard(text)) return docOps.addCard(text, card)
  const doc = parseBoard(text)
  const id = newId(doc)
  if (card.column) {
    const col = doc.blocks[index(doc, card.column)]!
    // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
    if (col.kind !== 'column') throw new Error(`${card.column} 不是列`)
    const attrs: Record<string, string> = { id, in: card.column }
    if (card.color) attrs.color = card.color
    const next = appendBlock(doc, newBlock('card', attrs, card.text))
    // 挪到列里最后一张卡的后面
    const members = next.blocks.map((b, j) => ({ b, j })).filter(({ b }) => attr(b, 'in') === card.column && attr(b, 'id') !== id)
    const target = members.length ? members[members.length - 1]!.j + 1 : index(next, card.column) + 1
    return { text: serializeBoard(moveBlock(next, next.blocks.length - 1, target)), id }
  }
  const spot = card.x !== undefined && card.y !== undefined ? { x: card.x, y: card.y } : nextSpot(doc, sizes)
  const attrs: Record<string, string | number> = { id, x: Math.round(spot.x), y: Math.round(spot.y), w: Math.round(card.w ?? CARD_W) }
  if (card.color) attrs.color = card.color
  return { text: serializeBoard(appendBlock(doc, newBlock('card', attrs, card.text))), id }
}

export function addColumn(text: string, col: { title: string; x?: number; y?: number }, sizes: Record<string, Size> = {}): { text: string; id: string } {
  if (docBoard(text)) return docOps.addColumn(text, col)
  const doc = parseBoard(text)
  const id = newId(doc)
  const spot = col.x !== undefined && col.y !== undefined ? { x: col.x, y: col.y } : nextSpot(doc, sizes)
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  const attrs = { id, x: Math.round(spot.x), y: Math.round(spot.y), w: COL_W, title: col.title.trim() || '新的列' }
  return { text: serializeBoard(appendBlock(doc, newBlock('column', attrs))), id }
}

export function setCardText(text: string, id: string, body: string): string {
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  if (!body.trim()) throw new Error('卡片内容是空的；要删卡片请让用户自己删')
  if (docBoard(text)) return docOps.setCardText(text, id, body)
  const doc = parseBoard(text)
  const i = index(doc, id)
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  if (doc.blocks[i]!.kind !== 'card') throw new Error(`${id} 是列，不是卡片`)
  return serializeBoard({ ...doc, blocks: doc.blocks.map((b, j) => (j === i ? withContent(b, body) : b)) })
}

/** 挪到画布上的 (x, y)；在列里的卡片会从列里拿出来 */
export function moveTo(text: string, id: string, x: number, y: number): string {
  if (docBoard(text)) return docOps.moveTo(text, id, x, y)
  const doc = parseBoard(text)
  const i = index(doc, id)
  const b = doc.blocks[i]!
  const changes: Record<string, string | number | undefined> = { x: Math.round(x), y: Math.round(y) }
  if (b.kind === 'card' && attr(b, 'in')) Object.assign(changes, { in: undefined, w: CARD_W })
  return serializeBoard({ ...doc, blocks: doc.blocks.map((x2, j) => (j === i ? withAttrs(x2, changes) : x2)) })
}

/** 放进列：position 从 0 数，不给就放最后 */
export function putInColumn(text: string, id: string, column: string, position?: number): string {
  if (docBoard(text)) return docOps.putInColumn(text, id, column, position)
  const doc = parseBoard(text)
  const i = index(doc, id)
  const b = doc.blocks[i]!
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  if (b.kind !== 'card') throw new Error(`${id} 不是卡片`)
  const col = doc.blocks[index(doc, column)]!
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  if (col.kind !== 'column') throw new Error(`${column} 不是列`)
  const updated = withAttrs(b, { in: column, x: undefined, y: undefined, w: undefined })
  const next = { ...doc, blocks: doc.blocks.map((x, j) => (j === i ? updated : x)) }
  const members = next.blocks.map((x, j) => ({ x, j })).filter(({ x }) => attr(x, 'in') === column && attr(x, 'id') !== id)
  const at = position === undefined ? members.length : Math.max(0, Math.min(members.length, Math.floor(position)))
  const target = at < members.length ? members[at]!.j : members.length ? members[members.length - 1]!.j + 1 : index(next, column) + 1
  return serializeBoard(moveBlock(next, i, target))
}

export function link(text: string, from: string, to: string): string {
  if (docBoard(text)) return docOps.link(text, from, to)
  const doc = parseBoard(text)
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  for (const id of [from, to]) if (doc.blocks[index(doc, id)]!.kind !== 'card') throw new Error(`${id} 不是卡片，只有卡片之间能连线`)
  // 不翻：回给 AI 的工具结果（新的列是写进文件的列名）
  if (from === to) throw new Error('不能自己连自己')
  const links = parseLinks(doc)
  if (links.some((l) => l.from === from && l.to === to)) return text
  return serializeBoard(withLinks(doc, [...links, { from, to }]))
}

export type ArrangeMode = 'grid' | 'columns'

/**
 * 排整齐：画布上的卡片和列按现在的阅读顺序（从上到下、从左到右）重新摆。
 * - grid：一行 n 个，每行一样高（取这一行最高的），列宽取最宽的那个
 * - columns：n 竖排，下一个放进最矮的那一竖（像瀑布流）
 * 列里的卡片跟着列走，不单独动。
 */
export function arrange(text: string, mode: ArrangeMode, opts: { per?: number; sizes?: Record<string, Size> } = {}): string {
  if (docBoard(text)) return docOps.arrange(text, mode, opts)
  let out = text
  for (const s of arrangeSteps(text, mode, opts)) out = placeAt(out, s.id, s.x, s.y)
  return out
}

/** 只改一张卡（或一列）的坐标；列里的卡跟着列走，不单独动 */
export function placeAt(text: string, id: string, x: number, y: number): string {
  if (docBoard(text)) return docOps.placeAt(text, id, x, y)
  const doc = parseBoard(text)
  const i = index(doc, id)
  return serializeBoard({ ...doc, blocks: doc.blocks.map((b, j) => (j === i ? withAttrs(b, { x: Math.round(x), y: Math.round(y) }) : b)) })
}

/**
 * 排整齐要挪的每一样，按阅读顺序：AI 动手时一张一张挪（指针先去拿、那张外圈亮一下，DESIGN.v3 2.3），
 * 停下时已经挪了的留着；位置没变的不算一步
 */
export function arrangeSteps(text: string, mode: ArrangeMode, opts: { per?: number; sizes?: Record<string, Size> } = {}): { id: string; x: number; y: number }[] {
  if (docBoard(text)) return docOps.arrangeSteps(text, mode, opts)
  const doc = parseBoard(text)
  const sizes = opts.sizes ?? {}
  const ids = topLevel(doc)
  if (!ids.length) return []
  const pos = new Map(ids.map((id) => [id, { x: num(doc.blocks[index(doc, id)]!, 'x', 0), y: num(doc.blocks[index(doc, id)]!, 'y', 0) }]))
  // 阅读顺序：上下差不到 40px 的算同一行
  const order = [...ids].sort((a, b) => {
    const pa = pos.get(a)!
    const pb = pos.get(b)!
    return Math.abs(pa.y - pb.y) < 40 ? pa.x - pb.x : pa.y - pb.y
  })
  const origin = { x: Math.max(0, Math.min(...[...pos.values()].map((p) => p.x))), y: Math.max(0, Math.min(...[...pos.values()].map((p) => p.y))) }
  const size = new Map(order.map((id) => [id, sizeOf(doc, id, sizes)]))
  const cellW = Math.max(...[...size.values()].map((s) => s.w))
  const per = Math.max(1, Math.min(8, Math.floor(opts.per ?? (mode === 'grid' ? Math.ceil(Math.sqrt(order.length)) : Math.min(3, order.length)))))
  const placed = new Map<string, { x: number; y: number }>()
  if (mode === 'grid') {
    let y = origin.y
    for (let r = 0; r * per < order.length; r++) {
      const row = order.slice(r * per, r * per + per)
      row.forEach((id, c) => placed.set(id, { x: origin.x + c * (cellW + GAP), y }))
      y += Math.max(...row.map((id) => size.get(id)!.h)) + GAP
    }
  } else {
    const heights = new Array<number>(per).fill(origin.y)
    for (const id of order) {
      const c = heights.indexOf(Math.min(...heights))
      placed.set(id, { x: origin.x + c * (cellW + GAP), y: heights[c]! })
      heights[c] = heights[c]! + size.get(id)!.h + GAP
    }
  }
  return order
    .map((id) => ({ id, x: Math.round(placed.get(id)!.x), y: Math.round(placed.get(id)!.y) }))
    .filter((s) => {
      const b = doc.blocks[index(doc, s.id)]!
      return attr(b, 'x') !== String(s.x) || attr(b, 'y') !== String(s.y)
    })
}
