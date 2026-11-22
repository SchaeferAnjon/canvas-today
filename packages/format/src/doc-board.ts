/**
 * 文档切到白板（方向 A「先按节摆、再自由」）：一篇普通文档（没有 type: board）怎么分卡、怎么摆，改了怎么写回。
 * 只读不写的 splitDoc 把文档切成列和卡；moveUnit / placeUnit / unplaceUnit / resetLayout 算出改好以后的整篇文字。
 * 不依赖 Electron（手机版也要用）。AI 整理白板也照这一套（DOC_BOARD_RULES）。
 *
 * 分卡规则：
 * 1. 开头的「# 标题」是这篇的名字，不成卡。
 * 2. 最高一级标题（一般是 ##）是列，列名就是标题；下一级（###）是列里一行小标题；再往下的标题并进后面那张卡。
 * 3. 第一节之前的段落放在最左一组，没有列头。
 * 4. 一块是一张卡：一段字、一整个列表、一个引用、一个代码块、一张表格、一个数据库、一张图……
 * 5. 冒号结尾的那句和后面那一块合成一张卡。
 * 6. 连着的几张图合成一张图集；视频后面紧跟的时刻挂在视频卡下面。
 * 7. 软件写的「问过 AI」整段（「## 第 3 页 · …」）是一张问答卡，不当列；连着几段合成一列「问过 AI」。
 * 8. 分隔线不成卡，是列里的一截空隙。
 *
 * 写回：切过去只看，一个字节不写。拖进别的列，文档里这段也挪进那一节；拖到空白处，这段前面多一行
 * `<!-- card id=… x=… y=… -->`（在文档里它只管后面这一张卡），正文顺序不变；「摆回原样」去掉这些位置行。
 * 2026-11-21 起所有白板（type: board 也是）都是这一套（方向 A「一份文字两种看法」）：
 * - 只记编号的一行 `<!-- card id=a2 -->`：列里的卡是连线的一头、或者是 AI 总结的（ai=日期）时留着，卡不离开列；
 * - 列也能摆在自己的位置：标题前面一行 `<!-- column id=c1 x=… y=… -->`（旧白板转过来的，board-convert.ts）；
 * - 一段字下一行紧跟着（中间没空行）的列表、引文、代码和它一张卡（`**待办**` 下面的待办）。
 */
import { contentBlocks, type MdBlock } from './blocks'
import { findMath } from './math'
import { type TextChange, textChanges } from './merge'

/**
 * 卡的种类。math：$$ 公式（连着的几段合成一张）；embed：单独一行的 ![[…]]（PDF 页、嵌入的笔记、整页剪藏、图）；
 * link：单独一行的 [[…]]（白板、HTML、别的笔记），白板上画成卡，不露写法
 */
export type UnitKind =
  | 'text'
  | 'list'
  | 'todo'
  | 'quote'
  | 'callout'
  | 'code'
  | 'table'
  | 'base'
  | 'image'
  | 'images'
  | 'video'
  | 'moment'
  | 'ask'
  | 'details'
  | 'html'
  | 'math'
  | 'embed'
  | 'link'
  | 'gap'

export interface DocUnit {
  kind: UnitKind
  /** 这张卡在文档里的范围（不含前面的位置行） */
  from: number
  to: number
  text: string
  /** 卡上面的一行灰色小标题（这一列里的 ###） */
  sub?: string
  /** text 开头这么多个字是写在正文前面的那一截（并进来的小标题、冒号结尾那句），后面才是定种类的那一块 */
  lead?: number
  /** 挂在视频卡下面的时刻 */
  moments?: DocUnit[]
  /** 拖到空白处的：位置行的范围和坐标 */
  place?: { id: string; x: number; y: number; from: number; to: number }
  /** 只记编号的那一行（连线的一头、AI 总结的卡）：卡还在列里 */
  tag?: { id: string; from: number; to: number }
  /** 位置行、编号行上别的属性（ai=日期、color=…） */
  attrs?: Record<string, string>
}

export interface DocColumn {
  /** 列名（标题那一行去掉 #）；开头那一组是 null；合成的问答列是「问过 AI」 */
  title: string | null
  /** 标题行的范围；开头那一组、问答列没有 */
  head: { from: number; to: number } | null
  /** 这一节在文档里的末尾（插到列尾时插在这里） */
  end: number
  /** 软件写的「问过 AI」合成的列：不能往里拖 */
  ask: boolean
  cards: DocUnit[]
  /** 摆在自己位置上的列：标题前面那一行 `<!-- column id=… x=… y=… -->` 的范围和坐标 */
  place?: { id: string; x: number; y: number; from: number; to: number }
}

export interface DocBoard {
  /** 开头的「# 标题」 */
  title: string | null
  columns: DocColumn[]
  /** 拖到空白处的卡；section：它在文档里属于哪一节 */
  placed: (DocUnit & { section: string | null })[]
  /** 一共几张卡（超长文档每列少摆几张） */
  total: number
  /** 列是几级标题（一般是 2，用「#」分节的文档是 1）；白板上新加的列用它 */
  level: number
}

const CARD_LINE = /^<!--\s*card\s+(.*?)\s*-->\s*$/
const COLUMN_LINE = /^<!--\s*column\s+(.*?)\s*-->\s*$/

/** 注释行里的 k=v（值可以带引号），按原来的顺序 */
export function lineAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of src.matchAll(/([A-Za-z][\w-]*)=(?:"([^"]*)"|(\S+))/g)) out[m[1]!] = m[2] ?? m[3]!
  return out
}

const num = (v: string | undefined) => (v !== undefined && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** 位置行、编号行上除了 id、x、y 以外的属性 */
function extraOf(a: Record<string, string>): Record<string, string> | undefined {
  const out = Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'id' && k !== 'x' && k !== 'y'))
  return Object.keys(out).length ? out : undefined
}

const attrText = (a: Record<string, string> | undefined) =>
  Object.entries(a ?? {})
    .map(([k, v]) => (/^[^\s"]+$/.test(v) ? ` ${k}=${v}` : ` ${k}="${v.replace(/"/g, "'")}"`))
    .join('')
/** 位置行 */
export const placeLine = (id: string, x: number, y: number, attrs?: Record<string, string>) => `<!-- card id=${id} x=${Math.round(x)} y=${Math.round(y)}${attrText(attrs)} -->`
/** 只记编号的一行 */
export const tagLine = (id: string, attrs?: Record<string, string>) => `<!-- card id=${id}${attrText(attrs)} -->`
/** 列的位置行 */
export const columnLine = (id: string, x: number, y: number) => `<!-- column id=${id} x=${Math.round(x)} y=${Math.round(y)} -->`
const ASK_HEAD = /^第\s*\d+\s*页\s*[·・]/
/**
 * 折叠块的开头（文档里的折叠块、白板卡片、AI 回答里的 md 都用它认），lines[i] 是 `<details>` 那一行。认这几种写法：
 * - `<details><summary>标题</summary>` 写在一行；
 * - `<details>` 一行、`<summary>标题</summary>` 下一行（GitHub、Obsidian 里常见），中间可以空几行；
 * - `<summary>` 写成好几行（`<summary>`、标题、`</summary>` 各一行，或者标题折了行）。
 * 标题里的换行和多余空白并成一个空格。lines：开头占几行（到 `</summary>` 那一行为止）
 */
export function detailsHead(lines: readonly string[], i: number): { title: string; open: boolean; lines: number } | null {
  const first = lines[i]
  if (first === undefined || !/^\s*<details(\s+open)?\s*>/i.test(first)) return null
  // </summary> 最多往下找 8 行
  for (let j = i; j < Math.min(lines.length, i + 8); j++) {
    if (!/<\/summary>/i.test(lines[j]!)) continue
    const head = lines.slice(i, j + 1).join('\n')
    const m = /^\s*<details(\s+open)?\s*>\s*<summary>([\s\S]*?)<\/summary>\s*$/i.exec(head)
    // 标题里不许有空行（空行后面是正文，不是标题）
    if (!m || /\n[ \t]*\n/.test(m[2]!)) return null
    return { title: m[2]!.replace(/\s+/g, ' ').trim(), open: !!m[1], lines: j - i + 1 }
  }
  return null
}
const DETAILS_CLOSE = /^\s*<\/details>\s*$/im

/** 紧跟在一段字下一行就算和它一张卡的块 */
const GLUE = new Set(['list', 'quote', 'code', 'table'])

/** 一段里只有单独成行的公式（$$…$$、\[…\]，认法同文档编辑器的 findMath） */
function mathOnly(t: string): boolean {
  const ms = findMath(t)
  let rest = t
  for (const m of [...ms].reverse()) rest = rest.slice(0, m.from) + rest.slice(m.to)
  return ms.length > 0 && ms.every((m) => m.block) && !rest.trim()
}
/** 单独一行的 ![[…]] 和 [[…]] */
const EMBED = /^!\[\[[^\]\n]+\]\]\s*$/
const LINK = /^\[\[[^\]\n]+\]\]\s*$/
/**
 * 引文下面隔一个空行、以「我的评价」「微信读书的想法：」开头的几段（文档里画成标签、从引文竖线拐一道弯钩连着，renderer/review.ts 同一个认法）：
 * 和引文一张卡。「微信读书的想法」要带冒号，「我的评价」不带也认
 */
const ATTACHED = /^(\*\*)?(我的评价|微信读书的想法)(\*\*)?([：:])?/
function attached(t: string): boolean {
  const m = ATTACHED.exec(t)
  return !!m && (m[2] === '我的评价' || !!m[4])
}

function kindOf(text: string, b: MdBlock): UnitKind {
  const t = text.trimStart()
  if (b.kind === 'hr') return 'gap'
  if (b.kind === 'code') return /^(```|~~~)base\b/.test(t) ? 'base' : 'code'
  if (b.kind === 'table') return 'table'
  if (b.kind === 'image') return 'image'
  if (b.kind === 'list') return b.list === 'task' ? 'todo' : 'list'
  // 书摘、引言写成提示块（> [!quote] [《书》 · 章](…)）：也是别人的字，和普通引文一样是素材卡
  if (b.kind === 'quote') return /^>\s*\[!(quote|cite)\]/i.test(t) ? 'quote' : /^>\s*\[!/.test(t) ? 'callout' : 'quote'
  if (b.kind === 'paragraph') {
    if (mathOnly(t)) return 'math'
    if (EMBED.test(t)) return 'embed'
    if (LINK.test(t)) return 'link'
  }
  if (/^<!--\s*video\b/.test(t)) return 'video'
  if (/^<!--\s*moment(-ask)?\b/.test(t)) return 'moment'
  if (/^<details\b/i.test(t)) return 'details'
  if (b.kind === 'html') return 'html'
  if (/^!\[[^\]]*\]\([^)]*\)\s*$/.test(t)) return 'image'
  return 'text'
}

/** 把文档切成列和卡（只读，纯函数） */
export function splitDoc(text: string): DocBoard {
  // 列表一项一块：连着的几项并成一整个列表（一张卡）
  const blocks: MdBlock[] = []
  const all = contentBlocks(text).filter((b) => b.kind !== 'frontmatter')
  // 从 from 这一行开始是不是折叠块的开头（<details> 和 <summary> 中间空了行时，md 把它们切成两块，按行认）
  const lines = text.split('\n')
  const lineStarts: number[] = []
  for (let p = 0, k = 0; k < lines.length; k++) (lineStarts.push(p), (p += lines[k]!.length + 1))
  const opensDetails = (from: number) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid]! <= from) lo = mid
      else hi = mid - 1
    }
    return detailsHead(lines, lo) !== null
  }
  for (let n = 0; n < all.length; n++) {
    const b = all[n]!
    // 折叠块：<details><summary> 那行到 </details> 是一整块（和文档里 fold-block 同一个认法），不配对的照普通块
    if (b.kind === 'html' && opensDetails(b.from) && !DETAILS_CLOSE.test(text.slice(b.from, b.to))) {
      // 里面套着的折叠块：数着开、关配对，外层到和它配对的那个 </details> 为止（以前碰到里面的开头就当不配对，外层的标签露出来）
      let c = -1
      let depth = 0
      for (let k = n + 1; k < all.length && c === -1; k++) {
        const t = text.slice(all[k]!.from, all[k]!.to)
        const opens = opensDetails(all[k]!.from)
        const closes = DETAILS_CLOSE.test(t)
        if (opens && closes) continue
        if (opens) depth++
        else if (closes) {
          if (depth === 0) c = k
          else depth--
        }
      }
      if (c !== -1) {
        // </details> 下一行紧贴着写的字（没空行）：md 里同属一个 HTML 块，文档里却画在折叠块外面；白板上也单独一张卡
        const close = all[c]!
        const m = /^[ \t]*<\/details>[ \t]*$/im.exec(text.slice(close.from, close.to))!
        const closeEnd = close.from + m.index + m[0].length
        blocks.push({ ...b, to: closeEnd })
        const rest = text.slice(closeEnd, close.to)
        if (rest.trim()) blocks.push({ kind: 'paragraph', from: closeEnd + rest.search(/\S/), to: close.to })
        n = c
        continue
      }
    }
    const prev = blocks[blocks.length - 1]
    // 视频卡、时刻块：注释那一行到空行为止是一整块（和文档里的视频块同一个认法）
    if (prev && prev.kind === 'html' && /^<!--\s*(video|moment)/.test(text.slice(prev.from, prev.to)) && !/\n[ \t]*\n/.test(text.slice(prev.to, b.from))) {
      blocks[blocks.length - 1] = { ...prev, to: b.to }
      continue
    }
    // 文档里 AI 讲解上开的旁支（`> [!side]` 挂在讲解下面，task-4edsc）：和那块讲解是一张卡，不单独成卡；拖卡时一起走
    if (prev && b.kind === 'quote' && prev.kind === 'quote' && /^\s*>\s*\[!side\]/i.test(text.slice(b.from, b.to)) && /^\s*>\s*\[!ai\]/i.test(text.slice(prev.from, prev.to))) {
      blocks[blocks.length - 1] = { ...prev, to: b.to }
      continue
    }
    if (prev && b.kind === 'list' && prev.kind === 'list') {
      blocks[blocks.length - 1] = { ...prev, to: b.to, list: prev.list === b.list ? prev.list : 'bullet' }
      continue
    }
    blocks.push(b)
  }
  const at = (b: MdBlock) => text.slice(b.from, b.to)
  const headLevel = (b: MdBlock) => (b.kind === 'heading' ? (b.level ?? /^(#+)/.exec(at(b))?.[1]!.length ?? 1) : 0)
  const headText = (b: MdBlock) => at(b).replace(/^#+\s*/, '').replace(/\s*#+\s*$/, '').trim()

  // 1. 开头的「# 标题」
  let i = 0
  let title: string | null = null
  const firstHead = blocks.findIndex((b) => b.kind === 'heading')
  const h1s = blocks.filter((b) => b.kind === 'heading' && headLevel(b) === 1).length
  // 只有一个「#」、又在最前面：它是名字；用「#」分节的文档（好几个 #）就拿 # 当列
  if (firstHead !== -1 && h1s === 1 && headLevel(blocks[firstHead]!) === 1 && blocks.slice(0, firstHead).every((b) => b.kind === 'html' && !CARD_LINE.test(at(b)))) {
    title = headText(blocks[firstHead]!)
    i = firstHead + 1
  }
  const rest = blocks.slice(i)
  const levels = rest.filter((b) => b.kind === 'heading').map(headLevel)
  const colLevel = levels.length ? Math.min(...levels) : 7

  // 2. 按列切段
  interface Sec {
    head: MdBlock | null
    body: MdBlock[]
    place?: DocColumn['place']
  }
  const secs: Sec[] = [{ head: null, body: [] }]
  for (let n = 0; n < rest.length; n++) {
    const b = rest[n]!
    // 列的位置行：紧挨着下面那个列标题，算那一列的
    const cl = b.kind === 'html' ? COLUMN_LINE.exec(at(b)) : null
    const nx = rest[n + 1]
    if (cl && nx?.kind === 'heading' && headLevel(nx) === colLevel) {
      const a = lineAttrs(cl[1]!)
      const x = num(a.x)
      const y = num(a.y)
      if (x !== null && y !== null) {
        secs.push({ head: nx, body: [], place: { id: a.id ?? '', x, y, from: b.from, to: b.to } })
        n++
        continue
      }
    }
    if (b.kind === 'heading' && headLevel(b) === colLevel) secs.push({ head: b, body: [] })
    else secs[secs.length - 1]!.body.push(b)
  }
  if (!secs[0]!.body.length) secs.shift()

  const columns: DocColumn[] = []
  const placed: DocBoard['placed'] = []
  let total = 0
  for (const s of secs) {
    const name = s.head ? headText(s.head) : null
    const end = s.body.length ? s.body[s.body.length - 1]!.to : s.head!.to
    // 7. 「问过 AI」的一节：整节一张问答卡，连着的合成一列（讲通的讲法以前写 [!success]，现在写 [!ai] 提示块）
    if (s.head && ASK_HEAD.test(name!) && s.body.some((b) => /^>\s*\[!(question|success|ai)\]/.test(at(b)))) {
      const card: DocUnit = { kind: 'ask', from: s.head.from, to: end, text: text.slice(s.head.from, end) }
      const prev = columns[columns.length - 1]
      if (prev?.ask) {
        prev.cards.push(card)
        prev.end = end
      } else columns.push({ title: '问过 AI', head: null, end, ask: true, cards: [card] })
      total++
      continue
    }
    const col: DocColumn = { title: name, head: s.head ? { from: s.head.from, to: s.head.to } : null, end, ask: false, cards: [] }
    if (s.place) col.place = s.place
    let sub: string | undefined
    let pendingPlace: DocUnit['place'] | undefined
    let pendingTag: DocUnit['tag'] | undefined
    let pendingAttrs: Record<string, string> | undefined
    let carry: MdBlock | null = null
    const push = (u: DocUnit) => {
      if (pendingAttrs) u.attrs = pendingAttrs
      if (pendingPlace) placed.push({ ...u, place: pendingPlace, section: name })
      else {
        if (pendingTag) u.tag = pendingTag
        col.cards.push(u)
      }
      pendingPlace = undefined
      pendingTag = undefined
      pendingAttrs = undefined
      total++
    }
    for (let k = 0; k < s.body.length; k++) {
      const b = s.body[k]!
      const t = at(b)
      const card = CARD_LINE.exec(t)
      if (b.kind === 'html' && card) {
        // 位置行（有 x、y）：这张卡摆在空白处；只记编号的一行：卡还在列里，留着编号给连线、AI 总结的卡
        const a = lineAttrs(card[1]!)
        const x = num(a.x)
        const y = num(a.y)
        pendingPlace = undefined
        pendingTag = undefined
        if (x !== null && y !== null) pendingPlace = { id: a.id ?? '', x, y, from: b.from, to: b.to }
        else if (a.id) pendingTag = { id: a.id, from: b.from, to: b.to }
        pendingAttrs = extraOf(a)
        continue
      }
      if (b.kind === 'html' && /^<!--\s*(column|\/?col|columns)\b/.test(t)) continue
      if (b.kind === 'heading') {
        if (headLevel(b) === colLevel + 1 && !carry) sub = headText(b)
        // 再往下的标题：并进后面那张卡
        else carry ??= b
        continue
      }
      const kind = kindOf(t, b)
      // 别的软件留下的注释（不是卡片、列、视频、时刻的）：白板上什么都不画，不占一张空卡
      if (kind === 'html' && /^<!--[\s\S]*?-->\s*$/.test(t.trim())) continue
      if (kind === 'gap') {
        col.cards.push({ kind: 'gap', from: b.from, to: b.to, text: t })
        continue
      }
      const from = carry ? carry.from : b.from
      let to = b.to
      let k2 = k
      let unitKind: UnitKind = kind
      /** 卡上写在正文前面的那一截（并进来的小标题、冒号那句）：卡上先画它，再按种类画后面那一块 */
      let leadTo = carry ? carry.to : -1
      // 5. 冒号结尾的那句带上下一块；一段字下一行紧跟着（没空行）的列表、引文、代码也带上（「**待办**」下面紧跟的待办）
      const nextB = s.body[k + 1]
      const glued = !!nextB && GLUE.has(nextB.kind) && /^[ \t]*\n$/.test(text.slice(b.to, nextB.from))
      if (kind === 'text' && nextB && (/[:：]\s*$/.test(t) || glued) && nextB.kind !== 'heading' && nextB.kind !== 'hr' && !(nextB.kind === 'html' && CARD_LINE.test(at(nextB)))) {
        k2 = k + 1
        to = s.body[k2]!.to
        unitKind = kindOf(at(s.body[k2]!), s.body[k2]!)
        if (unitKind === 'image' || unitKind === 'gap') unitKind = 'text'
        leadTo = b.to
      }
      // 6. 连着的几张图合成一张图集；连着的几段公式合成一张公式卡
      if (kind === 'image') {
        while (s.body[k2 + 1] && kindOf(at(s.body[k2 + 1]!), s.body[k2 + 1]!) === 'image') to = s.body[++k2]!.to
        if (k2 > k) unitKind = 'images'
      }
      if (kind === 'math') while (s.body[k2 + 1] && kindOf(at(s.body[k2 + 1]!), s.body[k2 + 1]!) === 'math') to = s.body[++k2]!.to
      // 引文下面挂着的「微信读书的想法」「我的评价」（一段接一段）：和引文一张卡（文档里也是一道弯钩连着）
      if (kind === 'quote') while (s.body[k2 + 1]?.kind === 'paragraph' && attached(at(s.body[k2 + 1]!))) to = s.body[++k2]!.to
      const unit: DocUnit = { kind: unitKind, from, to, text: text.slice(from, to) }
      if (leadTo > from) unit.lead = leadTo - from
      // 6. 视频后面紧跟的时刻挂在视频卡下面
      if (kind === 'video') {
        const moments: DocUnit[] = []
        while (s.body[k2 + 1] && kindOf(at(s.body[k2 + 1]!), s.body[k2 + 1]!) === 'moment') {
          const m = s.body[++k2]!
          moments.push({ kind: 'moment', from: m.from, to: m.to, text: at(m) })
        }
        if (moments.length) {
          unit.moments = moments
          unit.to = moments[moments.length - 1]!.to
          unit.text = text.slice(unit.from, unit.to)
        }
      }
      if (sub) unit.sub = sub
      sub = undefined
      carry = null
      push(unit)
      k = k2
    }
    columns.push(col)
  }
  return { title, columns, placed, total, level: colLevel > 6 ? 2 : colLevel }
}

// ---------- 写回 ----------

/** 把 [from, to) 连同它后面的空行拿掉，返回新文字和拿掉的那一段 */
function cut(text: string, from: number, to: number): { rest: string; piece: string } {
  let end = to
  while (text[end] === '\n') end++
  // 拿的是最后一段：把前面的空行也收掉，文末留一个换行
  if (end >= text.length) {
    let start = from
    while (start > 0 && text[start - 1] === '\n') start--
    return { rest: text.slice(0, start) + (start > 0 ? '\n' : ''), piece: text.slice(from, to) }
  }
  return { rest: text.slice(0, from) + text.slice(end), piece: text.slice(from, to) }
}

/** 在 pos 插一整段：前后各隔一个空行 */
function insertBlock(text: string, pos: number, piece: string): string {
  const before = text.slice(0, pos)
  const after = text.slice(pos)
  const lead = before === '' ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const trail = after === '' ? '\n' : /^\n+$/.test(after) || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  return before + lead + piece + trail + after
}

/** 卡片的整个范围：有位置行、编号行时从那一行算起 */
const span = (u: DocUnit) => ({ from: u.place ? u.place.from : u.tag ? u.tag.from : u.from, to: u.to })

// ---------- 连线：frontmatter 里的 links（`  - a1 -> a2`），两头是卡的编号 ----------

const FRONT = /^---\n[\s\S]*?\n---(?:\n|$)/
const LINK_ITEM = /^\s+-\s*(\S+)\s*->\s*(\S+)\s*$/

/** 这篇里的连线 */
export function linksOf(text: string): { from: string; to: string }[] {
  const fm = FRONT.exec(text)?.[0]
  if (!fm) return []
  const lines = fm.split('\n')
  const i = lines.findIndex((l) => /^links:\s*$/.test(l))
  if (i === -1) return []
  const out: { from: string; to: string }[] = []
  for (let j = i + 1; j < lines.length; j++) {
    const m = LINK_ITEM.exec(lines[j]!)
    if (!m) break
    out.push({ from: m[1]!, to: m[2]! })
  }
  return out
}

/** 换掉 frontmatter 里的 links（没有 frontmatter 就加一个；一条都没有就去掉 links:） */
export function withLinksText(text: string, links: { from: string; to: string }[]): string {
  const block = links.length ? ['links:', ...links.map((l) => `  - ${l.from} -> ${l.to}`)] : []
  const fm = FRONT.exec(text)?.[0]
  if (!fm) return links.length ? `---\n${block.join('\n')}\n---\n` + text : text
  const lines = fm.replace(/\n$/, '').split('\n')
  const i = lines.findIndex((l) => /^links:\s*$/.test(l))
  if (i !== -1) {
    let j = i + 1
    while (j < lines.length && LINK_ITEM.test(lines[j]!)) j++
    lines.splice(i, j - i, ...block)
  } else lines.splice(lines.length - 1, 0, ...block)
  const next = lines.join('\n') + (fm.endsWith('\n') ? '\n' : '')
  return next === fm ? text : next + text.slice(fm.length)
}

/** 这张卡的编号要留着：是连线的一头，或者行上还有别的属性（ai=日期） */
function keepsId(text: string, id: string, attrs?: Record<string, string>): boolean {
  if (attrs && Object.keys(attrs).length) return true
  return !!id && linksOf(text).some((l) => l.from === id || l.to === id)
}

/** 卡的编号（位置行或编号行上的），没有是 null */
export const unitId = (u: DocUnit): string | null => u.place?.id || u.tag?.id || null

/**
 * 拖进别的列（或同一列里上下挪）：文档里这段也挪进那一节。before：插到这张卡前面，null 插到这一节末尾。
 * 拖出来的卡（有位置行）放回列里时位置行一起拿掉；它是连线的一头（或 AI 总结的卡）就换成只记编号的一行。
 */
export function moveUnit(text: string, unit: DocUnit, column: DocColumn, before: DocUnit | null): string {
  if (column.ask) throw new Error('「问过 AI」这一列是软件记的，不能往里放')
  const s = span(unit)
  const target = before ? span(before).from : column.end
  if (target >= s.from && target <= s.to) return text
  const { rest, piece } = cut(text, s.from, s.to)
  let body = piece
  if (unit.place) body = (keepsId(text, unit.place.id, unit.attrs) ? tagLine(unit.place.id, unit.attrs) + '\n' : '') + text.slice(unit.from, unit.to)
  // 拿掉以后插入点往前挪了多少
  const removed = text.length - rest.length
  const pos = target > s.to ? target - removed : target
  return insertBlock(rest, Math.max(0, Math.min(rest.length, pos)), body)
}

/** 白板上已经用过的卡片、列的编号 */
function usedIds(text: string): Set<string> {
  const s = new Set<string>()
  for (const m of text.matchAll(/<!--\s*(?:card|column)\s+[^>]*?\bid=(?:"([^"]*)"|(\S+))/g)) s.add(m[1] ?? m[2]!)
  return s
}

/** 新的编号：d1、d2……（prefix 给列用 c，连线加的编号用 k） */
export function freshId(text: string, prefix = 'd'): string {
  const used = usedIds(text)
  let n = 1
  while (used.has(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

/**
 * 拖到空白处：这段前面多一行位置（已经有就改坐标；有编号行就换成位置行，编号不变），正文顺序不变。
 * id：新位置行用这个编号（AI 挪列里的卡时用它在白板上的名字，挪完名字不变）；不给是 d1、d2……
 */
export function placeUnit(text: string, unit: DocUnit, x: number, y: number, id?: string): string {
  if (unit.place) return text.slice(0, unit.place.from) + placeLine(unit.place.id, x, y, unit.attrs) + text.slice(unit.place.to)
  if (unit.tag) return text.slice(0, unit.tag.from) + placeLine(unit.tag.id, x, y, unit.attrs) + text.slice(unit.tag.to)
  const fresh = id && !usedIds(text).has(id) ? id : freshId(text)
  return text.slice(0, unit.from) + placeLine(fresh, x, y) + '\n' + text.slice(unit.from)
}

/** 拖回列里原来的位置：只去掉位置行（编号要留着的换成只记编号的一行） */
export function unplaceUnit(text: string, unit: DocUnit): string {
  if (!unit.place) return text
  if (keepsId(text, unit.place.id, unit.attrs)) return text.slice(0, unit.place.from) + tagLine(unit.place.id, unit.attrs) + text.slice(unit.place.to)
  let end = unit.place.to
  if (text[end] === '\n') end++
  return text.slice(0, unit.place.from) + text.slice(end)
}

/** 摆回原样：去掉文档里所有卡片和列的位置行，全部回到按节摆（连线两头、AI 总结的卡留下只记编号的一行） */
export function resetLayout(text: string): string {
  const wired = new Set(linksOf(text).flatMap((l) => [l.from, l.to]))
  return text.replace(/^<!--\s*(card|column)\s([^\n]*?)-->[ \t]*\n/gm, (all, kind: string, src: string) => {
    if (kind === 'column') return ''
    const a = lineAttrs(src)
    if (num(a.x) === null || num(a.y) === null) return all
    const extra = extraOf(a)
    return a.id && (wired.has(a.id) || extra) ? tagLine(a.id, extra) + '\n' : ''
  })
}

/** 删掉一张卡：文档里这段（连位置行、编号行）一起删，连着它的线也去掉 */
export function removeUnit(text: string, unit: DocUnit): string {
  const s = span(unit)
  const { rest } = cut(text, s.from, s.to)
  const id = unitId(unit)
  if (!id) return rest
  const links = linksOf(rest)
  const kept = links.filter((l) => l.from !== id && l.to !== id)
  return kept.length === links.length ? rest : withLinksText(rest, kept)
}

/** 复制一份：紧跟在它后面（摆在空白处的往右下错开 24，换一个新编号） */
export function duplicateUnit(text: string, unit: DocUnit): string {
  const body = text.slice(unit.from, unit.to)
  const piece = unit.place ? placeLine(freshId(text), unit.place.x + 24, unit.place.y + 24) + '\n' + body : body
  return insertBlock(text, unit.to, piece)
}

/**
 * 连一条线：两头的卡没有编号的先在前面加一行只记编号的（摆在空白处的用位置行的编号）。
 * prefer：没编号时想用的编号（AI 连线时用卡在白板上的名字，连完名字不变）
 */
export function linkUnits(text: string, a: DocUnit, b: DocUnit, prefer: [string?, string?] = []): { text: string; from: string; to: string } {
  let out = text
  const ensure = (u: DocUnit): string => {
    const id = unitId(u)
    if (id) return id
    const want = u === a ? prefer[0] : prefer[1]
    const fresh = want && !usedIds(out).has(want) ? want : freshId(out, 'k')
    out = out.slice(0, u.from) + tagLine(fresh) + '\n' + out.slice(u.from)
    return fresh
  }
  // 先给后面的那张加：前面那张的位置不受影响
  const later = a.from > b.from ? a : b
  const earlier = later === a ? b : a
  const idLater = ensure(later)
  const idEarlier = ensure(earlier)
  const from = a === later ? idLater : idEarlier
  const to = b === later ? idLater : idEarlier
  const links = linksOf(out)
  if (from === to || links.some((l) => l.from === from && l.to === to)) return { text: out, from, to }
  return { text: withLinksText(out, [...links, { from, to }]), from, to }
}

/** 去掉一条线（卡上的编号行留着，不碍事） */
export function unlink(text: string, from: string, to: string): string {
  const links = linksOf(text)
  const kept = links.filter((l) => !(l.from === from && l.to === to))
  return kept.length === links.length ? text : withLinksText(text, kept)
}

/** 列摆到空白处：标题前面一行位置（已经有就改坐标） */
export function placeColumn(text: string, column: DocColumn, x: number, y: number): string {
  if (!column.head) return text
  if (column.place) return text.slice(0, column.place.from) + columnLine(column.place.id, x, y) + text.slice(column.place.to)
  return text.slice(0, column.head.from) + columnLine(freshId(text, 'c'), x, y) + '\n' + text.slice(column.head.from)
}

/**
 * 挪一整节（列）：插到 before 这一列前面，null 是文末；拖回一排里的列，位置行一起去掉。
 * 「问过 AI」合成的列、开头那一组不挪
 */
export function moveColumn(text: string, column: DocColumn, before: DocColumn | null): string {
  if (!column.head) return text
  const from = column.place ? column.place.from : column.head.from
  const to = column.end
  const target = before ? (before.place ? before.place.from : before.head ? before.head.from : null) : text.length
  if (target === null || (target >= from && target <= to)) return text
  const piece = text.slice(column.head.from, to)
  const { rest } = cut(text, from, to)
  if (!before) {
    const base = rest.replace(/\n+$/, '')
    return insertBlock(base, base.length, piece)
  }
  const removed = text.length - rest.length
  const pos = target > to ? target - removed : target
  return insertBlock(rest, Math.max(0, Math.min(rest.length, pos)), piece)
}

/** 删除列（卡片留下）：只删标题那一行（和列的位置行），这一节的卡并进上一节 */
export function removeColumn(text: string, column: DocColumn): string {
  if (!column.head) return text
  const from = column.place ? column.place.from : column.head.from
  let end = column.head.to
  while (text[end] === '\n') end++
  // 删的是最后：前面的空行一起收掉，文末留一个换行
  if (end >= text.length) return text.slice(0, from).replace(/\n+$/, '') + '\n'
  return text.slice(0, from) + text.slice(end)
}

// ---------- 白板上新加的东西（工具板、收件箱拖上来的） ----------

/** 新的一张卡放进一列：插进那一节的落点（before 这张前面，null 是这一节末尾），前后各空一行 */
export function insertInColumn(text: string, column: DocColumn, before: DocUnit | null, body: string): string {
  if (column.ask) throw new Error('「问过 AI」这一列是软件记的，不能往里放')
  const piece = body.trim()
  if (!piece) return text
  return insertBlock(text, before ? span(before).from : column.end, piece)
}

/** 新的一张卡放在空白处：加在文末，前面一行位置（和拖到空白处的卡一样，只管它这一张）；attrs：行上别的属性（ai=日期） */
export function appendPlaced(text: string, body: string, x: number, y: number, attrs?: Record<string, string>): string {
  const piece = body.trim()
  if (!piece) return text
  const base = text.replace(/\n+$/, '')
  return insertBlock(base, base.length, `${placeLine(freshId(text), x, y, attrs)}\n${piece}`)
}

/** 新加一列 = 文档里新起一节：插在 before 这一列的标题前面，null 加在文末；level 是列的标题级别 */
export function addSection(text: string, title: string, before: DocColumn | null, level: number): string {
  const head = `${'#'.repeat(Math.min(6, Math.max(1, level)))} ${title.replace(/\s*\n\s*/g, ' ').trim()}`
  if (before?.head) return insertBlock(text, before.place ? before.place.from : before.head.from, head)
  return insertBlock(text.replace(/\n+$/, ''), text.replace(/\n+$/, '').length, head)
}

/** 改列名 = 改这一节的标题那一行（# 的个数不变） */
export function renameColumn(text: string, column: DocColumn, title: string): string {
  const h = column.head
  const t = title.replace(/\s*\n\s*/g, ' ').trim()
  if (!h || !t) return text
  const line = text.slice(h.from, h.to)
  const marks = /^\s*#+/.exec(line)?.[0] ?? '##'
  return text.slice(0, h.from) + `${marks} ${t}` + text.slice(h.to)
}

// ---------- 认卡：白板、AI、大纲用的编号 ----------

/** 一段字的短签名（FNV-1a）：列里没有编号的卡挪来挪去字没变，名字就不变 */
function sig(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(36).padStart(5, '0').slice(0, 5)
}

/**
 * 每张卡（列里的、空白处的）的名字：有编号用编号，没有用字的签名（k + 5 位，同一段字出现几次加 -2、-3）。
 * 白板上的 data-id、AI 工具的 id、大纲点一项飞过去都用它
 */
export function unitKeys(board: DocBoard): Map<DocUnit, string> {
  const out = new Map<DocUnit, string>()
  const seen = new Map<string, number>()
  const all = [...board.columns.flatMap((c) => c.cards.filter((u) => u.kind !== 'gap')), ...board.placed]
  for (const u of all) {
    const id = unitId(u)
    if (id) {
      out.set(u, id)
      continue
    }
    const base = 'k' + sig(u.text.trim())
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    out.set(u, n === 1 ? base : `${base}-${n}`)
  }
  return out
}

/** AI 整理白板（梦游、/整理当前白板）照的同一套摆法，写进给 AI 的话里 */
export const DOC_BOARD_RULES = `摆白板的规矩（和「文档切到白板」同一套）：
1. 一列是一个主题（文档里就是一节「##」），列名短，说这一组讲什么；开头没归类的几张放最左一组。
2. 一块内容一张卡：一段字、一整个列表、一个引用、一张表格、一张图；冒号结尾的那句和后面那一块算一张。
3. 连着的几张图放在一起；视频卡后面紧跟它的时刻；软件记的「问过 AI」的几张放在一列「问过 AI」里。
4. 每列最多先摆 6 张，多的留在列底；不删卡、不改卡片内容。`

/**
 * 外面改了全文（base 变成 now）以后，base 里的位置在 now 里在哪（按行找出的那几处改动，和编辑器换外部改动同一个 textChanges）。
 * end：这是一段的结尾（改动正好在这里结束算这一段里的）；落在一处改动里面时取改动在 now 里的开头（开头）或结尾（结尾）
 */
function mapThrough(cs: TextChange[], x: number, end: boolean): number {
  let d = 0
  for (const c of cs) {
    const before = end ? c.to < x || (c.to === x && c.from < c.to) : c.to <= x
    if (before) {
      d += c.insert.length - (c.to - c.from)
      continue
    }
    if (c.from >= x) break
    return end ? c.from + d + c.insert.length : c.from + d
  }
  return x + d
}

/**
 * 打开时全文 base 里的那一段 unit，在现在的全文 now（切成了 board）里是哪一段（白板上就地改着一张卡时外面改了这篇：同步盘、手机、AI）。
 * 有编号的按编号认；没编号的按改动前后的位置认。same：字一个没变（外面改的是别处、只挪了位置行）；不是 same：外面改了这一段，取和它重叠最多的那段；
 * 外面把这一段删了：gone 是它原来在 now 里的位置（框留在那里）
 */
export function findUnitAgain(unit: DocUnit, base: string, now: string, board: DocBoard = splitDoc(now)): { unit: DocUnit; same: boolean } | { gone: number } {
  const all = [...board.columns.flatMap((c) => c.cards), ...board.placed].filter((u) => u.kind !== 'gap')
  // 有编号的（空白处的卡、连线的一头）按编号认：编号不会重，一样的字有好几段也认不错
  const id = unitId(unit)
  const byId = id ? all.find((x) => unitId(x) === id) : undefined
  if (byId) return { unit: byId, same: byId.text === unit.text }
  const cs = now === base ? [] : textChanges(base, now)
  const nf = mapThrough(cs, unit.from, false)
  const nt = mapThrough(cs, unit.to, true)
  const same = all.find((x) => x.from === nf && x.text === unit.text)
  if (same) return { unit: same, same: true }
  if (nt <= nf || !now.slice(nf, nt).trim()) return { gone: nf }
  let best: DocUnit | null = null
  let most = 0
  for (const x of all) {
    const o = Math.min(x.to, nt) - Math.max(x.from, nf)
    if (o > most) (most = o), (best = x)
  }
  return best ? { unit: best, same: false } : { gone: nf }
}
