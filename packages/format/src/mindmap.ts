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
 * 收起的节点在同一个注释里多一个 fold（`- 定义 <!-- box=… fold -->`；没注释的行加 `<!-- fold -->`，task-wuv05）：
 * 换台 Mac、以后 iPad 上打开也收着（偏好「要跨设备的状态跟着库走」）；展开时去掉，这一行回到原样。
 * 布局记在属性里一行 `导图布局: 左右` / `向下`，紧跟在「白板样式: 导图」后面；向右是默认，不写。
 * 别的软件看不见注释，内容不丢。
 * 规矩：读进来再写回去一个字节都不变；改一个节点只重写它自己那一行；换了层级的整枝只改缩进，收起展开只在注释里加减 fold。
 */
import { fmValue } from './board'
import { prop, setProp } from './props'

export type Box = [number, number, number, number]

export interface MapNode {
  text: string
  box?: Box
  unsure?: boolean
  guesses?: string[]
  /** 收起来了：孩子不画，旁边写藏了几个（写在行尾注释里，关了再开还收着） */
  fold?: boolean
  children: MapNode[]
  /** 读进来时这一项的原文（含续行，不含后面的空行）；内容没变就原样写回（换了层级只改缩进） */
  raw?: string
  /** raw 对应的内容签名（字、框、拿不准、猜的写法；不含层级和收起） */
  sig?: string
  /** 读进来时在第几层 */
  rawDepth?: number
  /** 读进来时收没收着：只改了这一样时在原来那行的注释里加减一个 fold */
  rawFold?: boolean
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

// ---------- 布局：属性 `导图布局`（排法在 apps/notes/src/shared/mindmap-layout.ts 的分派表里，加新的布局两边各加一项） ----------

export type MapLayoutKind = 'right' | 'both' | 'down'
export const MAP_LAYOUT_KEY = '导图布局'
/** 写进文件的说法（不翻：是文件格式） */
export const MAP_LAYOUT_VALUE: Readonly<Record<MapLayoutKind, string>> = { right: '向右', both: '左右', down: '向下' }
export const MAP_LAYOUTS = Object.keys(MAP_LAYOUT_VALUE) as MapLayoutKind[]

/** 这块导图怎么摆：没写、写了不认识的（以后的鱼骨、时间线在老版本里打开）都当向右 */
export function mapLayoutOf(text: string): MapLayoutKind {
  const v = fmValue(text, MAP_LAYOUT_KEY)?.replace(/^["']|["']$/g, '')
  return MAP_LAYOUTS.find((k) => MAP_LAYOUT_VALUE[k] === v) ?? 'right'
}

/** 换布局只动那一行：新加的紧跟在「白板样式: 导图」后面；向右是默认，去掉那一行 */
export function withMapLayout(text: string, kind: MapLayoutKind): string {
  const value = kind === 'right' ? undefined : MAP_LAYOUT_VALUE[kind]
  if (value === undefined || prop(text, MAP_LAYOUT_KEY) !== undefined) return setProp(text, MAP_LAYOUT_KEY, value)
  const fm = FM.exec(text)?.[0] ?? ''
  const style = new RegExp(`^${MAP_STYLE_KEY}:[^\\n]*$`, 'm').exec(fm)
  if (!style) return setProp(text, MAP_LAYOUT_KEY, value)
  const at = style.index + style[0].length
  return `${text.slice(0, at)}\n${MAP_LAYOUT_KEY}: ${value}${text.slice(at)}`
}

const FM = /^---\n[\s\S]*?\n---(?:\n|$)/
const ITEM = /^([ \t]*)[-*+][ \t]+(.*)$/
/** 行尾的注释：最后那一个（前面自己写的注释照旧是字） */
const NOTE = /[ \t]*<!--[ \t]*((?:(?!<!--).)*?)[ \t]*-->[ \t]*$/
const ATTR = /([A-Za-z][\w-]*)(?:=(?:"([^"]*)"|(\S+)))?/g

const width = (ws: string) => [...ws].reduce((n, c) => n + (c === '\t' ? 4 : 1), 0)

type Note = Pick<MapNode, 'box' | 'unsure' | 'guesses' | 'fold'>

/** 行尾注释里的 box / unsure / guesses / fold；有别的东西就不当我们的注释 */
function parseNote(s: string): Note | null {
  const out: Note = {}
  let left = s
  for (const m of s.matchAll(ATTR)) {
    const [all, key, q, bare] = m
    const v = q ?? bare
    if (key === 'unsure' && v === undefined) out.unsure = true
    else if (key === 'fold' && v === undefined) out.fold = true
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
  // 没孩子的收着没意思：整行重写时就不写了
  if (n.fold && n.children.length) parts.push('fold')
  return parts.length ? ` <!-- ${parts.join(' ')} -->` : ''
}

const sigOf = (n: MapNode) => JSON.stringify([n.text, n.box ?? null, !!n.unsure, n.guesses ?? []])

/** 节点的字：去掉换行，免得一个节点写成好几行 */
export const cleanText = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

function itemContent(rest: string): Pick<MapNode, 'text' | 'box' | 'unsure' | 'guesses' | 'fold'> {
  const m = NOTE.exec(rest)
  const note = m ? parseNote(m[1]!) : null
  if (m && note) return { text: rest.slice(0, m.index).trim(), ...note }
  return { text: rest.trim() }
}

const FOLD_NOTE = ' <!-- fold -->'

/** 原文第一行的注释里加上、去掉 fold（只动这一处，行里别的字节不动） */
function foldLine(line: string, fold: boolean): string {
  const m = NOTE.exec(line)
  const note = m ? parseNote(m[1]!) : null
  if (fold) {
    if (!m || !note) return line + FOLD_NOTE
    return note.fold ? line : line.replace(/([ \t]*-->[ \t]*)$/, ' fold$1')
  }
  if (!m || !note?.fold) return line
  if (line.endsWith(FOLD_NOTE)) return line.slice(0, -FOLD_NOTE.length)
  const content = m[1]!
  const left = dropFold(content)
  if (left === '') return line.slice(0, m.index)
  const at = line.lastIndexOf(content, line.lastIndexOf('-->'))
  return line.slice(0, at) + left + line.slice(at + content.length)
}

/** 注释里去掉 fold 这一个词和它旁边的一段空白 */
function dropFold(content: string): string {
  for (const t of content.matchAll(ATTR)) {
    if (t[0] !== 'fold') continue
    let a = t.index
    let b = a + t[0].length
    if (a > 0) while (a > 0 && /[ \t]/.test(content[a - 1]!)) a--
    else while (b < content.length && /[ \t]/.test(content[b]!)) b++
    return content.slice(0, a) + content.slice(b)
  }
  return content
}

/** 原文换一层缩进：第一行的缩进换成 indent，续行保持比它多出来的那一截（至少缩进两格，读回来还是续行） */
function reindent(raw: string, indent: string): string {
  const lines = raw.split('\n')
  const base = /^[ \t]*/.exec(lines[0]!)![0]
  return lines
    .map((l, i) => {
      if (i === 0) return indent + l.slice(base.length)
      if (l.trim() === '') return l
      const body = l.startsWith(base) ? l.slice(base.length) : l.replace(/^[ \t]+/, '')
      return indent + (/^[ \t]/.test(body) ? body : '  ' + body)
    })
    .join('\n')
}

/** 一项写回去：内容没变用原文（收起变了在注释里加减 fold，层级变了只改缩进），变了整行重写 */
function lineOf(n: MapNode, depth: number, unit: string): string {
  if (n.raw === undefined || n.sig !== sigOf(n)) return `${unit.repeat(depth)}- ${cleanText(n.text)}${noteOf(n)}`
  let raw = n.raw
  if (!!n.fold !== !!n.rawFold) {
    const nl = raw.indexOf('\n')
    raw = nl === -1 ? foldLine(raw, !!n.fold) : foldLine(raw.slice(0, nl), !!n.fold) + raw.slice(nl)
  }
  if (n.rawDepth !== undefined && n.rawDepth !== depth) raw = reindent(raw, unit.repeat(depth))
  return raw
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
    cur.node.sig = sigOf(cur.node)
    cur.node.rawDepth = cur.depth
    cur.node.rawFold = !!cur.node.fold
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
      parts.push(lineOf(n, depth, doc.unit))
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

// ---------- 第一批（task-wuv05，设计页 15-思维导图）：加父主题、同级里挪、只删一个、拖到两个同级中间、收起 ----------

/** 同一层里往上（-1）、往下（1）挪一个；到头了、最外层的中心不挪 */
export function moveAmong(roots: MapNode[], path: MapPath, delta: -1 | 1): { roots: MapNode[]; path: MapPath } | null {
  if (path.length < 2) return null
  const parent = path.slice(0, -1)
  const i = path[path.length - 1]!
  const n = nodeAt(roots, parent)?.children.length ?? 0
  if (i + delta < 0 || i + delta >= n) return null
  return moveTo(roots, path, parent, i + delta)
}

/** 拖到 target 前面（after 是后面）：同一层换位置，或者换到 target 的上级下面；不能拖到自己下面 */
export function moveBeside(roots: MapNode[], from: MapPath, target: MapPath, after: boolean): { roots: MapNode[]; path: MapPath } | null {
  if (target.length < 2 || (target.length >= from.length && from.every((x, i) => target[i] === x))) return null
  const parent = target.slice(0, -1)
  let index = target[target.length - 1]! + (after ? 1 : 0)
  // 同一列里从前面挪到后面：自己先拿走了，后面的都往前挪了一个
  if (from.length === target.length && from.slice(0, -1).every((x, i) => x === parent[i]) && from[from.length - 1]! < index) index--
  return moveTo(roots, from, parent, index)
}

/** 加父主题：在这一个外面套一个新的，它（连同下面的）往里一层；中心外面不套 */
export function addParent(roots: MapNode[], path: MapPath, text: string): { roots: MapNode[]; path: MapPath } | null {
  if (path.length < 2) return null
  const node = nodeAt(roots, path)
  if (!node) return null
  return { roots: updateAt(roots, path, () => ({ text: cleanText(text), children: [node] })), path }
}

/** 只删这一个：它下面的往上提一层，排在它原来的位置 */
export function removeOne(roots: MapNode[], path: MapPath): MapNode[] {
  const node = nodeAt(roots, path)
  if (!node) return roots
  const parent = path.slice(0, -1)
  const i = path[path.length - 1]!
  const put = (list: MapNode[]) => [...list.slice(0, i), ...node.children, ...list.slice(i + 1)]
  if (!parent.length) return put(roots)
  return updateAt(roots, parent, (p) => ({ ...p, children: put(p.children) }))
}

/** 收起、展开一个（没有孩子的不收） */
export function setFold(roots: MapNode[], path: MapPath, fold: boolean): MapNode[] {
  return updateAt(roots, path, (n) => (fold && !n.children.length ? n : { ...n, fold }))
}

const mapFold = (list: MapNode[], f: (n: MapNode, depth: number) => boolean, depth = 0): MapNode[] =>
  list.map((n) => ({ ...n, fold: f(n, depth), children: mapFold(n.children, f, depth + 1) }))

/** 收起到第一层：第一层往下有孩子的都收起（中心不收） */
export const foldAll = (roots: MapNode[]): MapNode[] => mapFold(roots, (n, d) => (d >= 1 && n.children.length > 0 ? true : !!n.fold))

/** 全部展开 */
export const unfoldAll = (roots: MapNode[]): MapNode[] => mapFold(roots, () => false)

/** 还有没收起来的（第一层往下、有孩子的）：⇧⌘/ 按一下收起，都收着时再按是全部展开 */
export function anyUnfolded(roots: MapNode[]): boolean {
  const walk = (list: MapNode[], depth: number): boolean => list.some((n) => (depth >= 1 && n.children.length > 0 && !n.fold) || walk(n.children, depth + 1))
  return walk(roots, 0)
}

/** 一枝里一共几个（不算它自己）：收起来时旁边写的数 */
export const hiddenCount = (n: MapNode): number => n.children.reduce((s, k) => s + 1 + hiddenCount(k), 0)

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
  return list.map(({ raw: _r, sig: _s, tail: _t, rawDepth: _d, rawFold: _f, ...n }) => ({ ...n, children: strip(n.children) }))
}
