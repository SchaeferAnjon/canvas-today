/**
 * AI 对话按地方存（D 组 CN-132）：对话菜单里的一条。key 是地方（「file:周记/2026-W47.md」「folder:周记」「home」「inbox」……），
 * 读 PDF 那一套的对话是「read:<来源>」（PDF、HTML 路径或「web:<网址>」），以前全库只存一份的那段是 LEGACY。
 */
export interface ChatSummary {
  key: string
  /** 菜单里写的名字（文档标题、文件夹名、带扩展名的 PDF 文件名、网页标题） */
  label: string
  /** 问了几问 */
  asks: number
  /** 最后一次问答的时间（毫秒） */
  at: number
}

/** 以前全库只存一份的对话，迁成这一条 */
export const LEGACY = { key: 'legacy', label: '以前的对话' } as const

/** 读 PDF 那一套的对话在菜单里的 key */
export const readKey = (src: string) => `read:${src}`
/** 菜单里点的是读 PDF 那一套的对话：它的来源；不是就是 null */
export const readSrc = (key: string) => (key.startsWith('read:') ? key.slice(5) : null)

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** 读 PDF 那一套的对话叫什么：PDF、HTML 是文件名（带扩展名）；网页上问的是网页标题（还没有就是域名） */
export function readLabel(src: string, webTitle?: string): string {
  if (src.startsWith('web:')) return webTitle || hostOf(src.slice(4))
  return src.split('/').pop() || src
}
