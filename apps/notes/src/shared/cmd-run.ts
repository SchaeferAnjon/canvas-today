/**
 * AI 命令真跑时要的（task-9womr）：每条命令交给 AI 的话、读 AI 的回答、把回答落到文件里。
 * 「只改它说会改的」由这里保证，不靠 AI 自觉：截图转成文字只往图下面插字、补双链只把原话包成 [[…]]、
 * 自测题和每页讲什么只接在末尾、复习提纲只插在最上面、排成计划只挪卡加列、书摘分节只挪顺序加小标题——
 * AI 只给要加什么、放到哪（JSON），文字由这里拼进去，拼完再核一遍（onlyAdded、onlyLinksAdded、sameCards、sameGroups）。
 * 自己存的命令（「存成命令」那张表存下的）照规矩改整篇，先给你看、收下才写。
 * 纯函数，主进程（测试用的假回答）、界面、单元测试都用；不依赖 Electron。
 */
import { addSection, answerLead, type DocColumn, type DocUnit, insertInColumn, moveUnit, parseReadingNote, resolveLink, splitDoc, unitKeys } from '@cn/format'
import { jsonIn } from './distill'
import { answerRule } from './answer-lang'
import type { Write } from './ai-cmds'

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '\n…（后面没给）' : s)
const pad2 = (n: number) => String(n).padStart(2, '0')

/** 视频里的秒写成 03:12、1:02:03 */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${pad2(m)}:${pad2(s % 60)}`
}

/** 一行代码围栏（``` 或 ~~~，三个以上；后面可以跟语言名）：ch 是哪种、len 几个、info 语言名（光秃秃的是空） */
function fenceOf(line: string): { ch: string; len: number; info: string } | null {
  const m = /^\s*(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/.exec(line)
  return m ? { ch: m[1]![0]!, len: m[1]!.length, info: m[2]! } : null
}

/**
 * 从 open 那一行的围栏往下找收住它的那一行；没收住是 -1。
 * 外层用了四个以上的反引号：照 CommonMark，第一个够长的光秃秃围栏就收。
 * 外层三个（AI 多半这样写）：正文里的代码块也是三个，按一对对数——带语言名的围栏开一层、光秃秃的收一层，
 * 外层的结尾是最后一个不在里层的光秃秃围栏（正文里没写语言名的代码块开头也会被当成「收」，取最后一个就对了）
 */
function fenceEnd(lines: readonly string[], open: number): number {
  const o = fenceOf(lines[open]!)!
  let depth = 0
  let end = -1
  for (let i = open + 1; i < lines.length; i++) {
    const f = fenceOf(lines[i]!)
    if (!f || f.ch !== o.ch) continue
    if (o.len > 3) {
      if (!f.info && f.len >= o.len) return i
      continue
    }
    if (f.info) depth++
    else if (depth) depth--
    else end = i
  }
  return end
}

/**
 * 回答里的整篇 Markdown（自己存的命令改整篇）：```markdown（或 ````markdown）围起来的那一段，有几段取最长的；
 * 没有写 markdown 的，就取第一个不在别的代码块里的光秃秃围栏围起来的。
 * 正文里常有代码块（```python … ```）：以前遇到正文里第一个代码块的结尾就收了，后面几节全丢（task-1l29q）。
 * 外层开了没收住（没写完就停了）是 null；没有围栏、整段像一篇笔记（# 或 --- 开头）就用整段
 */
export const docOut = (text: string): string | null => readDoc(text).doc

/** 回答里外层的代码块开了没收尾（AI 没写完就停了） */
export const docCut = (text: string): boolean => readDoc(text).cut

function readDoc(text: string): { doc: string | null; cut: boolean } {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const md = lines.some((l) => /^(markdown|md)$/i.test(fenceOf(l)?.info ?? ''))
  const blocks: string[] = []
  let opened = false
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    const f = fenceOf(lines[i]!)
    if (!f) continue
    if (md ? /^(markdown|md)$/i.test(f.info) : !f.info && !depth) {
      opened = true
      const end = fenceEnd(lines, i)
      if (end < 0) break
      blocks.push(lines.slice(i + 1, end).join('\n'))
      i = end
      continue
    }
    if (f.info) depth++
    else if (depth) depth--
  }
  if (blocks.length) return { doc: blocks.sort((a, b) => b.length - a.length)[0]!.replace(/\s+$/, '') + '\n', cut: false }
  if (opened) return { doc: null, cut: true }
  const t = text.trim()
  return { doc: /^(#|---\n)/.test(t) ? t + '\n' : null, cut: false }
}

/** 每一行在不在代码块里（围栏那两行也算） */
function inCode(lines: readonly string[]): boolean[] {
  const out: boolean[] = []
  let open: { ch: string; len: number } | null = null
  for (const l of lines) {
    const f = fenceOf(l)
    if (open) {
      out.push(true)
      if (f && f.ch === open.ch && !f.info && f.len >= open.len) open = null
    } else {
      out.push(!!f)
      if (f) open = f
    }
  }
  return out
}

/** 一篇里的每一节（代码块里的 # 不算标题；属性不算）：标题、级别、它自己那段正文（到下一个标题为止） */
function sectionsOf(doc: string): { title: string; level: number; body: string }[] {
  const lines = doc.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n')
  const code = inCode(lines)
  const out: { title: string; level: number; body: string[] }[] = []
  lines.forEach((l, i) => {
    const h = code[i] ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l)
    if (h) out.push({ title: h[2]!, level: h[1]!.length, body: [] })
    else out[out.length - 1]?.body.push(l)
  })
  return out.map((s) => ({ ...s, body: s.body.join('\n') }))
}

/** 字两两相邻的一对对（中文按字，英文、数字连着算；链接、图片只算露出来的字）：比「这段字还在不在」用 */
function bigrams(s: string): Set<string> {
  const t = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[^\p{L}\p{N}]+/gu, '')
  const out = new Set<string>()
  for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2))
  return out
}

/** want 里有几成也在 have 里 */
function recall(want: Set<string>, have: Set<string>): number {
  let hit = 0
  for (const g of want) if (have.has(g)) hit++
  return want.size ? hit / want.size : 1
}

/** 标题认人：去掉编号（「1.3.1 」）和标点、空格 */
const headKey = (t: string) => t.replace(/^[\d.]+\s*/, '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()

/**
 * 改之前有正文、改完整节不见了的那几节（task-1l29q）：标题没了，正文的字也剩不到四分之一（AI 改写整篇时漏掉、截断的）。
 * 改了名字、并进别的节的不算（字还在，真改写过的一篇里这样的节字留着四成到七成）；本来就空着的标题删了不算
 */
export function goneSections(before: string, after: string): string[] {
  const keep = new Set(sectionsOf(after).map((s) => headKey(s.title)))
  const all = bigrams(after)
  return sectionsOf(before)
    .filter((s) => {
      if (keep.has(headKey(s.title))) return false
      const g = bigrams(s.body)
      return g.size >= 6 && recall(g, all) < 0.25
    })
    .map((s) => s.title)
}

/** 规矩里明说了要删整节（不只是删空着的小标题）：少了几节是照规矩做的，不标红 */
export const saysDelete = (instruction: string) => instruction.split('\n').some((l) => /删|去掉|拿掉|只留|只保留/.test(l) && /节|标题|章|部分/.test(l) && !/空/.test(l))

/** 「广播、自动微分、线性回归回顾」：最多写三个名字，多的写「等」 */
export const sectionNames = (names: readonly string[]) => names.slice(0, 3).join('、') + (names.length > 3 ? ' 等' : '')

/** 原来有 frontmatter、AI 改完的没有了：原样补回去（属性是软件和用户的，不让 AI 弄丢） */
export function keepFrontmatter(before: string, after: string): string {
  const fm = /^---\n[\s\S]*?\n---\n/.exec(before)?.[0]
  if (!fm || after.startsWith('---\n')) return after
  return fm + after.replace(/^\n+/, '')
}

/** before 的每一行都按原来的先后留在 after 里（只往里加了东西） */
export function onlyAdded(before: string, after: string): boolean {
  const a = after.split('\n')
  let j = 0
  for (const line of before.split('\n')) {
    while (j < a.length && a[j] !== line) j++
    if (j >= a.length) return false
    j++
  }
  return true
}

// ---------------------------------------------------------------- 自己存的命令

export interface OwnRun {
  name: string
  /** 勾着的规矩，一条一行编号 */
  instruction: string
  title: string
  path: string
  /** 这一篇的全文（网页上是网页的字，文件夹首页是里面最近几篇） */
  text: string
  write: Write
  /** 这一篇里的图一起附上了几张（规矩里常有「图里的内容写成文字」） */
  images: number
  /** 拿什么改：这一篇、网页、文件夹里几篇 */
  source: 'doc' | 'web' | 'folder'
}

export function ownPrompt(o: OwnRun): string {
  const what = o.source === 'web' ? '这个网页' : o.source === 'folder' ? '这个文件夹里的几篇' : '这一篇'
  // 外层用四个反引号：正文里的代码块照常用三个，读回来时分得清哪个是外层的结尾（task-1l29q）
  const fence = '放在一个 ````markdown 代码块里（外层用四个反引号，正文里的代码块照常用三个），代码块外面不要写别的。'
  const out =
    o.write === 'answer'
      ? `只回答，不改文件：照这几条规矩回答，${answerRule()}；平实、直接。`
      : o.write === 'inplace' && o.source === 'doc'
        ? `输出改好以后的整篇 Markdown，${fence}frontmatter、双链、没说要动的图片链接原样留着；不编造原文里没有的事。`
        : `写成一篇新的笔记（Markdown），${fence}不编造${what}里没有的事。`
  return `命令：自己的命令
名字：/${o.name}
文件：${o.path}

照下面这几条规矩处理${what}（规矩是用户从一段多轮对话里提炼的，每条都要做到）：
${o.instruction}

${out}${o.images ? `\n这一篇里的 ${o.images} 张图按先后附在后面。` : ''}

<note title="${o.title.replace(/"/g, "'")}">
${clip(o.text, 60_000)}
</note>`
}

// ---------------------------------------------------------------- 截图转成文字

export interface DocImage {
  /** 第几行（从 0 起） */
  line: number
  /** 原来的写法 */
  raw: string
  /** 库里的路径 */
  path: string
}

const RASTER = /\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/i

/**
 * 这一篇里的图（截图、照片）：![](相对路径) 和 ![[图.png]]；网上的、SVG（画出来的示意图，没有要认的字）、代码块里的不算。
 * find：![[名字]] 只写了名字时在库里找它在哪
 */
export function docImages(doc: string, notePath: string, find: (name: string) => string | null): DocImage[] {
  const out: DocImage[] = []
  let fence = false
  doc.split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    if (fence) return
    for (const m of line.matchAll(/!\[[^\]]*\]\(\s*<?([^)<>]+?)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const url = m[1]!.trim()
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) continue
      const p = resolveLink(notePath, url)
      if (p && RASTER.test(p)) out.push({ line: i, raw: m[0], path: p })
    }
    for (const m of line.matchAll(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
      const name = m[1]!.trim()
      if (!RASTER.test(name)) continue
      const p = name.includes('/') ? name : find(name)
      if (p) out.push({ line: i, raw: m[0], path: p })
    }
  })
  return out
}

export function ocrPrompt(o: { path: string; title: string; doc: string; images: DocImage[] }): string {
  const list = o.images.map((im, i) => `图${i + 1}：第 ${im.line + 1} 行 ${im.raw}`).join('\n')
  return `命令：截图转成文字
文件：${o.path}

这篇笔记里有 ${o.images.length} 张图（截图、照片），按先后附在这条消息后面（图1、图2…）。把每张图上的字写成文字：
- 图上是表格就写成 Markdown 表格；是一段字就照原样写成段落；是代码写成代码块；是公式写 LaTeX（$…$）。
- 只写图上有的字，一个字不改，不解释、不总结。图上没有要认的字（风景、示意图）就写空字符串。
只输出 JSON：[{"n":1,"text":"…"}]

图在笔记里的位置：
${list}

<note title="${o.title.replace(/"/g, "'")}">
${clip(o.doc, 20_000)}
</note>`
}

export function parseOcr(text: string, n: number): { n: number; text: string }[] {
  const j = jsonIn(text)
  const arr = Array.isArray(j) ? j : j && typeof j === 'object' && Array.isArray((j as { items?: unknown }).items) ? (j as { items: unknown[] }).items : []
  const out: { n: number; text: string }[] = []
  for (const x of arr) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const i = Number(o.n)
    const t = typeof o.text === 'string' ? o.text.replace(/\r\n/g, '\n').trim() : ''
    if (Number.isInteger(i) && i >= 1 && i <= n && t && !out.some((y) => y.n === i)) out.push({ n: i, text: t.slice(0, 8000) })
  }
  return out
}

/** 图那一行前面的引用记号、列表缩进：插进去的字照它排，不把引用、列表断开 */
function linePrefix(line: string): string {
  const q = /^((?:\s*>)+\s?)/.exec(line)?.[1]
  if (q) return q
  const li = /^(\s*)([-*+]|\d+[.)])\s+/.exec(line)
  return li ? ' '.repeat(li[0].length) : ''
}

/** 每张图下面插一段它上面的字（空一行）；原来的字一个不动 */
export function applyOcr(doc: string, images: DocImage[], items: { n: number; text: string }[]): string {
  const lines = doc.split('\n')
  const byLine = new Map<number, string[]>()
  for (const it of items) {
    const im = images[it.n - 1]
    if (!im) continue
    byLine.set(im.line, [...(byLine.get(im.line) ?? []), it.text])
  }
  for (const at of [...byLine.keys()].sort((a, b) => b - a)) {
    const pre = linePrefix(lines[at]!)
    const blank = pre.trimEnd()
    const add: string[] = []
    for (const t of byLine.get(at)!) add.push(blank, ...t.split('\n').map((l) => (l ? pre + l : blank)))
    // 图后面紧跟着字（同一段）：插的这段后面再空一行，不和下面那段粘在一起
    if (at + 1 < lines.length && lines[at + 1]!.trim()) add.push(blank)
    lines.splice(at + 1, 0, ...add)
  }
  return lines.join('\n')
}

/** 一次问 AI 附几张图（主进程 MAX_CMD_IMAGES）；一次跑最多认几张，多的说清还剩几张、再跑一次接着做（task-ov1z1） */
export const OCR_BATCH = 8
export const OCR_MAX = 24

/** 去掉引用记号、列表缩进、前后空白 */
const bareLine = (l: string) => l.replace(/^(\s*>)+/, '').trim()
/** 太常见、认不出是哪张图下面的行：围栏、表格分隔行、分隔线、三个字以内 */
const commonLine = (l: string) => /^(`{3,}|~{3,})\S*$/.test(l) || /^\|?[\s:|-]+\|?$/.test(l) || /^([-*_]\s*){3,}$/.test(l) || l.length < 4

/**
 * 哪几张图上次已经转过字（task-t41et）：图下面紧跟着的头一行是以前「截图转成文字」那几次提交加进去的
 * （头一行太常见时第二行也要对得上）。seen：那几次提交加进去的行（主进程从这一篇的提交里找，去掉了引用记号和前后空白）
 */
export function ocrDone(doc: string, images: readonly DocImage[], seen: ReadonlySet<string>): boolean[] {
  const lines = doc.split('\n')
  return images.map((im) => {
    const next: string[] = []
    for (let i = im.line + 1; i < lines.length && next.length < 2; i++) {
      const b = bareLine(lines[i]!)
      if (b) next.push(b)
    }
    if (!next[0] || !seen.has(next[0])) return false
    return !commonLine(next[0]) || (next[1] !== undefined && seen.has(next[1]))
  })
}

/**
 * 图下面本来就有这段字（以前加过但提交里认不出了、自己抄过）：字两两相邻的八成都在图下面那几行里就算（task-t41et）。
 * 只看图下面到下一张图、下一个标题为止
 */
export function alreadyBelow(doc: string, im: DocImage, text: string): boolean {
  const lines = doc.split('\n')
  const near: string[] = []
  const max = text.split('\n').length + 4
  for (let i = im.line + 1; i < lines.length && near.length < max; i++) {
    const l = lines[i]!
    if (/^\s*#{1,6}\s/.test(l) || /!\[/.test(l)) break
    if (l.trim()) near.push(l)
  }
  const want = bigrams(text)
  return want.size > 0 && recall(want, bigrams(near.join('\n'))) >= 0.8
}

// ---------------------------------------------------------------- 补双链

export function linksPrompt(o: { path: string; title: string; doc: string; titles: string[] }): string {
  return `命令：补双链
文件：${o.path}

下面是一篇笔记和库里已有的笔记的名字。找出这篇里提到的、库里已有的笔记（意思对得上就算，比如这篇写「LIF 神经元」，库里有「LIF神经元」），每篇库里的笔记只挑一处：这篇里原样出现的一段字。
不挑标题、代码、已经是链接的字；不挑这篇自己。最多 15 条，没有就输出 []。
只输出 JSON：[{"text":"这篇里原样出现的字","note":"库里笔记的名字"}]

库里的笔记：
${o.titles.map((t) => `- ${t}`).join('\n')}

<note title="${o.title.replace(/"/g, "'")}">
${clip(o.doc, 30_000)}
</note>`
}

export function parseLinks(text: string): { text: string; note: string }[] {
  const j = jsonIn(text)
  const out: { text: string; note: string }[] = []
  for (const x of Array.isArray(j) ? j : []) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const t = typeof o.text === 'string' ? o.text.trim() : ''
    const n = typeof o.note === 'string' ? o.note.trim().replace(/^\[\[|\]\]$/g, '') : ''
    if (t && n && t.length <= 80 && !t.includes('\n')) out.push({ text: t, note: n })
  }
  return out.slice(0, 20)
}

/** 不能加链接的地方：frontmatter、代码、已有的链接和网址、注释、标题行、图片那一行 */
function protectedSpans(doc: string): [number, number][] {
  const spans: [number, number][] = []
  const add = (re: RegExp) => {
    for (const m of doc.matchAll(re)) spans.push([m.index!, m.index! + m[0].length])
  }
  add(/^---\n[\s\S]*?\n---\n/g)
  add(/^(```|~~~)[^\n]*\n[\s\S]*?\n\1[^\n]*$/gm)
  add(/`[^`\n]+`/g)
  add(/!?\[\[[^\]]*\]\]/g)
  add(/!?\[[^\]\n]*\]\([^)\n]*\)/g)
  add(/https?:\/\/[^\s)>\]]+/g)
  add(/<!--[\s\S]*?-->/g)
  add(/^#{1,6}\s.*$/gm)
  add(/^.*!\[.*$/gm)
  add(/<[^>\n]+>/g)
  return spans
}

/** 每条在第一处能加的地方包成 [[笔记]]（字和名字不一样时 [[笔记|字]]）；库里没有的、这篇自己、已经链过的不加 */
export function applyLinks(doc: string, links: { text: string; note: string }[], titles: ReadonlySet<string>, self: string): { text: string; added: string[] } {
  let out = doc
  const added: string[] = []
  const linked = new Set([...doc.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1]!.trim()))
  for (const l of links) {
    if (!titles.has(l.note) || l.note === self || linked.has(l.note) || added.includes(l.note)) continue
    const spans = protectedSpans(out)
    let at = -1
    for (let i = out.indexOf(l.text); i >= 0; i = out.indexOf(l.text, i + 1)) {
      const end = i + l.text.length
      if (!spans.some(([a, b]) => i < b && end > a)) {
        at = i
        break
      }
    }
    if (at < 0) continue
    const wrap = l.text === l.note ? `[[${l.note}]]` : `[[${l.note}|${l.text}]]`
    out = out.slice(0, at) + wrap + out.slice(at + l.text.length)
    added.push(l.note)
  }
  return { text: out, added }
}

/** 去掉新加的 [[笔记|字]]、[[字]] 以后和原来一字不差（只加了链接） */
export function onlyLinksAdded(before: string, after: string): boolean {
  const strip = (s: string) => s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1')
  return strip(before) === strip(after)
}

// ---------------------------------------------------------------- 出几道自测题

/** asked：这篇「自测题」那一节里已经有的题（再出时不和它们重复，task-idmm6） */
export function quizPrompt(o: { path: string; title: string; text: string; asked?: readonly string[] }): string {
  return `命令：出几道自测题
文件：${o.path}

照下面这篇出 5 道自测题，考要紧的概念、做法和为什么，不考书名、日期这类细节。答案两三句，讲清为什么；只用这篇里有的内容。
${o.asked?.length ? `这篇末尾已经有这几道自测题，出 5 道新的，不和它们重复：\n${o.asked.map((q) => `- ${q}`).join('\n')}\n` : ''}只输出 JSON：[{"q":"问题","a":"答案"}]

<note title="${o.title.replace(/"/g, "'")}">
${clip(o.text, 40_000)}
</note>`
}

export function parseQuiz(text: string): { q: string; a: string }[] {
  const j = jsonIn(text)
  const out: { q: string; a: string }[] = []
  for (const x of Array.isArray(j) ? j : []) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const q = typeof o.q === 'string' ? norm(o.q) : ''
    const a = typeof o.a === 'string' ? o.a.trim() : ''
    if (q && a) out.push({ q: q.slice(0, 300), a: a.slice(0, 2000) })
  }
  return out.slice(0, 8)
}

/** 几道题：题目露着，答案收在折叠块里（默认收着，点开看；Obsidian 里也是折叠的）；start 是第一道的编号 */
const quizItems = (items: readonly { q: string; a: string }[], start: number) =>
  items.flatMap((it, i) => [`${start + i}. ${it.q}`, `<details><summary>答案</summary>\n\n${it.a.replace(/<\/details>/gi, '')}\n\n</details>`]).join('\n\n')

/** 自测题那一节 */
export function quizSection(items: { q: string; a: string }[]): string {
  return ['## 自测题', quizItems(items, 1)].join('\n\n')
}

/** 接在末尾一节（前面空一行），原文一字不动 */
export function appendSection(doc: string, section: string): string {
  const body = doc.replace(/\s+$/, '')
  return (body ? body + '\n\n' : '') + section.trim() + '\n'
}

/** 「## 标题」那一节（代码块里的不算，标题一字不差）：第几行到第几行（不含），到下一个同级或更高的标题为止；没有是 null */
export function sectionRange(doc: string, title: string): { from: number; to: number } | null {
  const lines = doc.split('\n')
  const code = inCode(lines)
  let from = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    const h = code[i] ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[i]!)
    if (!h) continue
    if (from >= 0 && h[1]!.length <= level) return { from, to: i }
    if (from < 0 && h[2]!.trim() === title) {
      from = i
      level = h[1]!.length
    }
  }
  return from >= 0 ? { from, to: lines.length } : null
}

/** 「自测题」那一节里编了号的题（折起来的答案里的编号不算）：编号、题目 */
function quizRows(lines: readonly string[], r: { from: number; to: number }): { n: number; q: string }[] {
  const out: { n: number; q: string }[] = []
  let fold = false
  for (const l of lines.slice(r.from + 1, r.to)) {
    if (/<details/i.test(l)) fold = true
    const m = fold ? null : /^(\d+)\.\s+(.+)$/.exec(l)
    if (m) out.push({ n: Number(m[1]), q: m[2]!.trim() })
    if (/<\/details>/i.test(l)) fold = false
  }
  return out
}

/** 已经有的自测题 */
export function existingQuiz(doc: string): string[] {
  const r = sectionRange(doc, '自测题')
  return r ? quizRows(doc.split('\n'), r).map((x) => x.q) : []
}

/**
 * 出好的题写进去（task-idmm6）：已经有「自测题」那一节就接在它最后、编号接着往下；没有就在末尾加一节。原文一字不动。
 * from：新加的第一道是第几题
 */
export function addQuiz(doc: string, items: readonly { q: string; a: string }[]): { text: string; from: number } {
  const r = sectionRange(doc, '自测题')
  if (!r) return { text: appendSection(doc, ['## 自测题', quizItems(items, 1)].join('\n\n')), from: 1 }
  const lines = doc.split('\n')
  const from = Math.max(0, ...quizRows(lines, r).map((x) => x.n)) + 1
  let last = r.to - 1
  while (last > r.from && !lines[last]!.trim()) last--
  lines.splice(last + 1, 0, '', ...quizItems(items, from).split('\n'))
  return { text: lines.join('\n'), from }
}

/** 换掉原来那一节（标题一样的第一节，到下一个同级或更高的标题为止），别处一字不动；没有这一节是 null（task-idmm6） */
export function replaceSection(doc: string, title: string, section: string): string | null {
  const r = sectionRange(doc, title)
  if (!r) return null
  const lines = doc.split('\n')
  const head = lines.slice(0, r.from).join('\n').replace(/\s+$/, '')
  const rest = lines.slice(r.to).join('\n').replace(/^\s+/, '')
  return (head ? head + '\n\n' : '') + section.trim() + '\n' + (rest ? '\n' + rest : '')
}

/** 正文有几个字（属性、标题、注释、图不算）：空笔记、只有标题的先不问 AI（task-ev29m、task-nphy3） */
export function bodyChars(doc: string): number {
  return doc
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((l) => !/^\s*#{1,6}\s/.test(l))
    .join('\n')
    .replace(/!\[[^\]]*\]\([^)]*\)|!\[\[[^\]]*\]\]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '').length
}

/** 插在最上面一节：frontmatter、一级标题和紧跟着的说明之后，第一个「##」之前；原文一字不动 */
export function insertTop(doc: string, section: string): string {
  const lines = doc.split('\n')
  let i = 0
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end > 0) i = end + 1
  }
  const h2 = lines.findIndex((l, k) => k >= i && /^#{1,2}\s/.test(l) && !/^#\s/.test(l))
  if (h2 < 0) return appendSection(doc, section)
  const head = lines.slice(0, h2).join('\n').replace(/\s+$/, '')
  return (head ? head + '\n\n' : '') + section.trim() + '\n\n' + lines.slice(h2).join('\n')
}

// ---------------------------------------------------------------- 拆成白板卡片

/** 这篇有没有小标题（有就照小标题分列，不用问 AI） */
export const hasHeads = (doc: string) => splitDoc(doc).columns.some((c) => c.title !== null && !c.ask)

/** 没有小标题时问 AI 怎么分列：给每段编号 */
export function cardsOf(doc: string): string[] {
  const b = splitDoc(doc)
  return [...b.columns.flatMap((c) => c.cards), ...b.placed].filter((u) => u.kind !== 'gap').map((u) => u.text.trim())
}

export function splitPrompt(o: { path: string; title: string; cards: string[] }): string {
  return `命令：拆成白板卡片
文件：${o.path}

下面这篇没有小标题，按段编了号。按讲的事把这些段分成 2 到 5 列，列名几个字说这一列讲什么；每段只放进一列，段的字不改。
只输出 JSON：[{"name":"列名","items":[1,2]}]

${o.cards.map((c, i) => `【${i + 1}】${clip(c, 600)}`).join('\n\n')}`
}

export function parseColumns(text: string, n: number): { name: string; items: number[] }[] {
  const j = jsonIn(text)
  const seen = new Set<number>()
  const out: { name: string; items: number[] }[] = []
  for (const x of Array.isArray(j) ? j : []) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const name = typeof o.name === 'string' ? norm(o.name).slice(0, 40) : ''
    const items = (Array.isArray(o.items) ? o.items : []).map(Number).filter((i) => Number.isInteger(i) && i >= 1 && i <= n && !seen.has(i) && (seen.add(i), true))
    if (name && items.length) out.push({ name, items })
  }
  return out
}

/**
 * 新的一块白板（type: board，白板就是一篇文档：「##」是列、一块是一张卡）：有小标题就照小标题分列；没有就照 AI 分的列。
 * 卡的字照原文抄（位置行不带，新白板按节摆）；没分到哪一列的放进「其他」
 */
export function splitBoard(o: { title: string; doc: string; columns?: { name: string; items: number[] }[] }): string {
  const head = `---\ntype: board\nfrom: "[[${o.title}]]"\n---\n`
  const parts: string[] = []
  if (o.columns) {
    const cards = cardsOf(o.doc)
    const used = new Set<number>()
    for (const c of o.columns) {
      const body = c.items.filter((i) => cards[i - 1]).map((i) => (used.add(i), cards[i - 1]!))
      if (body.length) parts.push(`## ${c.name}`, ...body)
    }
    const rest = cards.filter((_c, i) => !used.has(i + 1))
    if (rest.length) parts.push('## 其他', ...rest)
  } else {
    const b = splitDoc(o.doc)
    for (const c of b.columns) {
      const cards = c.cards.filter((u) => u.kind !== 'gap').map((u) => u.text.trim())
      if (!cards.length && c.title === null) continue
      if (c.title !== null) parts.push(`## ${c.title}`)
      parts.push(...cards)
    }
    if (b.placed.length) parts.push('## 其他', ...b.placed.filter((u) => u.kind !== 'gap').map((u) => u.text.trim()))
  }
  return head + parts.join('\n\n') + '\n'
}

// ---------------------------------------------------------------- 白板排成计划、计划拆成待办

export interface BoardCard {
  n: number
  text: string
  col: string | null
}

const PLAN_COLS = ['这周', '下周', '以后'] as const
export type PlanCol = (typeof PLAN_COLS)[number]

/** 白板上的卡（问过 AI 那一列、空隙不算）：按文档里的先后编号 */
export function boardCards(text: string): BoardCard[] {
  const b = splitDoc(text)
  const out: BoardCard[] = []
  for (const c of b.columns) if (!c.ask) for (const u of c.cards) if (u.kind !== 'gap') out.push({ n: out.length + 1, text: u.text.trim(), col: c.title })
  for (const u of b.placed) if (u.kind !== 'gap') out.push({ n: out.length + 1, text: u.text.trim(), col: u.section })
  return out
}

export function planPrompt(o: { path: string; title: string; cards: BoardCard[]; today: string }): string {
  return `命令：白板排成计划
文件：${o.path}
今天：${o.today}

下面是白板上的卡，编了号。把每张卡排进三列之一：这周、下周、以后（按卡上说的事急不急、有没有日期）；要去做的事（订、买、写、交、联系……）标成待办。
每张卡都要排，不删卡，不改卡上的字。
只输出 JSON：[{"n":1,"col":"这周","todo":true}]

${o.cards.map((c) => `【${c.n}】${c.col ? `（在「${c.col}」列）` : ''}${clip(c.text, 400)}`).join('\n\n')}`
}

export function parsePlan(text: string, n: number): Map<number, { col: PlanCol; todo: boolean }> {
  const j = jsonIn(text)
  const out = new Map<number, { col: PlanCol; todo: boolean }>()
  for (const x of Array.isArray(j) ? j : []) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const i = Number(o.n)
    const col = PLAN_COLS.find((c) => c === (typeof o.col === 'string' ? o.col.trim() : ''))
    if (Number.isInteger(i) && i >= 1 && i <= n && col && !out.has(i)) out.set(i, { col, todo: o.todo === true })
  }
  return out
}

/** 一张卡的字（去掉待办卡的「**待办**」和方框）：核「卡没少、字没改」用 */
const cardKey = (t: string) => norm(t.replace(/^\*\*待办\*\*\n/, '').replace(/^-\s+\[[ xX]\]\s+/, ''))

/** 白板上的卡一张没少、字没改（待办多了方框不算改） */
export function sameCards(before: string, after: string): boolean {
  const a = boardCards(before).map((c) => cardKey(c.text)).sort()
  const b = boardCards(after).map((c) => cardKey(c.text)).sort()
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/** 白板上的待办卡（工具板拖出来的那种）：「**待办**」下面紧跟着待办；单写「- [ ] …」的几张挨着会并成一张 */
export const TODO_HEAD = '**待办**'

/** 一张单行的文字卡变成待办卡（「**待办**」下面一条「- [ ] 原来的字」，字不改）；别的卡不动 */
function todoify(text: string, u: DocUnit | undefined): string {
  if (!u || u.kind !== 'text' || u.text.trim().includes('\n') || u.text.trim().startsWith(TODO_HEAD)) return text
  return text.slice(0, u.from) + `${TODO_HEAD}\n- [ ] ${u.text.trim()}` + text.slice(u.to)
}

/**
 * 排成计划：没有「这周」「下周」「以后」三列就加在最左边（原来的列不删，挪空了留着），每张卡挪进它那一列的末尾；
 * 标了待办、只有一行字的卡前面加「- [ ] 」。AI 没排到的卡留在原处。
 * 一张张挪：每挪一张重新切一遍，按「原来在哪一列、字一样的第几张」找回它（挪走的不在原来那一列了，留下的数着跳过）
 */
export function applyPlan(text: string, plan: Map<number, { col: PlanCol; todo: boolean }>): string {
  const cards = boardCards(text)
  let out = text
  const first = splitDoc(out).columns.find((c) => c.title !== null && !c.ask && !PLAN_COLS.includes(c.title as PlanCol))?.title ?? null
  for (const t of PLAN_COLS) {
    const b = splitDoc(out)
    if (b.columns.some((c) => c.title === t)) continue
    out = addSection(out, t, first === null ? null : (b.columns.find((c) => c.title === first && c.head) ?? null), b.level || 2)
  }
  const stayed = new Map<string, number>()
  for (const c of cards) {
    const key = `${c.col ?? ''}\u0000${norm(c.text)}`
    const p = plan.get(c.n)
    const b = splitDoc(out)
    const here = [...b.columns.filter((x) => !x.ask && x.title === c.col).flatMap((x) => x.cards), ...b.placed.filter((u) => u.section === c.col)].filter((u) => u.kind !== 'gap' && norm(u.text) === norm(c.text))
    const skip = stayed.get(key) ?? 0
    const u = here[skip]
    if (!p || !u || c.col === p.col) {
      stayed.set(key, skip + 1)
      if (p?.todo && u) out = todoify(out, u)
      continue
    }
    const target = b.columns.find((x) => x.title === p.col && !x.ask)
    if (!target) continue
    out = moveUnit(out, u, target, null)
    if (p.todo) {
      const moved = splitDoc(out).columns.find((x) => x.title === p.col && !x.ask)?.cards.filter((x) => x.kind !== 'gap')
      const last = moved?.[moved.length - 1]
      if (last && norm(last.text) === norm(c.text)) out = todoify(out, last)
    }
  }
  return out
}

export function todoPrompt(o: { path: string; card: string; col: string | null }): string {
  return `命令：计划拆成待办
文件：${o.path}

白板上${o.col ? `「${o.col}」列里` : ''}选中的这张卡是一件要做的事，把它拆成 3 到 6 条小待办：每条一件能做完的小事，动词开头，十几个字以内，按先后排。
只输出 JSON：["第一条","第二条"]

<card>
${clip(o.card, 4000)}
</card>`
}

export function parseTodos(text: string): string[] {
  const j = jsonIn(text)
  const arr = Array.isArray(j) ? j : j && typeof j === 'object' && Array.isArray((j as { todos?: unknown }).todos) ? (j as { todos: unknown[] }).todos : []
  return arr
    .filter((x): x is string => typeof x === 'string')
    .map((x) => norm(x).replace(/^-\s*\[[ xX]\]\s*/, '').replace(/^[-*]\s+/, ''))
    .filter(Boolean)
    .slice(0, 8)
}

/** 选中的那张卡：白板上它的 key（DocBoardView 的选中）→ 它的字、它在哪一列 */
export function selectedCard(text: string, key: string): { unit: DocUnit; col: DocColumn | null } | null {
  const b = splitDoc(text)
  for (const [u, k] of unitKeys(b)) {
    if (k !== key) continue
    const col = b.columns.find((c) => c.cards.includes(u)) ?? null
    return { unit: u, col }
  }
  return null
}

/** 拆好的几条小待办：一张待办卡（「**待办**」下面一条一个方框），接在选中那张后面（同一列）；原来那张不动 */
export function applyTodos(text: string, key: string, todos: string[]): string {
  const hit = selectedCard(text, key)
  if (!hit || !todos.length) return text
  const body = [TODO_HEAD, ...todos.map((t) => `- [ ] ${t}`)].join('\n')
  const col = hit.col
  if (col && !col.ask) {
    const i = col.cards.indexOf(hit.unit)
    const next = col.cards.slice(i + 1).find((u) => u.kind !== 'gap') ?? null
    return insertInColumn(text, col, next, body)
  }
  // 拖到空白处的卡：接在它那一节最后
  const b = splitDoc(text)
  const sec = b.columns.find((c) => c.title === (hit.unit as DocUnit & { section?: string | null }).section && !c.ask) ?? b.columns[b.columns.length - 1]!
  return insertInColumn(text, sec, null, body)
}

// ---------------------------------------------------------------- 读 PDF：每页讲什么、复习提纲

export function pagesPrompt(o: { pdf: string; pages: string[] }): string {
  return `命令：这份课件每页讲什么
文件：${o.pdf}

下面是这份课件每一页的字（按页）。每一页用一两句话说讲了什么（三十个字左右，说内容，不说「这一页介绍了」）；空白页、只有标题的页写一句「标题页」「空白页」。
只输出 JSON：[{"page":1,"text":"…"}]

${o.pages.map((t, i) => `【第 ${i + 1} 页】\n${clip(t.trim() || '（这一页没有字）', 1500)}`).join('\n\n')}`
}

export function parsePages(text: string, n: number): Map<number, string> {
  const j = jsonIn(text)
  const out = new Map<number, string>()
  for (const x of Array.isArray(j) ? j : []) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const p = Number(o.page)
    const t = typeof o.text === 'string' ? norm(o.text) : ''
    if (Number.isInteger(p) && p >= 1 && p <= n && t && !out.has(p)) out.set(p, t.slice(0, 200))
  }
  return out
}

/** link：第几页的链接（「Lecture05.pdf#page=3」，相对那篇笔记） */
export function pagesSection(items: Map<number, string>, link: (page: number) => string): string {
  const rows = [...items].sort((a, b) => a[0] - b[0]).map(([p, t]) => `- [第 ${p} 页](${link(p)})：${t}`)
  return ['## 每页讲什么', rows.join('\n')].join('\n\n')
}

export function reviewPrompt(o: { pdf: string; qas: { page: number; q: string; a: string }[] }): string {
  return `命令：我问过的收成复习提纲
文件：${o.pdf}

下面是读这份课件时问过的问题和 AI 的回答（按页）。收成一页复习提纲：按页排，每处一条，一句话说弄懂了什么（二三十个字），不照抄回答。
只输出 JSON：[{"page":3,"point":"…"}]

${o.qas.map((x) => `【第 ${x.page} 页】问：${norm(x.q)}\n答：${clip(x.a.trim(), 1200)}`).join('\n\n')}`
}

export function parseReview(text: string): { page: number; point: string }[] {
  const j = jsonIn(text)
  const out: { page: number; point: string }[] = []
  for (const x of Array.isArray(j) ? j : []) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const p = Number(o.page)
    const t = typeof o.point === 'string' ? norm(o.point) : ''
    if (Number.isInteger(p) && p >= 0 && t) out.push({ page: p, point: t.slice(0, 200) })
  }
  return out.slice(0, 60)
}

export function reviewSection(items: { page: number; point: string }[], link: (page: number) => string): string {
  const rows = [...items].sort((a, b) => a.page - b.page).map((x) => (x.page > 0 ? `- [第 ${x.page} 页](${link(x.page)})：${x.point}` : `- ${x.point}`))
  return ['## 复习提纲', rows.join('\n')].join('\n\n')
}

// ---------------------------------------------------------------- 视频：要点带时间、字幕整理成一篇

/** 一条字幕：开始、结束（秒）、原文、译文 */
export type CueRow = readonly [number, number, string, string]

/** 交给 AI 的字幕有多长：中日韩的字一个算一，别的字三个算一（英文一样长说的内容少得多），大约是 AI 那边的用量 */
function weight(s: string): number {
  const cjk = s.match(/[\u3000-\u9fff\uac00-\ud7af\uf900-\ufaff]/g)?.length ?? 0
  return cjk + (s.length - cjk) / 3
}

/**
 * 交给 AI 的字幕（task-fw1f3）：每一句前面写它开始的那一秒，AI 照抄就能点回那一句。以前二十秒并成一段、只写段首，
 * 短视频里所有要点都成了 00:00。
 * 长视频（照上面的算法超过 max，英文大约一个半小时、中文大约两小时）这样取舍：
 * 1. 先省时间标记：挨着的几句并成一行，一行至少 10 秒，还长就至少 30 秒；时间写这一行第一句的，点回去差不出这一行；
 * 2. 30 秒一行还长：每一行只留开头那部分字（留多少按超出的比例），后面写「…」。整个视频从头到尾每 30 秒都有，
 *    不会像以前那样只给前面、后半段整段没有。
 */
export function transcript(cues: readonly CueRow[], tr = false, max = 30_000): string {
  const rows = (span: number) => {
    const out: { t: number; text: string[]; tr: string[] }[] = []
    for (const [s, , t, x] of cues) {
      const text = t.replace(/\s+/g, ' ').trim()
      if (!text) continue
      const last = out[out.length - 1]
      if (last && s - last.t < span) {
        last.text.push(text)
        last.tr.push(x.trim())
      } else out.push({ t: s, text: [text], tr: [x.trim()] })
    }
    return out.map((r) => ({ t: r.t, text: r.text.join(' '), tr: tr ? r.tr.join('') : '' }))
  }
  const line = (r: { t: number; text: string; tr: string }) => `[${clock(r.t)}] ${r.text}${r.tr ? `\n（译文）${r.tr}` : ''}`
  let rs = rows(0)
  for (const span of [10, 30]) {
    if (weight(rs.map(line).join('\n')) <= max) break
    rs = rows(span)
  }
  const all = rs.map(line).join('\n')
  const total = weight(all)
  if (total <= max) return all
  // 时间标记、「（译文）」这些不缩，只缩字；每行后面多一个「…」
  const bare = (mark: string) => weight(rs.map((r) => line({ t: r.t, text: mark, tr: r.tr ? mark : '' })).join('\n'))
  const keep = Math.max(0, max - bare('…')) / (total - bare(''))
  const cut = (s: string) => (s.length * keep >= s.length - 1 ? s : s.slice(0, Math.max(8, Math.floor(s.length * keep))) + '…')
  return rs.map((r) => line({ t: r.t, text: cut(r.text), tr: cut(r.tr) })).join('\n')
}

/** AI 给的那一秒落到字幕里最近的那一句开头（它照抄行首时间时不变；估出来的落回它说的那一句，不落在两句中间） */
export function snapToCue(t: number, cues: readonly CueRow[]): number {
  let best = -1
  for (const [s] of cues) if (s <= t + 1 && s > best) best = s
  return best < 0 ? t : Math.floor(best)
}

const plain = (s: string) => s.toLowerCase().replace(/[\s\u3000]+/g, ' ').replace(/[“”‘’"']/g, '').trim()

/** 一句原话（AI 从字幕里照抄的几个词）在字幕里从哪一句开始；找不到是 null */
export function quoteAt(q: string, cues: readonly CueRow[]): number | null {
  const want = plain(q)
  if (want.length < 4) return null
  let all = ''
  const at: { from: number; s: number }[] = []
  for (const [s, , t] of cues) {
    at.push({ from: all.length, s })
    all += plain(t) + ' '
  }
  const i = all.indexOf(want)
  if (i < 0) return null
  let s = at[0]!.s
  for (const x of at) if (x.from <= i) s = x.s
  return Math.floor(s)
}

/**
 * 每条落到字幕里的哪一秒（task-fw1f3）：AI 照抄的原话（q）在字幕里找得到就用那一句的开头（真 Claude Code 偶尔把后面讲的要点写成前面的时间，
 * 原话不会错）；找不到用它给的时间，落回那一句开头。按时间排
 */
export function placeOnCues<T extends { t: number; q?: string }>(items: readonly T[], cues: readonly CueRow[]): T[] {
  return items.map((x) => ({ ...x, t: (x.q ? quoteAt(x.q, cues) : null) ?? snapToCue(x.t, cues) })).sort((a, b) => a.t - b.t)
}

export function vkeyPrompt(o: { title: string; cues: readonly CueRow[] }): string {
  return `命令：视频要点带时间
视频：${o.title}

下面是这个视频的字幕，每行前面是这一行开始的时间（分:秒）。照字幕写 5 到 8 个要点，按时间先后，每条：
- text：一句话（中文，二三十个字）；
- t：讲这一点的那一行前面的时间，照抄（"分:秒"），不要估；
- q：那一行里讲这一点的原话，照抄连着的五到十个词（字幕原来的语言，不翻译、不改字）。
只输出 JSON：[{"t":"01:12","q":"…","text":"…"}]

${transcript(o.cues)}`
}

export function parseVkey(text: string, duration: number): { t: number; text: string; q?: string }[] {
  const j = jsonIn(text)
  const out: { t: number; text: string; q?: string }[] = []
  for (const x of Array.isArray(j) ? j : []) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const t = typeof o.t === 'number' ? o.t : typeof o.t === 'string' ? secOf(o.t) : NaN
    const s = typeof o.text === 'string' ? norm(o.text) : ''
    const q = typeof o.q === 'string' ? o.q.trim().slice(0, 300) : ''
    if (Number.isFinite(t) && t >= 0 && (!duration || t <= duration + 1) && s) out.push({ t: Math.floor(t), text: s.slice(0, 200), ...(q ? { q } : {}) })
  }
  return out.sort((a, b) => a.t - b.t).slice(0, 10)
}

/** 「03:12」「1:02:03」「192」→ 秒 */
function secOf(s: string): number {
  const p = s.trim().split(':').map(Number)
  if (p.some((x) => !Number.isFinite(x))) return NaN
  return p.reduce((acc, x) => acc * 60 + x, 0)
}

/** 新建的那一篇：来源是视频网址，每条要点前面是能点回那一秒的时间 */
export function vkeyNote(o: { title: string; url: string; items: { t: number; text: string }[]; at(t: number): string }): string {
  return `---\n来源: ${o.url}\n---\n# ${o.title} 要点\n\n${o.items.map((x) => `- [${clock(x.t)}](${o.at(x.t)}) ${x.text}`).join('\n')}\n`
}

export function vtextPrompt(o: { title: string; cues: readonly CueRow[]; tr: boolean }): string {
  return `命令：字幕整理成一篇
视频：${o.title}

下面是这个视频的字幕${o.tr ? '（原文和译文）' : ''}，每行前面是这一行开始的时间（分:秒）。整理成通顺的段落：去掉口头禅和重复，按意思分段（一段讲一件事），不加字幕里没有的内容。
每段给原文${o.tr ? '和对应的中文译文' : ''}；t 是这一段第一行前面的时间，照抄（"分:秒"），不要估；q 是这一段第一行开头的原话，照抄连着的五到十个词（不改字）。
只输出 JSON：[{"t":"00:00","q":"…","orig":"…","tr":"…"}]

${transcript(o.cues, o.tr)}`
}

export function parseVtext(text: string): { t: number; orig: string; tr: string; q?: string }[] {
  const j = jsonIn(text)
  const out: { t: number; orig: string; tr: string; q?: string }[] = []
  for (const x of Array.isArray(j) ? j : []) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const t = typeof o.t === 'number' ? o.t : typeof o.t === 'string' ? secOf(o.t) : 0
    const orig = typeof o.orig === 'string' ? o.orig.trim() : ''
    const tr = typeof o.tr === 'string' ? o.tr.trim() : ''
    const q = typeof o.q === 'string' ? o.q.trim().slice(0, 300) : ''
    if (orig || tr) out.push({ t: Number.isFinite(t) ? Math.max(0, Math.floor(t)) : 0, orig, tr, ...(q ? { q } : {}) })
  }
  return out.slice(0, 200)
}

/** 一段一节：时间（能点回那一秒），原文一段，译文一段 */
export function vtextNote(o: { title: string; url: string; paras: { t: number; orig: string; tr: string }[]; at(t: number): string }): string {
  const body = o.paras.map((p) => [`### [${clock(p.t)}](${o.at(p.t)})`, p.orig, p.tr].filter(Boolean).join('\n\n')).join('\n\n')
  return `---\n来源: ${o.url}\n---\n# ${o.title} 字幕整理\n\n${body}\n`
}

// ---------------------------------------------------------------- 书摘按主题分节

export interface DigestGroup {
  /** 一段划线连同挂在它下面的想法、评价（原文照抄） */
  text: string
  /** 划线那几行（给 AI 看的） */
  quote: string
}

export interface Digest {
  /** 第一节之前（属性、书名、说明） */
  head: string
  groups: DigestGroup[]
  /** 「## 想法」「## 书评」这几节：原样留在最后 */
  tail: string
}

const TAIL_SECTIONS = new Set(['想法', '书评'])

/**
 * 书摘拆成一段段：「## 章节」下面每条划线（> 引文）连同它下面的想法、评价是一组；章节标题去掉（换成主题），
 * 「想法」「书评」两节和别的不在章节里的整段原样留着。
 * 一条划线是连着的几行「>」；隔着空行的下一段「>」是下一条划线（微信读书同步来的书摘一章里常挨着几条、中间没写想法）。
 * 以前空行不算隔开，挨着的几条并成一组，分好节再切一遍时挨着排的两组又并到一起，核对永远过不了（task-ftdc9）
 */
export function digestOf(doc: string): Digest | null {
  const lines = doc.split('\n')
  let i = lines.findIndex((l) => /^##\s/.test(l))
  if (i < 0) return null
  const head = lines.slice(0, i).join('\n').replace(/\s+$/, '')
  const groups: DigestGroup[] = []
  const tail: string[] = []
  let cur: string[] | null = null
  let inTail = false
  /** 上一个不空的行是引文 */
  let prevQuote = false
  /** 上一个不空的行后面空过一行 */
  let gap = false
  const close = () => {
    if (cur) {
      const text = cur.join('\n').trim()
      const quote = cur.filter((l) => /^>/.test(l)).join('\n')
      if (text) groups.push({ text, quote: quote || text })
    }
    cur = null
    prevQuote = false
    gap = false
  }
  for (; i < lines.length; i++) {
    const l = lines[i]!
    const h = /^##\s+(.*)$/.exec(l)
    if (h) {
      close()
      inTail = TAIL_SECTIONS.has(h[1]!.trim())
      if (inTail) tail.push(l)
      continue
    }
    if (inTail) {
      tail.push(l)
      continue
    }
    if (!l.trim()) {
      cur?.push(l)
      gap = true
      continue
    }
    const isQ = /^>/.test(l)
    // 新的一条划线开头（前面是想法、评价，或者空了一行的上一条划线）：前一组收起
    if (isQ && (!prevQuote || gap) && cur && (cur as string[]).some((x) => x.trim())) close()
    cur = cur ?? []
    cur.push(l)
    prevQuote = isQ
    gap = false
  }
  close()
  if (!groups.length) return null
  return { head, groups, tail: tail.join('\n').replace(/\s+$/, '') }
}

export function bthemePrompt(o: { title: string; groups: DigestGroup[] }): string {
  return `命令：书摘按主题分节
书：${o.title}

下面是这本书的划线（编了号）。按讲的主题分成 3 到 6 节，主题名几个字；每条划线只放进一节，节里按书里的先后排。
只输出 JSON：[{"theme":"主题名","items":[1,3]}]

${o.groups.map((g, i) => `【${i + 1}】${clip(g.quote.replace(/^>\s?/gm, ''), 500)}`).join('\n\n')}`
}

export function parseThemes(text: string, n: number): { theme: string; items: number[] }[] {
  const j = jsonIn(text)
  const seen = new Set<number>()
  const out: { theme: string; items: number[] }[] = []
  for (const x of Array.isArray(j) ? j : []) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const theme = typeof o.theme === 'string' ? norm(o.theme).replace(/^#+\s*/, '').slice(0, 40) : ''
    const items = (Array.isArray(o.items) ? o.items : []).map(Number).filter((i) => Number.isInteger(i) && i >= 1 && i <= n && !seen.has(i) && (seen.add(i), true))
    if (theme && items.length) out.push({ theme, items })
  }
  return out
}

/** 按主题重排：开头原样，每个主题一节（「## 主题」），划线连同想法、评价原样挪过去；没分到的放「其他」；想法、书评两节原样在最后 */
export function applyThemes(d: Digest, themes: { theme: string; items: number[] }[]): string {
  const used = new Set<number>()
  const parts: string[] = []
  for (const t of themes) {
    const body = t.items.filter((i) => d.groups[i - 1]).map((i) => (used.add(i), d.groups[i - 1]!.text))
    if (body.length) parts.push(`## ${t.theme}`, ...body)
  }
  const rest = d.groups.filter((_g, i) => !used.has(i + 1)).map((g) => g.text)
  if (rest.length) parts.push('## 其他', ...rest)
  return [d.head, ...parts, ...(d.tail ? [d.tail] : [])].filter((x) => x !== '').join('\n\n') + '\n'
}

/** 划线、想法、评价一段没少、一字没改（只挪了顺序） */
export function sameGroups(before: string, after: string): boolean {
  const a = digestOf(before)
  const b = digestOf(after)
  if (!a || !b) return false
  const k = (d: Digest) => d.groups.map((g) => g.text).sort()
  const x = k(a)
  const y = k(b)
  return x.length === y.length && x.every((s, i) => s === y[i]) && a.tail === b.tail
}

// ---------------------------------------------------------------- 写这周的周记

export interface WeekInfo {
  /** 2026-W47 */
  week: string
  from: string
  to: string
  /** 这周改过、新建的笔记（不算周记自己、软件自己的文件） */
  notes: { path: string; title: string; excerpt: string }[]
  /**
   * 这周读过的书（书摘这周新划的线、写的想法）、PDF（这周问过的问题和小结），items 是原话；
   * 以前只交一句「书摘这周有新的划线」，周记里只能写空话，还写出「笔记里没记」（task-iztii）
   */
  books: { title: string; kind: 'book' | 'pdf'; items: string[] }[]
  /** 这周已经写好的那篇周记（weekPath）：再写一次时只补新的事，并进它（task-f4kf7）；还没有是 null */
  had: string | null
}

/** 这一周的周记放在哪（一周一篇） */
export const weekPath = (week: string) => `周记/${week} 周记.md`

/** 一条划线、想法交给 AI 的样子：「划线原话」想法 */
function highlightItem(g: DigestGroup): string {
  const quote = g.quote.replace(/^>\s?/gm, '').replace(/\s+/g, ' ').trim()
  const note = g.text
    .split('\n')
    .filter((l) => l.trim() && !/^>/.test(l))
    .join(' ')
    .trim()
  return `「${quote.length > 160 ? quote.slice(0, 160) + '…' : quote}」${note.slice(0, 160)}`
}

/** 书摘这周新划的线、写的想法（was：这周一开始那一版，那时还没有这本是空的） */
export function newHighlights(was: string, now: string): string[] {
  const old = new Set((digestOf(was)?.groups ?? []).map((g) => norm(g.quote)))
  return (digestOf(now)?.groups ?? []).filter((g) => !old.has(norm(g.quote))).map(highlightItem)
}

/** 读 PDF 的笔记里这周新问的问题（带一句小结，没有小结就带回答开头）；was：这周一开始那一版 */
export function newQuestions(was: string, now: string, note: string): string[] {
  const asks = (md: string) =>
    parseReadingNote(md, note).flatMap((s) => (s.qas?.length ? s.qas.map((qa) => ({ q: qa.q, end: s.recap || answerLead(qa.a) })) : s.doubts.map((q) => ({ q, end: s.recap || s.good }))))
  const old = new Set(asks(was).map((x) => norm(x.q)))
  return asks(now)
    .filter((x) => !old.has(norm(x.q)))
    .map((x) => {
      const end = norm(x.end).slice(0, 120)
      return `问：${norm(x.q).slice(0, 160)}${end ? `（小结：${end}）` : ''}`
    })
}

/** 这一天是第几周（ISO 周：周一开始，含 1 月 4 日的那一周是第 1 周） */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y = t.getUTCFullYear()
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7)
  return `${y}-W${pad2(w)}`
}

/** had：这周已经写好的那篇周记（再写一次时只写它里面没有的新事） */
export function weekPrompt(w: Omit<WeekInfo, 'had'>, had?: string | null): string {
  const books = w.books.map((b) => `- 《${b.title}》（${b.kind === 'pdf' ? 'PDF，这周问过的问题' : '书摘，这周新划的线和想法'}）：\n${b.items.map((x) => `  - ${x}`).join('\n')}`).join('\n')
  return `命令：写这周的周记
这周：${w.week}（${w.from} 到 ${w.to}）

照下面这周改过的笔记、读过的书写一篇周记草稿（Markdown，不要一级标题）：分「这周做了什么」「读了什么」「下周想做什么」三节，每节几条，提到笔记写成 [[笔记名]]。
只写下面有的事，不编；平实、第一人称。「读了什么」照下面的划线原话、问过的问题写具体（读到了什么、弄懂了什么）；下面没列出来的书和事不提，不要写「笔记里没记」「没写」这类话。
${had ? '这周已经写好了一篇周记（在 <week> 里）：只写它里面还没写到的新事，照同样三节写，已经写过的不再写；都写到了就只回一句「没有要加的」。\n' : ''}
这周改过的笔记（${w.notes.length} 篇）：
${w.notes.map((n) => `- [[${n.title}]]（${n.path}）：${norm(n.excerpt).slice(0, 160)}`).join('\n') || '（没有）'}

这周读的：
${books || '（没有）'}${had ? `\n\n<week>\n${had.trimEnd()}\n</week>` : ''}`
}

/** 周记草稿：一级标题是周，AI 写的正文；正文里自己带了一级标题就去掉 */
export function weekNote(w: Pick<WeekInfo, 'week' | 'to'>, body: string): string {
  return `---\n类型: 周记\n日期: ${w.to}\n---\n# ${w.week} 周记\n\n${weekBody(body)}\n`
}

const weekBody = (body: string) => body.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^\s*#\s[^\n]*\n+/, '').trim()
/** 一条事认人：去掉列表记号、多余空白 */
const itemKey = (l: string) => norm(l.replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, ''))
const isItem = (l: string) => /^\s*([-*+]|\d+[.)])\s/.test(l)

/**
 * 这周已经有周记了，再写一次（task-f4kf7）：AI 写的新事一节一节并进去——接在同名那一节最后，没有的节加在末尾；
 * 已经写过的那几条不再加，原来的字一个不动（周记一周一篇：以前另存成「周记 2」，左栏两篇一样的标题）。都写到了就原样返回
 */
export function mergeWeek(had: string, body: string): string {
  let out = had
  const secs: { title: string; lines: string[] }[] = []
  for (const l of weekBody(body).split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(l)
    if (h) secs.push({ title: h[1]!, lines: [] })
    else if (l.trim()) secs[secs.length - 1]?.lines.push(l)
  }
  for (const s of secs) {
    const have = new Set(out.split('\n').map(itemKey).filter(Boolean))
    const add = s.lines.filter((l) => !have.has(itemKey(l)))
    if (!add.length) continue
    const r = sectionRange(out, s.title)
    if (!r) {
      out = appendSection(out, `## ${s.title}\n\n${add.join('\n')}`)
      continue
    }
    const lines = out.split('\n')
    let last = r.to - 1
    while (last > r.from && !lines[last]!.trim()) last--
    // 接在列表后面的还是列表：不空行，接成同一个列表
    lines.splice(last + 1, 0, ...(isItem(lines[last]!) && isItem(add[0]!) ? [] : ['']), ...add)
    out = lines.join('\n')
  }
  return out
}

// ---------------------------------------------------------------- 测试用的假回答（CN_AI_FAKE=1，主进程的 ai.ts 用）

const block = (prompt: string, tag: string) => new RegExp(`<${tag}[^>]*>\\n([\\s\\S]*?)\\n</${tag}>`).exec(prompt)?.[1] ?? ''

/** 新加的这几条命令的假回答：照提示里给的东西拼一个像样的、确定的回答；不认识的命令是 null */
export function fakeCmdAnswer(prompt: string): string | null {
  const cmd = /^命令：(\S+)/.exec(prompt)?.[1]
  const json = (v: unknown) => '```json\n' + JSON.stringify(v) + '\n```'
  switch (cmd) {
    case '自己的命令': {
      const note = block(prompt, 'note')
      const rules = (/照下面这几条规矩处理[^\n]*\n([\s\S]*?)\n\n/.exec(prompt)?.[1] ?? '').split('\n').filter(Boolean).length
      if (/只回答，不改文件/.test(prompt)) return `照 ${rules} 条规矩看过了：这是测试回答。`
      // 去掉「—— 出处」行，标题下面加一句（看得出改过）
      let lines = note.split('\n').filter((l) => !/^——/.test(l.trim()))
      // 演 AI 漏掉整节（规矩里写着「（测试：漏掉后面几节）」）：只交回第一节
      if (prompt.includes('（测试：漏掉后面几节）')) {
        const second = lines.findIndex((l, i) => /^##\s/.test(l) && lines.slice(0, i).some((x) => /^##\s/.test(x)))
        if (second > 0) lines = lines.slice(0, second)
      }
      const h1 = lines.findIndex((l) => /^#\s/.test(l))
      lines.splice(h1 + 1, 0, '', `（测试：照 ${rules} 条规矩改过）`)
      return '```markdown\n' + lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n```'
    }
    case '截图转成文字': {
      const n = (prompt.match(/^图\d+：/gm) ?? []).length
      return json(Array.from({ length: n }, (_x, i) => ({ n: i + 1, text: i === 0 ? '| 写法 | 意思 |\n| --- | --- |\n| x | 标量 |\n| **x** | 向量 |' : `图${i + 1}里的字：测试文字${i + 1}` })))
    }
    case '补双链': {
      const note = block(prompt, 'note')
      const titles = [...prompt.matchAll(/^- (.+)$/gm)].map((m) => m[1]!.trim())
      return json(titles.filter((t) => note.includes(t)).slice(0, 3).map((t) => ({ text: t, note: t })))
    }
    case '出几道自测题': {
      const note = block(prompt, 'note')
      // 已经有几道（提示里列着）：新出的编号接着往下，和原来的不一样
      const had = (/不和它们重复：\n((?:- .*\n?)*)/.exec(prompt)?.[1] ?? '').split('\n').filter((l) => l.startsWith('- ')).length
      const heads = [...note.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1]!.trim()).filter((h) => h !== '自测题')
      const topics = [...heads, '这一篇的要点', '为什么要这样做', '容易错的地方', '一个例子', '和前面的关系'].slice(0, 5)
      return json(topics.map((t, i) => ({ q: `测试题${had + i + 1}：「${t}」讲的是什么？`, a: `测试答案${had + i + 1}：照这篇说的，${t}。` })))
    }
    case '拆成白板卡片': {
      const n = (prompt.match(/^【\d+】/gm) ?? []).length
      const half = Math.ceil(n / 2)
      return json([
        { name: '前一半', items: Array.from({ length: half }, (_x, i) => i + 1) },
        { name: '后一半', items: Array.from({ length: n - half }, (_x, i) => half + i + 1) },
      ])
    }
    case '白板排成计划': {
      const cards = [...prompt.matchAll(/^【(\d+)】(?:（[^）]*）)?(.*)$/gm)].map((m) => ({ n: Number(m[1]), text: m[2]! }))
      const cols = ['这周', '下周', '以后']
      return json(cards.map((c, i) => ({ n: c.n, col: cols[i % 3], todo: /订|买|写|交|联系|做|办/.test(c.text) })))
    }
    case '计划拆成待办': {
      const card = norm(block(prompt, 'card')).slice(0, 12)
      return json([`查一下${card}要准备什么`, `列出${card}的花费`, `把${card}定下来`])
    }
    case '这份课件每页讲什么': {
      const pages = [...prompt.matchAll(/^【第 (\d+) 页】\n(.*)$/gm)].map((m) => ({ page: Number(m[1]), text: `测试：第${m[1]}页讲「${norm(m[2]!).slice(0, 10)}」` }))
      return json(pages)
    }
    case '我问过的收成复习提纲': {
      const qas = [...prompt.matchAll(/^【第 (\d+) 页】问：(.*)$/gm)].map((m) => ({ page: Number(m[1]), point: `测试：弄懂了「${norm(m[2]!).slice(0, 12)}」` }))
      return json(qas)
    }
    case '视频要点带时间': {
      // 像真 AI 那样一句一句挑要点，时间照这一句所在那一行前面写的（task-fw1f3：以前二十秒一行，挑到的句子全写成这一行开头的时间）
      const ts = [...prompt.matchAll(/^\[(\d+:\d+(?::\d+)?)\] (.*)$/gm)].flatMap((m) =>
        norm(m[2]!)
          .split(/(?<=[.!?。！？])\s*/)
          .filter(Boolean)
          .map((text) => ({ t: secOf(m[1]!), text })),
      )
      const step = Math.max(1, Math.floor(ts.length / 5))
      return json(ts.filter((_x, i) => i % step === 0).slice(0, 6).map((x, i) => ({ t: clock(x.t), text: `测试要点${i + 1}：${x.text.slice(0, 16)}` })))
    }
    case '字幕整理成一篇': {
      const ts = [...prompt.matchAll(/^\[(\d+:\d+(?::\d+)?)\] (.*)(?:\n（译文）(.*))?$/gm)].map((m) => ({ t: secOf(m[1]!), orig: m[2]!, tr: m[3] ?? '' }))
      const paras: { t: number; orig: string; tr: string }[] = []
      for (let i = 0; i < ts.length; i += 2) paras.push({ t: ts[i]!.t, orig: ts.slice(i, i + 2).map((x) => x.orig).join(' '), tr: ts.slice(i, i + 2).map((x) => x.tr).join('') || `测试译文${paras.length + 1}` })
      return json(paras.slice(0, 4))
    }
    case '书摘按主题分节': {
      const n = (prompt.match(/^【\d+】/gm) ?? []).length
      const odd = Array.from({ length: n }, (_x, i) => i + 1).filter((i) => i % 2 === 1)
      const even = Array.from({ length: n }, (_x, i) => i + 1).filter((i) => i % 2 === 0)
      return json([{ theme: '测试主题一', items: odd }, ...(even.length ? [{ theme: '测试主题二', items: even }] : [])])
    }
    case '写这周的周记': {
      const notes = [...prompt.matchAll(/^- \[\[(.+?)\]\]/gm)].map((m) => m[1]!)
      // 「读了什么」照提示里「这周读的」那几行原样写（书名一行，下面每条一行）
      const reads = (/^这周读的：\n([\s\S]*?)(?:\n\n|(?![\s\S]))/m.exec(prompt)?.[1] ?? '')
        .split('\n')
        .filter((l) => /^\s*- /.test(l))
        .map((l) => (l.startsWith('- ') ? `- 读了 ${l.slice(2)}` : `- ${l.trim().slice(2)}`))
      // 这周已经有一篇（<week>）：只写它里面没有的
      const had = block(prompt, 'week')
      const fresh = (ls: string[]) => (had ? ls.filter((l) => !had.includes(l.slice(2))) : ls)
      const did = fresh(notes.map((n) => `- 改了 [[${n}]]`))
      const rd = fresh(reads)
      if (had) return did.length || rd.length ? [did.length ? `## 这周做了什么\n\n${did.join('\n')}` : '', rd.length ? `## 读了什么\n\n${rd.join('\n')}` : ''].filter(Boolean).join('\n\n') : '没有要加的'
      return `## 这周做了什么\n\n${did.join('\n') || '- 测试：这周没改笔记'}\n\n## 读了什么\n\n${rd.join('\n') || '- 测试：读了一些'}\n\n## 下周想做什么\n\n- 测试：接着做`
    }
    default:
      return null
  }
}
