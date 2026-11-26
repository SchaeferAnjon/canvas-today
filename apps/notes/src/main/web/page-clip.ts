/**
 * 整页剪藏：右栏开着的网页，在网页的预加载里用 Readability 抽正文、Turndown 转成 md，
 * 这里拼成一篇收件箱笔记（frontmatter 带 created 和 source）。
 */
import { ipcMain, type WebContents } from 'electron'
import { relativeLink } from '@cn/format'
import { mdUrl } from '../../shared/layout'

export interface ExtractedPage {
  url: string
  title: string
  byline?: string
  markdown: string
}

let seq = 0
const waiting = new Map<number, { wc: WebContents; resolve(p: ExtractedPage): void; reject(e: Error): void; timer: NodeJS.Timeout }>()

/** 网页预加载抽完正文发回来；要在 app ready 后调一次 */
export function listenForExtracts() {
  ipcMain.on('cn:extracted', (e, id: unknown, page: unknown, error: unknown) => {
    const w = typeof id === 'number' ? waiting.get(id) : undefined
    // 只认发请求的那个网页回的话
    if (!w || w.wc.id !== e.sender.id) return
    waiting.delete(id as number)
    clearTimeout(w.timer)
    if (typeof error === 'string') return w.reject(new Error(error))
    const p = page as Partial<ExtractedPage> | null
    if (!p || typeof p.markdown !== 'string' || typeof p.url !== 'string' || typeof p.title !== 'string') return w.reject(new Error('网页正文抽不出来'))
    w.resolve({ url: p.url, title: p.title, markdown: p.markdown, ...(typeof p.byline === 'string' && p.byline ? { byline: p.byline } : {}) })
  })
}

export function extractPage(wc: WebContents): Promise<ExtractedPage> {
  const id = ++seq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id)
      reject(new Error('网页太久没回应，没剪成'))
    }, 20_000)
    waiting.set(id, { wc, resolve, reject, timer })
    wc.send('cn:extract', id)
  })
}

/** 文件名：标题去掉网站名尾巴（「 - 知乎」「 | Medium」） */
export function clipFileName(title: string, url: string): string {
  const t = title.replace(/\s+[-|–—_·]\s+[^-|–—_·]{1,30}$/, '').trim()
  if (t) return t.slice(0, 60)
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return '网页'
  }
}

/** 收件箱里那篇：frontmatter（created、source）+ 一级标题 + 来源行 + 正文 */
export function pageClipText(page: ExtractedPage, stamp: string): string {
  const title = page.title.trim() || page.url
  const safeTitle = title.replace(/[\[\]]/g, '')
  const src = mdUrl(page.url)
  let body = page.markdown.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  // 正文开头常是文章自己的标题（和上面的一级标题重复）：去掉
  const first = /^#{1,6}\s+(.+)\n*/.exec(body)
  if (first && title.includes(first[1]!.trim())) body = body.slice(first[0].length)
  const by = page.byline ? ` · ${page.byline.trim()}` : ''
  return `---\ncreated: ${stamp}\nsource: ${page.url}\n---\n# ${title}\n\n—— [${safeTitle}](${src})${by}\n\n${body}\n`
}

/** 套着链接的图 `[![说明](图)](网址)`：只留图（维基百科的图都链到「File:」页，留着在文档里画不成图） */
const LINKED_IMAGE = /\[(!\[[^\]\n]*\]\([^)\s]+\))\]\([^)\s]+\)/g
const WEB_IMAGE = /(!\[[^\]\n]*\]\()(https?:\/\/[^)\s]+)\)/g

/**
 * 整页剪藏的正文里网上的图存进这篇的附件文件夹，正文改成相对路径（第 8 轮：网页的图以后打不开、离线看不到）。
 * save 把一张图存进库、返回库里的路径；存不下的（下载失败、不是图、过了 deadline 还没轮到的）留网址，文档里照样显示网上的图。
 * 同一张图只存一次；一次最多 max 张，4 张一起下。
 */
export async function localizeImages(
  text: string,
  notePath: string,
  save: (url: string) => Promise<string>,
  opts: { max?: number; deadline?: number } = {},
): Promise<{ text: string; files: string[] }> {
  const max = opts.max ?? 60
  const deadline = opts.deadline ?? Date.now() + 25_000
  const unwrapped = text.replace(LINKED_IMAGE, '$1')
  const urls = [...new Set([...unwrapped.matchAll(WEB_IMAGE)].map((m) => m[2]!))].slice(0, max)
  const saved = new Map<string, string>()
  let next = 0
  const worker = async () => {
    while (next < urls.length && Date.now() < deadline) {
      const url = urls[next++]!
      try {
        saved.set(url, await save(url))
      } catch {
        // 存不下的留网址：文档里照样显示网上的图
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker))
  if (!saved.size) return { text, files: [] }
  const out = unwrapped.replace(WEB_IMAGE, (all, head: string, url: string) => {
    const p = saved.get(url)
    return p ? `${head}${mdUrl(relativeLink(notePath, p))})` : all
  })
  return { text: out, files: [...new Set(saved.values())] }
}
