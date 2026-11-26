/**
 * 网页里一张图拖进 AI 输入框、剪进文档时写的来源（网页图拖进对话）：
 * - AI 输入框里那张图下面一行「图 6.2.1 · zh.d2l.ai」：图注开头的图号，没有图号用图注、alt 的头几个字，再不然图上面的小标题；后面是网站；
 * - 剪进文档：说明写图注（长了截到 120 字），来源一行「—— [图 6.2.1 · 动手学深度学习](网址#:~:text=图注开头)」，网页上照它认回这张图标「剪过」。
 * 纯函数：界面、测试都用，不碰 Electron。
 */
import { relativeLink } from '@cn/format'
import { t } from './i18n'
import { mdUrl } from './layout'
import { normText } from './read-anchor'
import { fragmentUrl, sectionHead, sourceLabel } from './web-link'

export interface WebImgInfo {
  src: string
  alt: string
  /** 图注（没有是空字） */
  caption: string
  head?: string
  /** 网页的网址、标题 */
  url: string
  title: string
  /** 同一张图的别的地址（src 属性、srcset 里的几档；src 是 currentSrc）：拖出去时网页给的是 src 属性，照这些认回是哪张 */
  srcs?: string[]
}

/** 图注开头的图号：「图6.2.1 二维互相关运算」→「图 6.2.1」，「Figure 3: …」→「Figure 3」 */
export function figNumber(caption: string): string | null {
  const m = /^\s*(图|表|Figure|Fig\.|Fig|Table)\s*(\d+(?:[.\-–]\d+)*)/i.exec(caption)
  return m ? `${m[1]} ${m[2]}` : null
}

/** 字太长截到 n 个字（末尾的标点去掉，加「…」） */
function cut(s: string, n: number): string {
  const t = normText(s)
  return t.length <= n ? t : t.slice(0, n).replace(/[\s，。,.;；:：、]+$/, '') + '…'
}

/** 这张图叫什么（短）：图号 > 图注头几个字 > alt 头几个字 > 上面的小标题；都没有是空字 */
export function figName(i: Pick<WebImgInfo, 'caption' | 'alt' | 'head'>): string {
  return figNumber(i.caption) ?? (i.caption ? cut(i.caption, 16) : i.alt ? cut(i.alt, 16) : i.head ? sectionHead(i.head) : '')
}

/** 网站：zh.d2l.ai（去掉 www.） */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** AI 输入框里那张图的来源一行：「图 6.2.1 · zh.d2l.ai」；data: 网页、没名字时只写网站或「网页上的图」 */
export function imgChipLabel(i: WebImgInfo): string {
  const site = siteOf(/^https?:/i.test(i.url) ? i.url : i.src)
  const name = figName(i)
  return [name, site].filter(Boolean).join(' · ') || t('网页上的图')
}

/** 剪进文档时的说明（图注、alt，最多 120 字）和来源一行：「图号 · 书名」，没有图号用上面的小标题，再不然图注、alt 头几个字 */
export function imgClip(i: WebImgInfo): { alt: string; source: { title: string; url: string } } {
  const key = i.caption || i.alt
  const head = figNumber(i.caption) ?? i.head ?? (key ? cut(key, 16) : undefined)
  return {
    alt: cut(key, 120).replace(/[[\]]/g, ' '),
    source: { title: sourceLabel({ ...(head ? { head } : {}), title: i.title, url: i.url }), url: key ? fragmentUrl(i.url, key) : i.url },
  }
}

/** 网页预加载报来的一张图（cn:drag、cn:ctx-img）：查一遍，不对给 null */
export function webImgOf(raw: unknown): WebImgInfo | null {
  const d = raw as Partial<Record<keyof WebImgInfo, unknown>> | undefined
  if (typeof d?.src !== 'string' || typeof d.url !== 'string') return null
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '')
  const head = str(d.head, 200)
  const srcs = Array.isArray(d.srcs) ? d.srcs.filter((x): x is string => typeof x === 'string').slice(0, 12) : []
  return { src: d.src, alt: str(d.alt, 400), caption: str(d.caption, 400), ...(head ? { head } : {}), url: d.url, title: str(d.title, 300), ...(srcs.length ? { srcs } : {}) }
}

/**
 * 存好的图写成 md：![说明](相对路径)，来自网页的再加一行来源。
 * 白板卡片里来源紧跟在下一行；文档里图片要单独成段才画得出来，来源另起一段（sep 传空行）。
 */
export function imageMarkdown(notePath: string, saved: string, c: { alt: string; source?: { title: string; url: string } }, sep = '\n'): string {
  const alt = c.alt.replace(/[\[\]\n]/g, ' ').trim()
  const link = mdUrl(relativeLink(notePath, saved))
  const src = c.source ? `${sep}—— [${(c.source.title || c.source.url).replace(/[\[\]\n]/g, ' ').trim()}](${mdUrl(c.source.url)})` : ''
  return `![${alt}](${link})${src}`
}
