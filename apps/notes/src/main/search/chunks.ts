/**
 * 搜索用的纯计算：md 和 PDF 切成一段一段（按意思搜时每段算一个向量），PDF 每页的文字里找字。
 * 不碰文件、不碰模型，单元测试直接测。
 */
import { blockPlain, type PdfBlock, type Rect } from '@cn/format'
import { dropDataBlocks, titleOf } from '../../shared/layout'
import { type PdfTextHit, snippetAt } from '../../shared/search'

/** 一段：text 给模型算向量（带上标题），snippet 是结果里显示的那一小段 */
export interface Chunk {
  text: string
  snippet: string
  page?: number
}

/** 一段最多多少字：e5 一次最多 512 个词元，中文大约一字一个，留点余量 */
const CHUNK_CHARS = 360

/** md 变成读得懂的纯文字：去掉 frontmatter、注释、数据库块（和左栏摘要同一个 dropDataBlocks）、图片、链接的网址和 md 记号 */
export function mdPlain(md: string): string {
  return dropDataBlocks(md)
    .replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<details>|<\/details>|<summary>|<\/summary>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_m, a: string, b?: string) => b || a)
    .replace(/^\s*>+ ?\[![a-z]+\][-+]?[ \t]*/gim, '')
    .replace(/^[ \t]*(#{1,6}|>+|[-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/[*_`~]{1,3}/g, '')
    .replace(/[ \t]+/g, ' ')
}

/**
 * 搜索结果里一篇笔记的那一小段：读得懂的纯文字（不露属性、注释、图片文件名、双链括号、列表和标题记号），
 * 命中的词前后各约 24 个字
 */
export function hitSnippet(md: string, words: string[]): string {
  const plain = mdPlain(md.replace(/!\[[^\]]*\]\([^)]*\)/g, '')).replace(/\s+/g, ' ').trim()
  if (!plain) return ''
  const longest = Math.max(0, ...words.map((w) => w.length))
  return snippetAt(plain, words, 48 + longest)
}

/** 段落拼成不超过 max 字的几段；一段太长就硬切 */
function pack(paras: string[], max = CHUNK_CHARS): string[] {
  const out: string[] = []
  let cur = ''
  for (const p of paras) {
    if (cur && cur.length + p.length + 1 > max) {
      out.push(cur)
      cur = ''
    }
    if (p.length > max) {
      for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max))
      continue
    }
    cur = cur ? `${cur}\n${p}` : p
  }
  if (cur) out.push(cur)
  return out
}

const short = (s: string) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > 80 ? one.slice(0, 80) + '…' : one
}

/** 一篇 md 的段：标题算进每一段（模型知道这段是哪篇的），空篇只有标题一段 */
export function mdChunks(path: string, md: string): Chunk[] {
  const title = titleOf(path)
  const paras = mdPlain(md)
    .split(/\n\s*\n|\n(?=\S)/)
    .map((p) => p.trim())
    .filter((p) => p && p !== title)
  const parts = pack(paras)
  if (!parts.length) return [{ text: title, snippet: '' }]
  return parts.map((p) => ({ text: `${title}\n${p}`, snippet: short(p) }))
}

/** PDF 每页一段（太长的页切成几段），图不算 */
export function pdfChunks(path: string, pages: PdfBlock[][]): Chunk[] {
  const title = titleOf(path).replace(/\.pdf$/i, '')
  const out: Chunk[] = []
  pages.forEach((blocks, i) => {
    const paras = blocks.map((b) => blockPlain(b).trim()).filter(Boolean)
    for (const p of pack(paras, CHUNK_CHARS * 1.5)) out.push({ text: `${title}\n${p}`, snippet: short(p), page: i + 1 })
  })
  return out
}

/** 一份 PDF 里找字：每页一条，词都要出现在这一页；rect 是第一处命中的那一段（页上的比例），没有页面大小时不给 */
export function pdfTextHits(path: string, pages: PdfBlock[][], sizes: [number, number][] | undefined, words: string[], limit = 20): PdfTextHit[] {
  if (!words.length) return []
  const out: PdfTextHit[] = []
  for (let i = 0; i < pages.length && out.length < limit; i++) {
    const blocks = pages[i]!.filter((b) => b.kind !== 'image')
    const text = blocks.map((b) => b.text).join('\n')
    const low = text.toLowerCase()
    if (!words.every((w) => low.includes(w))) continue
    const block = blocks.find((b) => words.some((w) => b.text.toLowerCase().includes(w)))!
    const size = sizes?.[i]
    const rect: Rect | undefined = size ? [block.x / size[0], block.y / size[1], block.w / size[0], block.h / size[1]] : undefined
    out.push({ path, page: i + 1, snippet: snippetAt(block.text, words), ...(rect ? { rect } : {}) })
  }
  return out
}
