/**
 * 回到网页那一段的链接（task-6cxtc，偏好「网页的笔记记在正在剪进去的那篇」）：标准的「网址 + #:~:text=那段开头」
 * （Chrome、Edge 的 Text Fragments），拿到别的浏览器里点也能跳到那段；软件自己点它时用「读到哪」那套找段落的办法找回、亮一下。
 * 纯函数：网页预加载、界面、测试都用，不碰 Electron。
 */
import { firstSentence, normText } from './read-anchor'
import { bookTitle, cleanHead, pageHead, stripHash } from './read-along'

/** 「那段开头」最多几个字（长了在词边上截，别的浏览器按词找，截在半个词上就找不到） */
const FRAG_MAX = 40
/** 截短时至少留几个字（太短到处都对得上） */
const FRAG_MIN = 8

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('zh', { granularity: 'word' }) : null

/** 那段开头：选中的字的第一句；40 字以内整句，长了在词边上截到 40 字以内，末尾的空白和标点去掉 */
export function fragmentText(quote: string): string {
  const s = firstSentence(normText(quote))
  if (s.length <= FRAG_MAX) return s
  let out = ''
  if (segmenter) {
    for (const p of segmenter.segment(s)) {
      if (out.length + p.segment.length > FRAG_MAX) break
      out += p.segment
    }
  }
  if (out.length < FRAG_MIN) out = s.slice(0, FRAG_MAX)
  return out.replace(/[\s.,;:!?，。；：！？、…·\-–—/\\(（【「『]+$/u, '')
}

/**
 * text= 后面那一截：中文照写，空白和 % , - & ( ) # < > " ` 转成 %xx（网址里不断开，md 链接里也不断开）；
 * 公式（`$\mathbf{X}$`）的 $ \ { } ^ _ | * ~ 也转（文件里一行有两个 $ 会被当成行内公式，反斜杠在 md 里是转义）
 */
export function encodeFragment(s: string): string {
  return s.replace(/[\s%,\-&()#<>"`[\]$\\{}^_|*~]/g,(c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))
}

/** 回到网页那一段的链接：网址（去掉原来的 #…）+ #:~:text=那段开头 */
export function fragmentUrl(url: string, quote: string): string {
  const t = fragmentText(quote)
  return t ? `${stripHash(url)}#:~:text=${encodeFragment(t)}` : stripHash(url)
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** 认回链接里那一段：这一页的网址（去掉 #…）和那段开头；不是这种链接给 null。前文-、,-后文、,结尾那一截都认（只拿开头） */
export function parseFragment(url: string): { page: string; text: string } | null {
  const i = url.indexOf(':~:')
  if (i < 0 || !/^https?:\/\//i.test(url)) return null
  const dir = url
    .slice(i + 3)
    .split('&')
    .find((d) => d.startsWith('text='))
  if (!dir) return null
  const terms = dir.slice(5).split(',')
  if (terms.length > 1 && terms[0]!.endsWith('-')) terms.shift()
  const text = normText(decode(terms[0] ?? ''))
  return text ? { page: stripHash(url), text } : null
}

/** 两个网址是不是同一页（# 后面不算） */
export const samePage = (a: string, b: string) => stripHash(a) === stripHash(b) || decode(stripHash(a)) === decode(stripHash(b))

/** 小标题写进笔记的样子：去掉「¶」；节号后面那个点去掉（「2.2.1. 读取数据集」→「2.2.1 读取数据集」） */
export function sectionHead(h: string): string {
  return cleanHead(h).replace(/^(\d+(?:\.\d+)*)\.(?=\s)/, '$1')
}

/** 回到那一段的链接上写的字：那段上面的小标题，没有就写这一页叫什么 */
export function backLabel(o: { head?: string; title: string; url: string }): string {
  return (o.head && sectionHead(o.head)) || pageHead(o.title, o.url)
}

/** 剪藏来源那一行写的字：「2.2.1 读取数据集 · 动手学深度学习」（小标题 · 书名）；没有小标题是「这一页 · 网站」 */
export function sourceLabel(o: { head?: string; title: string; url: string }): string {
  const book = bookTitle(o.title, o.url)
  const where = backLabel(o)
  return where && where !== book ? `${where} · ${book}` : book
}
