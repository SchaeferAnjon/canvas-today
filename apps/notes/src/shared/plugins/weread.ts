/**
 * 微信读书（内置插件）：右栏网页里读 weread.qq.com，用它自带的划线；划的那一段自动插进中间开着的文档（引文 + 书名章节 + 回到微信读书的链接）。
 * 每本书的划线、想法、书评在后台同步成「阅读/<书名>.md」（书摘），能搜。同步只往书摘里加新的（mergeBook），用户写的评价、自己的段落、改过的属性都不动。
 * 这里只放纯函数：认读书页、拆接口的回答、合并书摘。主进程、界面、网页预加载、测试都用。
 */
import { readProps, setProp } from '@cn/format'
import type { PluginManifest } from '../plugins'
import { when } from '../when'
import { catName } from '../categories'
import { onVaultLang } from '../i18n/vault'

export const WEREAD: PluginManifest = {
  id: 'weread',
  name: '微信读书',
  description: '在右栏网页里读微信读书，用它自带的划线：划的那一段自动插进中间开着的文档（带书名、章节和回到原文的链接）；每本书的划线和想法在后台同步进「阅读」。',
  permissions: ['page', 'net', 'notes:read', 'notes:write'],
  // 右竖条「微信读书」一格（CN-36）：书架；没登录时微信读书自己显示扫码页。主进程按 CN_WEREAD_ORIGIN 换成假网站
  entry: { name: '微信读书', icon: 'book', url: 'https://weread.qq.com/web/shelf' },
}

/** 书摘放在库最外层的「阅读」（2026-11-18 顶级分类：「微信读书」改叫「阅读」，从「素材」下面挪出来，CN-126）；英文库是 Reading，跟着开着的库换 */
export let WEREAD_FOLDER = catName('阅读')
onVaultLang(() => (WEREAD_FOLDER = catName('阅读')))
/** 以前书摘放的地方：库还没挪的时候，这里的书摘照样认，不另建一份 */
export const OLD_WEREAD_FOLDER = '素材/微信读书'
/** 引文下面一段：微信读书里写的想法、用户自己写的评价（编辑器里画成小标签加弯钩） */
export const THOUGHT_TAG = '微信读书的想法'
export const REVIEW_TAG = '我的评价'

export interface WereadSettings {
  /** 划线插进左边开着的文档 */
  insert: boolean
  /** 后台同步划线和想法进「阅读」 */
  sync: boolean
}

export const normalizeWeread = (raw: unknown): WereadSettings => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<WereadSettings>
  return { insert: r.insert !== false, sync: r.sync !== false }
}

/** 网站地址（测试时换成本机的假网站：CN_WEREAD_ORIGIN） */
let webOrigin = 'https://weread.qq.com'
export const setWereadOrigin = (o: string | null) => (webOrigin = o || 'https://weread.qq.com')
export const wereadOrigin = () => webOrigin

/**
 * 书的编号 → 阅读页地址里的那串（/web/reader/<这串>，翻章时后面再接 k<章节>）。做法照 obsidian-weread-plugin 写的：
 * md5 的头三位 + 类型（纯数字 3，别的 4）+ 2 + md5 的末两位；再接分段（纯数字每 9 位一段转十六进制，别的每个字的编码转十六进制拼一段），
 * 每段前写两位十六进制的长度，段间一个 g；不够 20 位拿 md5 补；最后三位是前面这些的 md5 头三位。md5 由调用方给（这里不依赖 Node）。
 */
export function readerCode(bookId: string, md5: (s: string) => string): string {
  const h = md5(bookId)
  const numeric = /^\d*$/.test(bookId)
  const chunks = numeric ? (bookId.match(/\d{1,9}/g) ?? []).map((x) => parseInt(x, 10).toString(16)) : [[...bookId].map((c) => c.charCodeAt(0).toString(16)).join('')]
  let out = h.slice(0, 3) + (numeric ? '3' : '4') + '2' + h.slice(-2)
  out += chunks.map((c) => c.length.toString(16).padStart(2, '0') + c).join('g')
  if (out.length < 20) out += h.slice(0, 20 - out.length)
  return out + md5(out).slice(0, 3)
}

/**
 * 阅读页地址 → 书的编号：把那串拆回去，再编一次对得上才算（拆不出、对不上是 null）。
 * 真网站上阅读页的 __INITIAL_STATE__.reader.bookId 不可靠（2026-11-17 用真账号量：点不同的书，它报的是同一本），所以先看地址。
 */
export function bookIdOfReader(url: string | null | undefined, md5: (s: string) => string): string | null {
  if (!isReader(url)) return null
  const code = new URL(url!).pathname.slice('/web/reader/'.length).split('k')[0]!
  if (!/^[0-9a-f]{6,}[0-9a-fg]*$/.test(code) || code.length < 9) return null
  const type = code[3]
  // 前 7 位：md5 头三位、类型、2、md5 末两位
  let pos = 7
  const chunks: string[] = []
  while (pos < code.length - 3) {
    const len = parseInt(code.slice(pos, pos + 2), 16)
    if (!len) return null
    chunks.push(code.slice(pos + 2, pos + 2 + len))
    pos += 2 + len
    if (code[pos] !== 'g') break
    pos++
  }
  let id: string
  if (type === '3') id = chunks.map((c) => String(parseInt(c, 16))).join('')
  else if (type === '4') id = (chunks.join('').match(/../g) ?? []).map((x) => String.fromCharCode(parseInt(x, 16))).join('')
  else return null
  return id && readerCode(id, md5) === code ? id : null
}

/** 是不是微信读书的阅读页（/web/reader/<书的编号>） */
export function isReader(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return u.origin === webOrigin && /^\/web\/reader\/[\w-]+/.test(u.pathname)
  } catch {
    return false
  }
}

/** 是不是微信读书网站上的页（书架、阅读页都算） */
export function isWeread(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    return new URL(url).origin === webOrigin
  } catch {
    return false
  }
}

export interface Mark {
  id: string
  bookId: string
  chapterUid: number
  chapter: string
  text: string
  /** 秒 */
  created: number
  /** 阅读页上的位置（「12-80」这种），排序用 */
  range: string
}

export interface Thought {
  id: string
  chapter: string
  /** 想法对着的那段原文 */
  abstract: string
  content: string
  created: number
  /** 书评（不对着某一段） */
  isReview: boolean
}

export interface BookInfo {
  bookId: string
  title: string
  author: string
}

type Raw = Record<string, unknown>
const str = (x: unknown) => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '')
const num = (x: unknown) => (typeof x === 'number' ? x : Number(x) || 0)

/** /web/book/bookmarklist 的回答：updated 里每条划线；章节名在条目里或者 chapters 里 */
export function parseBookmarks(raw: unknown, bookId: string): { marks: Mark[]; book: BookInfo | null } {
  const j = (raw ?? {}) as { updated?: Raw[]; chapters?: Raw[]; book?: Raw }
  const chapters = new Map((j.chapters ?? []).map((c) => [num(c.chapterUid), str(c.title)]))
  const marks = (j.updated ?? [])
    .filter((m) => str(m.markText).trim())
    .map((m) => ({
      id: str(m.bookmarkId) || `${bookId}_${str(m.chapterUid)}_${str(m.range)}`,
      bookId: str(m.bookId) || bookId,
      chapterUid: num(m.chapterUid),
      chapter: str(m.chapterName) || chapters.get(num(m.chapterUid)) || '',
      text: str(m.markText).trim(),
      created: num(m.createTime),
      range: str(m.range),
    }))
  const b = j.book
  return { marks, book: b && str(b.title) ? { bookId: str(b.bookId) || bookId, title: str(b.title), author: str(b.author) } : null }
}

/** /web/review/list?mine=1 的回答：想法（对着一段原文）和书评 */
export function parseReviews(raw: unknown): Thought[] {
  const j = (raw ?? {}) as { reviews?: { review?: Raw }[] }
  return (j.reviews ?? [])
    .map((r) => r.review ?? {})
    .filter((r) => str(r.content).trim() || str(r.abstract).trim())
    .map((r) => ({
      id: str(r.reviewId),
      chapter: str(r.chapterName),
      abstract: str(r.abstract).trim(),
      content: str(r.content).trim(),
      created: num(r.createTime),
      isReview: !str(r.abstract).trim() || num(r.type) === 4,
    }))
}

/** /api/user/notebook 的回答：有划线或想法的书 */
export function parseNotebooks(raw: unknown): (BookInfo & { marks: number; reviews: number; updated: number })[] {
  const j = (raw ?? {}) as { books?: Raw[] }
  return (j.books ?? [])
    .map((b) => {
      const book = (b.book ?? {}) as Raw
      return {
        bookId: str(b.bookId) || str(book.bookId),
        title: str(book.title),
        author: str(book.author),
        // 网页「笔记」页上的划线数是 noteCount；bookmarkCount 是另一种计数（真账号上划了 2 条时它是 0）
        marks: num(b.noteCount ?? b.bookmarkCount),
        reviews: num(b.reviewCount),
        updated: num(b.sort ?? b.updateTime),
      }
    })
    .filter((b) => b.bookId && b.title)
}

/** 新划的：上次见过的编号里没有的 */
export const newMarks = (marks: Mark[], seen: ReadonlySet<string>) => marks.filter((m) => !seen.has(m.id))

/** 书名当文件名 */
const safeTitle = (title: string) => title.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || '未命名的书'
/** 书名当文件名：阅读/<书名>.md */
export const bookFile = (title: string) => `${WEREAD_FOLDER}/${safeTitle(title)}.md`
/** 以前的位置：素材/微信读书/<书名>.md */
export const oldBookFile = (title: string) => `${OLD_WEREAD_FOLDER}/${safeTitle(title)}.md`

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ')

/**
 * 插进左边文档的那一段：引文，下一行来源（书名 · 章节，链接回微信读书），和剪进文档的引文同一个写法（白板上认得出是素材卡）。
 */
export function quoteMd(m: Pick<Mark, 'text' | 'chapter'>, book: Pick<BookInfo, 'title'>, url: string): string {
  const quote = m.text
    .split(/\n+/)
    .map((l) => `> ${l.trim()}`)
    .join('\n')
  const src = `《${book.title}》${m.chapter ? ` · ${oneLine(m.chapter)}` : ''}`.replace(/[[\]]/g, ' ')
  return `${quote}\n—— [${src}](${url.replace(/[()\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())})`
}

const p2 = (x: number) => String(x).padStart(2, '0')
const day = (sec: number) => {
  if (!sec) return ''
  const d = new Date(sec * 1000)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
/** 写进书摘的同步时间：2026-11-17 21:25（本地时间） */
const stamp = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}
const unstamp = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s.trim())
  return m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!).getTime() : NaN
}
const rangeStart = (r: string) => Number(r.split('-')[0]) || 0
/** 书里的先后：章节、在这一章里的位置、划的时间 */
const order = (a: Mark, b: Mark) => a.chapterUid - b.chapterUid || rangeStart(a.range) - rangeStart(b.range) || a.created - b.created
/** 比较一段字：不管空白和换行 */
const norm = (s: string) => s.replace(/\s+/g, '')
const chapterOf = (m: Pick<Mark, 'chapter'>) => oneLine(m.chapter).trim() || '（没有章节）'
const quoteLines = (text: string) =>
  text
    .split(/\n+/)
    .map((l) => `> ${l.trim()}`)
    .join('\n')

// ---------------------------------------------------------------- 书摘：一本书一篇，同步只往里加（CN-130）

/** 一次同步要的：这本书、微信读书里现在的划线和想法、上次同步写过哪些 */
export interface BookSync {
  book: BookInfo
  marks: Mark[]
  thoughts: Thought[]
  /** 阅读页（或书的详情页）地址：书摘的「来源」 */
  url: string
  /** 插件记着的、写进过这份书摘的划线和想法编号：书摘里没有了就是用户删的，不再加回来 */
  written: readonly string[]
  /** 现在（毫秒）：书摘变了就记成「同步于」 */
  now: number
}

export interface BookMerge {
  text: string
  /** 写过的编号（以前的加上这次写的、认出来的）：下次同步时传回 written */
  written: string[]
  /** 这次新插进书摘的划线（按书里的先后）：提示「已同步到《书名》· 章节」、「看一眼」用 */
  added: Mark[]
}

type BlockKind = 'h1' | 'h2' | 'h' | 'quote' | 'thought' | 'review' | 'text'
interface Block {
  from: number
  /** 最后一行的末尾（不含换行） */
  to: number
  kind: BlockKind
  /** quote：引文的字（去掉「> 」，几行用换行连着）；thought：标签后面的字；标题：标题字；别的：原文 */
  text: string
}

const FM_RE = /^---\n([\s\S]*?\n)?---(\n|$)/
const KEY_LINE = /^([^\s:#\-][^:\n]*?):[ \t]*(.*?)[ \t]*$/
const THOUGHT_RE = /^(?:微信读书的想法|想法)[：:]\s*/
const REVIEW_RE = /^(\*\*)?我的评价/
/** 以前同步写在标题下面的一句说明（新的书摘不写了，标题下一行摘要 bookMeta 替它） */
const OLD_INTRO = /^(?:.+ · )?微信读书里的划线和想法，软件自动同步，改这里不会改回微信读书。$/

/** frontmatter 后面正文开始的位置 */
const bodyStart = (text: string) => FM_RE.exec(text)?.[0].length ?? 0

/** 正文一块一块：空行隔开；标题自己是一块；围栏代码整个是一块（里面的 # 和空行不算） */
function blocksOf(text: string): Block[] {
  const out: Block[] = []
  let cur: { from: number; to: number; lines: string[] } | null = null
  let fence: string | null = null
  const flush = () => {
    if (cur) out.push(classify(cur.from, cur.to, cur.lines))
    cur = null
  }
  const n = text.length
  for (let i = bodyStart(text); i <= n; ) {
    let j = text.indexOf('\n', i)
    if (j === -1) j = n
    const line = text.slice(i, j)
    const open = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence && cur) {
      cur.lines.push(line)
      cur.to = j
      if (line.trim().startsWith(fence)) fence = null
    } else if (open) {
      flush()
      fence = open[1]!
      cur = { from: i, to: j, lines: [line] }
    } else if (line.trim() === '') flush()
    else if (/^#{1,6}\s/.test(line)) {
      flush()
      out.push(classify(i, j, [line]))
    } else {
      if (!cur) cur = { from: i, to: j, lines: [] }
      cur.lines.push(line)
      cur.to = j
    }
    if (j >= n) break
    i = j + 1
  }
  flush()
  return out
}

function classify(from: number, to: number, lines: string[]): Block {
  const first = lines[0]!
  const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(first)
  if (h) return { from, to, kind: h[1]!.length === 1 ? 'h1' : h[1]!.length === 2 ? 'h2' : 'h', text: h[2]! }
  if (/^\s*>/.test(first) && !/^\s*>\s*\[!/.test(first))
    return {
      from,
      to,
      kind: 'quote',
      text: lines
        .filter((l) => /^\s*>/.test(l))
        .map((l) => l.replace(/^\s*>\s?/, '').trim())
        .join('\n'),
    }
  if (THOUGHT_RE.test(first)) return { from, to, kind: 'thought', text: lines.join('\n').replace(THOUGHT_RE, '') }
  if (REVIEW_RE.test(first)) return { from, to, kind: 'review', text: lines.join('\n') }
  return { from, to, kind: 'text', text: lines.join('\n') }
}

interface Section {
  title: string
  head: Block
  /** 这一节里的块（不含标题） */
  blocks: Block[]
  /** 这一节最后一块的末尾（空节是标题行末尾） */
  end: number
}

/** 「## 标题」一节一节（到下一个一级、二级标题为止） */
function sectionsOf(blocks: Block[]): Section[] {
  const out: Section[] = []
  let cur: Section | null = null
  for (const b of blocks) {
    if (b.kind === 'h1' || b.kind === 'h2') {
      cur = b.kind === 'h2' ? { title: b.text, head: b, blocks: [], end: b.to } : null
      if (cur) out.push(cur)
    } else if (cur) {
      cur.blocks.push(b)
      cur.end = b.to
    }
  }
  return out
}

/** 一段引文连着它下面的想法、评价：插新划线时插在这一组后面，不插进评价中间 */
function groupEnd(blocks: Block[], q: Block, kinds: BlockKind[] = ['thought', 'review']): number {
  let end = q.to
  for (let i = blocks.indexOf(q) + 1; i < blocks.length && kinds.includes(blocks[i]!.kind); i++) end = blocks[i]!.to
  return end
}

const splice = (text: string, at: number, insert: string) => text.slice(0, at) + insert + text.slice(at)

/** 文件末尾接一段（前面空一行，最后留一个换行） */
function append(text: string, block: string): string {
  const body = text.replace(/\s+$/, '')
  return body + (body.length ? '\n\n' : '') + block + '\n'
}

/** frontmatter 的每一行交给 fn 改；没改就原样 */
function editFm(text: string, fn: (lines: string[]) => string[]): string {
  const m = FM_RE.exec(text)
  if (!m) return text
  const lines = m[1] ? m[1].slice(0, -1).split('\n') : []
  const out = fn(lines)
  if (out.length === lines.length && out.every((l, i) => l === lines[i])) return text
  return `---\n${out.map((l) => l + '\n').join('')}---${m[2]}` + text.slice(m[0].length)
}
const keyOf = (l: string) => KEY_LINE.exec(l)?.[1]
const valOf = (l: string) => (KEY_LINE.exec(l)?.[2] ?? '').replace(/^"(.*)"$/, '$1')
/** 以前同步写的英文键 → 现在的中文键（CN-123：文字跟软件语言） */
const OLD_KEYS: Record<string, string> = { author: '作者', source: '来源', marks: '划线', thoughts: '想法' }

/**
 * 旧书摘的开头：type: weread 换成「类型: 书摘」（用户已经选过类型就只留用户的那一行，CN-131），
 * 书名（一级标题就是书名）去掉，英文键换成中文键；只动这几行，顺序不变
 */
function migrateFm(text: string, book: BookInfo): string {
  return editFm(text, (lines) => {
    const has = (k: string) => lines.some((l) => keyOf(l) === k)
    let typed = has('类型')
    const out: string[] = []
    for (const l of lines) {
      const k = keyOf(l)
      if (k === 'type' && valOf(l) === 'weread') {
        if (!typed) out.push('类型: 书摘')
        typed = true
      } else if (k === 'title' && valOf(l) === oneLine(book.title)) continue
      else if (k && OLD_KEYS[k]) {
        if (!has(OLD_KEYS[k]!)) out.push(`${OLD_KEYS[k]}: ${KEY_LINE.exec(l)![2]}`)
      } else out.push(l)
    }
    return out
  })
}

/**
 * 同步一本书进书摘：cur 是书摘现在的字（还没有是 null）。只往里加，不重写：
 * - 新划线插进它那一章：按书里的先后插在后一条引文前面，没有后一条就插在这一章最后一条引文（连同它的想法、评价）后面；
 *   书摘里没有这一章就按章节先后新起一节；
 * - 微信读书里新写的想法挂在它那段引文下面（「微信读书的想法：」，在用户的「我的评价」前面）；对不上引文的放进「## 想法」；书评放进「## 书评」；
 * - 用户删掉的（写过、现在没了）不再加回来；用户写的字、改过的属性一个字不动，只改开头的「划线」「想法」两个数和同步时间；
 * - 旧书摘（type: weread、英文键、开头一句说明、「想法：」）顺手换成现在的写法。
 * 同一份数据再同步一次，一个字节都不变。
 */
export function mergeBook(cur: string | null, s: BookSync): BookMerge {
  const { book } = s
  const written = new Set(s.written)
  const notes = s.thoughts.filter((t) => !t.isReview)
  let text =
    cur ??
    (
      [
        ['类型', '书摘'],
        ['作者', oneLine(book.author)],
        ['来源', s.url],
        ['划线', String(s.marks.length)],
        ['想法', String(notes.length)],
        ['bookId', book.bookId],
      ] as const
    ).reduce((t, [k, v]) => (v ? setProp(t, k, v) : t), `# ${oneLine(book.title)}\n`)
  const before = text

  // 旧写法：开头的键、标题下的说明、「想法：」
  text = migrateFm(text, book)
  {
    const bs = blocksOf(text)
    const h1 = bs.findIndex((b) => b.kind === 'h1')
    const intro = h1 >= 0 ? bs[h1 + 1] : undefined
    if (intro && intro.kind === 'text' && OLD_INTRO.test(intro.text)) text = text.slice(0, bs[h1]!.to) + text.slice(intro.to)
    for (const b of blocksOf(text).reverse())
      if (b.kind === 'thought' && text.startsWith('想法', b.from) && notes.some((t) => norm(t.content) === norm(b.text))) text = text.slice(0, b.from) + THOUGHT_TAG + text.slice(b.from + 2)
  }

  // 划线
  const inFile = (blocks: Block[], m: Mark) => blocks.some((b) => b.kind === 'quote' && norm(b.text) === norm(m.text))
  const added: Mark[] = []
  for (const m of [...s.marks].sort(order)) {
    const blocks = blocksOf(text)
    if (inFile(blocks, m)) {
      written.add(m.id)
      continue
    }
    if (written.has(m.id)) continue
    written.add(m.id)
    added.push(m)
    text = insertMark(text, blocks, m, s.marks)
  }

  // 想法、书评
  for (const t of s.thoughts) {
    const key = 't:' + t.id
    const blocks = blocksOf(text)
    const present = t.isReview ? blocks.some((b) => b.kind === 'text' && norm(b.text).startsWith(norm(t.content))) : blocks.some((b) => b.kind === 'thought' && norm(b.text) === norm(t.content))
    if (present) {
      written.add(key)
      continue
    }
    if (written.has(key)) continue
    written.add(key)
    text = t.isReview ? insertReview(text, blocks, t) : insertThought(text, blocks, t)
  }

  // 开头：没有的补上（用户改过的不动），两个数跟着微信读书
  const props = new Map(readProps(text).map((p) => [p.key, p.value]))
  if (!props.has('作者') && !props.has('author') && book.author) text = setProp(text, '作者', oneLine(book.author))
  if (!props.has('来源') && !props.has('source')) text = setProp(text, '来源', s.url)
  text = setProp(text, '划线', String(s.marks.length))
  text = setProp(text, '想法', String(notes.length))
  if (!props.has('bookId')) text = setProp(text, 'bookId', book.bookId)
  if (text !== before || cur === null) text = setProp(text, 'updated', stamp(s.now))
  return { text, written: [...written], added }
}

/** 一条新划线插进它那一章 */
function insertMark(text: string, blocks: Block[], m: Mark, all: Mark[]): string {
  const q = quoteLines(m.text)
  const sections = sectionsOf(blocks)
  const sec = sections.find((x) => x.title === chapterOf(m))
  if (sec) {
    const quotes = sec.blocks.filter((b) => b.kind === 'quote')
    const markOf = (b: Block) => all.find((x) => norm(x.text) === norm(b.text))
    const next = quotes.find((b) => {
      const x = markOf(b)
      return x !== undefined && order(x, m) > 0
    })
    if (next) return splice(text, next.from, q + '\n\n')
    const last = quotes[quotes.length - 1]
    return splice(text, last ? groupEnd(sec.blocks, last) : sec.end, '\n\n' + q)
  }
  // 没有这一章：按章节先后新起一节
  const uid = (title: string) => all.find((x) => chapterOf(x) === title)?.chapterUid
  const chapters = sections.filter((x) => uid(x.title) !== undefined)
  const after = chapters.find((x) => uid(x.title)! > m.chapterUid)
  const block = `## ${chapterOf(m)}\n\n${q}`
  if (after) return splice(text, after.head.from, block + '\n\n')
  const prev = chapters[chapters.length - 1]
  if (prev) return splice(text, prev.end, '\n\n' + block)
  // 一章都还没有：放在「想法」「书评」两节前面，没有就放最后
  const tail = sections.find((x) => x.title === '想法' || x.title === '书评')
  return tail ? splice(text, tail.head.from, block + '\n\n') : append(text, block)
}

/** 微信读书里的一条想法：挂在它那段引文下面（已有的想法后面、用户的评价前面）；对不上引文的放进「## 想法」 */
function insertThought(text: string, blocks: Block[], t: Thought): string {
  const line = `${THOUGHT_TAG}：${oneLine(t.content)}`
  const a = norm(t.abstract)
  const q = a ? blocks.find((b) => b.kind === 'quote' && (norm(b.text).includes(a) || a.includes(norm(b.text)))) : undefined
  if (q) return splice(text, groupEnd(blocks, q, ['thought']), '\n\n' + line)
  return toSection(text, blocks, '想法', (t.abstract ? `> ${oneLine(t.abstract)}\n\n` : '') + line, '书评')
}

/** 书评：「## 书评」一节最后 */
function insertReview(text: string, blocks: Block[], t: Thought): string {
  return toSection(text, blocks, '书评', t.content.trim() + (t.created ? `\n— ${day(t.created)}` : ''))
}

/** 放进「## title」这一节最后；没有这一节就新起一节（在 beforeTitle 那一节前面，没有就放最后） */
function toSection(text: string, blocks: Block[], title: string, block: string, beforeTitle?: string): string {
  const sections = sectionsOf(blocks)
  const sec = sections.find((x) => x.title === title)
  if (sec) return splice(text, sec.end, '\n\n' + block)
  const next = beforeTitle ? sections.find((x) => x.title === beforeTitle) : undefined
  return next ? splice(text, next.head.from, `## ${title}\n\n${block}\n\n`) : append(text, `## ${title}\n\n${block}`)
}

/** 是不是微信读书同步来的书摘（开头有书的编号） */
export const isBookDigest = (text: string) => readProps(text).some((p) => p.key === 'bookId' && p.value.trim() !== '')

/**
 * 书摘标题下一行的摘要（CN-122，代替正文里的属性表）：「书摘 · 关丁 · 微信读书 8 条划线 · 同步于今天 21:25」。
 * 不是微信读书同步来的书摘是 null；旧书摘（type: weread、英文键）也认
 */
export function bookMeta(text: string, now = Date.now()): string | null {
  const p = new Map(readProps(text).map((x) => [x.key, x.value]))
  if (!p.get('bookId')) return null
  const type = p.get('类型') || (p.get('type') === 'weread' ? '书摘' : '')
  const author = p.get('作者') || p.get('author') || ''
  const n = p.get('划线') || p.get('marks') || ''
  const at = unstamp(p.get('updated') ?? '')
  return [type, author, n ? `微信读书 ${n} 条划线` : '微信读书', Number.isNaN(at) ? '' : `同步于${when(at, { now, time: true })}`].filter(Boolean).join(' · ')
}

/** 同步进书摘以后的提示（CN-118）：「已同步到《书名》· 章节」；几段同一章加段数，跨章只写段数 */
export function syncedText(title: string, added: Pick<Mark, 'chapter'>[]): string {
  const chapters = [...new Set(added.map(chapterOf))]
  const n = added.length
  return chapters.length === 1 ? `已同步到《${title}》· ${chapters[0]}${n > 1 ? ` · ${n} 段` : ''}` : `已同步到《${title}》· ${n} 段`
}

/** 右栏网页里微信读书登录了没有：in 有登录（右栏 persist:web 里有 wr_vid、wr_skey）；expired 有但微信读书说过期了；out 没有 */
export interface WereadLogin {
  state: 'in' | 'expired' | 'out'
  /** 微信读书的昵称、头像（取得到才有） */
  name?: string
  avatar?: string
}

/** 设置页里显示的同步状态 */
export interface WereadStatus {
  /** ok / 没登录 / 出错 / 还没同步过 */
  state: 'ok' | 'login' | 'error' | 'never'
  login: WereadLogin
  /** 上次同步完的时间（毫秒） */
  lastSync: number
  books: number
  marks: number
  error?: string
  syncing: boolean
}

/** 网页版接口（weread.qq.com，和 obsidian-weread-plugin 一样用网页登录的 cookie）：errCode / errcode 两种写法；-2010 用户不存在、-2012 登录超时 */
export function apiError(raw: unknown): { login: boolean; message: string } | null {
  const j = (raw ?? {}) as { errcode?: unknown; errCode?: unknown; errmsg?: unknown; errMsg?: unknown }
  const code = Number(j.errCode ?? j.errcode ?? 0)
  if (!code) return null
  return { login: code === -2010 || code === -2012, message: String(j.errMsg ?? j.errmsg ?? '') || `微信读书出错（${code}）` }
}

/** 右栏 cookie 里认登录：wr_vid（用户编号）和 wr_skey（登录凭据）都在 */
export function loginOf(cookies: readonly { name: string; value: string }[]): { vid: string } | null {
  const get = (n: string) => cookies.find((c) => c.name === n)?.value ?? ''
  const vid = get('wr_vid')
  return vid && get('wr_skey') ? { vid } : null
}

/**
 * 这次该插进文档的划线：见过这本书就是没见过的那些；
 * 没见过这本书（打开书那一次没取成）而这次是划线触发的：2 分钟内新建的当成新的，别把刚划的第一条吞掉。
 */
export function marksToInsert(marks: Mark[], seen: readonly string[] | undefined, why: string, nowSec: number): Mark[] {
  if (seen) return newMarks(marks, new Set(seen))
  if (why === 'open') return []
  return marks.filter((m) => m.created && nowSec - m.created <= 120)
}
