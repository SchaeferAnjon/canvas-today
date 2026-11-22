/**
 * 导图白板：frontmatter 里 `白板样式: 导图` 的白板。导图本身就是正文里的一段嵌套列表，打开文档就是大纲：
 *
 *   - 线性映射 <!-- box=0.36,0.42,0.26,0.12 -->
 *     - 定义
 *       - T(u+v)=T(u)+T(v)
 *     - 核与像
 *       - 秩-零化渡定理 <!-- box=0.6,0.8,0.2,0.06 unsure guesses="秩-零化度定理|秩-零化渡定理" -->
 *
 * 行尾的 HTML 注释是 AI 认照片时记的：这个节点在照片上的哪一块（x y w h，都是 0 到 1）、拿不准、猜的几种写法。
 * 别的软件看不见注释，内容不丢。
 * 规矩：读进来再写回去一个字节都不变；改一个节点只重写它自己那一行（挪层级时连它的子节点一起）。
 */
import { fmValue } from './board'

export type Box = [number, number, number, number]

export interface MapNode {
  text: string
  box?: Box
  unsure?: boolean
  guesses?: string[]
  children: MapNode[]
  /** 读进来时这一项的原文（含续行，不含后面的空行）；内容和层级都没变就原样写回 */
  raw?: string
  /** raw 对应的内容签名 */
  sig?: string
  /** 这一项后面跟着的空行（每行带换行） */
  tail?: string
}

export interface MapDoc {
  /** 列表前面的原文 */
  before: string
  roots: MapNode[]
  /** 列表后面的原文 */
  after: string
  /** 缩进一层用什么（读文件里的，没有就两个空格） */
  unit: string
  /** 原来就有列表（没有的话写的时候和前后隔开） */
  found: boolean
}

export const MAP_STYLE_KEY = '白板样式'
export const MAP_STYLE = '导图'

export const isMindmap = (text: string) => fmValue(text, MAP_STYLE_KEY) === MAP_STYLE

const FM = /^---\n[\s\S]*?\n---(?:\n|$)/
const ITEM = /^([ \t]*)[-*+][ \t]+(.*)$/
const NOTE = /[ \t]*<!--[ \t]*(.*?)[ \t]*-->[ \t]*$/
const ATTR = /([A-Za-z][\w-]*)(?:=(?:"([^"]*)"|(\S+)))?/g

const width = (ws: string) => [...ws].reduce((n, c) => n + (c === '\t' ? 4 : 1), 0)

/** 行尾注释里的 box / unsure / guesses；有别的东西就不当我们的注释 */
function parseNote(s: string): Pick<MapNode, 'box' | 'unsure' | 'guesses'> | null {
  const out: Pick<MapNode, 'box' | 'unsure' | 'guesses'> = {}
  let left = s
  for (const m of s.matchAll(ATTR)) {
    const [all, key, q, bare] = m
    const v = q ?? bare
    if (key === 'unsure' && v === undefined) out.unsure = true
    else if (key === 'box' && v !== undefined) {
      const n = v.split(',').map(Number)
      if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null
      out.box = n as Box
    } else if (key === 'guesses' && v !== undefined) out.guesses = v.split('|').filter(Boolean)
    else return null
    left = left.replace(all!, '')
  }
  return left.trim() === '' ? out : null
}

function noteOf(n: MapNode): string {
  const parts: string[] = []
  if (n.box) parts.push(`box=${n.box.map((x) => +x.toFixed(3)).join(',')}`)
  if (n.unsure) parts.push('unsure')
  if (n.guesses?.length) parts.push(`guesses="${n.guesses.map((g) => g.replace(/["|]/g, ' ')).join('|')}"`)
  return parts.length ? ` <!-- ${parts.join(' ')} -->` : ''
}

const sigOf = (n: MapNode, depth: number) => JSON.stringify([depth, n.text, n.box ?? null, !!n.unsure, n.guesses ?? []])

/** 节点的字：去掉换行，免得一个节点写成好几行 */
export const cleanText = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

function itemContent(rest: string): Pick<MapNode, 'text' | 'box' | 'unsure' | 'guesses'> {
  const m = NOTE.exec(rest)
  const note = m ? parseNote(m[1]!) : null
  if (m && note) return { text: rest.slice(0, m.index).trim(), ...note }
  return { text: rest.trim() }
}

/** 白板的排版块（卡片、列）从哪开始：导图只在它前面找 */
const BLOCK = /^<!--\s*(card|column)\b[^\n]*-->[ \t]*$/m

/**
 * 找正文里（白板卡片之前）第一段从行首开始的列表，读成一棵（或几棵）树。
 * 没有列表时 roots 是空的：before 是列表该插进去的位置之前，after 是之后。
 */
export function parseMindmap(text: string): MapDoc {
  const fm = FM.exec(text)?.[0] ?? ''
  const blockAt = BLOCK.exec(text.slice(fm.length))
  const headEnd = fm.length + (blockAt ? blockAt.index : text.length - fm.length)
  const lines = text.slice(fm.length, headEnd).split('\n')
  const starts: number[] = []
  let pos = fm.length
  for (const l of lines) {
    starts.push(pos)
    pos += l.length + 1
  }
  const first = lines.findIndex((l) => /^[-*+][ \t]+\S/.test(l))
  if (first === -1) {
    // 插在卡片前面（没有卡片就是结尾）
    return { before: text.slice(0, headEnd), roots: [], after: text.slice(headEnd), unit: '  ', found: false }
  }

  // 列表到哪为止：列表项、缩进的续行；中间的空行只有后面还是列表时才算
  let last = first
  for (let i = first; i < lines.length; i++) {
    const l = lines[i]!
    if (ITEM.test(l) || /^[ \t]+\S/.test(l)) last = i
    else if (l.trim() !== '') break
  }

  type Open = { node: MapNode; indent: number }
  const roots: MapNode[] = []
  const stack: Open[] = []
  let unit = ''
  let cur: { node: MapNode; depth: number; rawLines: string[]; blanks: string[] } | null = null
  const flush = () => {
    if (!cur) return
    cur.node.raw = cur.rawLines.join('\n')
    cur.node.tail = cur.blanks.map((b) => b + '\n').join('')
    cur.node.sig = sigOf(cur.node, cur.depth)
    cur = null
  }
  for (let i = first; i <= last; i++) {
    const l = lines[i]!
    const m = ITEM.exec(l)
    if (!m) {
      if (!cur) continue
      if (l.trim() === '') cur.blanks.push(l)
      else {
        // 续行：并进这一项的字（改了它才会写成一行）
        cur.rawLines.push(...cur.blanks, l)
        cur.blanks = []
        cur.node.text = cleanText(cur.node.text + ' ' + l.trim())
      }
      continue
    }
    flush()
    const indent = width(m[1]!)
    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop()
    if (indent > 0 && !unit) unit = m[1]!
    const node: MapNode = { ...itemContent(m[2]!), children: [] }
    if (stack.length) stack[stack.length - 1]!.node.children.push(node)
    else roots.push(node)
    cur = { node, depth: stack.length, rawLines: [l], blanks: [] }
    stack.push({ node, indent })
  }
  flush()
  const listEnd = starts[last]! + lines[last]!.length
  return { before: text.slice(0, starts[first]!), roots, after: text.slice(listEnd), unit: unit || '  ', found: true }
}

export function serializeMindmap(doc: MapDoc): string {
  const parts: string[] = []
  const walk = (list: MapNode[], depth: number) => {
    for (const n of list) {
      const same = n.raw !== undefined && n.sig === sigOf(n, depth)
      parts.push(same ? n.raw! : `${doc.unit.repeat(depth)}- ${cleanText(n.text)}${noteOf(n)}`)
      if (n.tail) parts.push(n.tail.slice(0, -1))
      walk(n.children, depth + 1)
    }
  }
  walk(doc.roots, 0)
  // 删到最后一项后面不能再留空行（空行原来是夹在两项中间的）
  while (parts.length && parts[parts.length - 1]!.trim() === '') parts.pop()
  if (!parts.length) return doc.before + doc.after.replace(/^\n/, '')
  const list = parts.join('\n')
  if (doc.found) return doc.before + list + doc.after
  // 原来没有列表、插进去的：和前后隔一个空行
  const before = doc.before === '' || doc.before.endsWith('\n\n') || /^---\n[\s\S]*?\n---\n$/.test(doc.before) ? doc.before : doc.before.replace(/\n?$/, '\n\n')
  const after = doc.after.startsWith('\n') ? doc.after : doc.after === '' ? '\n' : '\n\n' + doc.after
  return before + list + after
}

/** 换掉正文里的导图列表，别的原样 */
export function withMindmap(text: string, roots: MapNode[]): string {
  const doc = parseMindmap(text)
  return serializeMindmap({ ...doc, roots })
}

// ---------- 改树：路径是一串下标，[0] 是第一棵树的根，[0, 2] 是它的第三个孩子 ----------

export type MapPath = number[]

export const pathKey = (p: MapPath) => p.join('.')
export const keyPath = (k: string): MapPath => (k === '' ? [] : k.split('.').map(Number))

export function nodeAt(roots: MapNode[], path: MapPath): MapNode | undefined {
  let list = roots
  let n: MapNode | undefined
  for (const i of path) {
    n = list[i]
    if (!n) return undefined
    list = n.children
  }
  return n
}

/** 改一个节点（不可变：路径上的节点复制一份，别的照旧共用） */
export function updateAt(roots: MapNode[], path: MapPath, f: (n: MapNode) => MapNode): MapNode[] {
  if (!path.length) return roots
  const [i, ...rest] = path
  return roots.map((n, j) => (j !== i ? n : rest.length ? { ...n, children: updateAt(n.children, rest, f) } : f(n)))
}

/** 在 parent 的孩子里第 index 个位置插一个（parent 是 [] 时插在最外层） */
export function insertAt(roots: MapNode[], parent: MapPath, index: number, node: MapNode): MapNode[] {
  const put = (list: MapNode[]): MapNode[] => {
    // 插在一组的最后：上一项后面原来隔着的空行（隔开下一组的）挪到新的这项后面
    const prev = index === list.length && index > 0 ? lastOf(list[index - 1]!) : null
    if (!prev?.node.tail) return [...list.slice(0, index), node, ...list.slice(index)]
    const tail = prev.node.tail
    const cleared = replaceLast(list[index - 1]!, prev.path, (n) => ({ ...n, tail: '' }))
    return [...list.slice(0, index - 1), cleared, { ...node, tail }]
  }
  if (!parent.length) return put(roots)
  return updateAt(roots, parent, (p) => ({ ...p, children: put(p.children) }))
}

/** 一枝最后（最深的最后一个）那个节点和它在这枝里的路径 */
function lastOf(n: MapNode, path: MapPath = []): { node: MapNode; path: MapPath } {
  return n.children.length ? lastOf(n.children[n.children.length - 1]!, [...path, n.children.length - 1]) : { node: n, path }
}

function replaceLast(n: MapNode, path: MapPath, f: (n: MapNode) => MapNode): MapNode {
  return path.length ? { ...n, children: updateAt(n.children, path, f) } : f(n)
}

export function removeAt(roots: MapNode[], path: MapPath): MapNode[] {
  const parent = path.slice(0, -1)
  const i = path[path.length - 1]!
  if (!parent.length) return roots.filter((_, j) => j !== i)
  return updateAt(roots, parent, (p) => ({ ...p, children: p.children.filter((_, j) => j !== i) }))
}

export const newNode = (text: string): MapNode => ({ text, children: [] })

/** 改字：改过的字就不再是「拿不准」 */
export function setText(roots: MapNode[], path: MapPath, text: string): MapNode[] {
  return updateAt(roots, path, (n) => ({ ...n, text: cleanText(text), unsure: undefined, guesses: undefined }))
}

/** 把 from 挪到 toParent 的孩子里（index 不给就放最后）；不能挪进自己下面 */
export function moveTo(roots: MapNode[], from: MapPath, toParent: MapPath, index?: number): { roots: MapNode[]; path: MapPath } | null {
  if (toParent.length >= from.length && from.every((x, i) => toParent[i] === x)) return null
  const node = nodeAt(roots, from)
  if (!node) return null
  // 先删再插：删掉后，toParent 里排在被删节点后面的下标要减一
  const fixed = [...toParent]
  const depth = from.length - 1
  if (fixed.length > depth && fixed.slice(0, depth).every((x, i) => x === from[i]) && fixed[depth]! > from[depth]!) fixed[depth]!--
  const removed = removeAt(roots, from)
  const siblings = fixed.length ? nodeAt(removed, fixed)?.children : removed
  if (!siblings) return null
  const at = Math.min(index ?? siblings.length, siblings.length)
  return { roots: insertAt(removed, fixed, at, node), path: [...fixed, at] }
}

/** 一层一层（中心 → 第一层 → 第二层）的顺序，长出来的动画按它 */
export function breadthFirst(roots: MapNode[]): MapPath[] {
  const out: MapPath[] = []
  let level: MapPath[] = roots.map((_, i) => [i])
  while (level.length) {
    out.push(...level)
    level = level.flatMap((p) => nodeAt(roots, p)!.children.map((_, i) => [...p, i]))
  }
  return out
}

export function countNodes(roots: MapNode[]): { all: number; unsure: number } {
  let all = 0
  let unsure = 0
  const walk = (l: MapNode[]) =>
    l.forEach((n) => {
      all++
      if (n.unsure) unsure++
      walk(n.children)
    })
  walk(roots)
  return { all, unsure }
}

/** 新建一份导图时的列表原文 */
export function mindmapList(roots: MapNode[], unit = '  '): string {
  return serializeMindmap({ before: '', roots: strip(roots), after: '', unit, found: false })
}

function strip(list: MapNode[]): MapNode[] {
  return list.map(({ raw: _r, sig: _s, tail: _t, ...n }) => ({ ...n, children: strip(n.children) }))
}
