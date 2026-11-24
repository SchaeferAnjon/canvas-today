/**
 * AI 对话按地方存（D 组 CN-132）：对话菜单里的一条。key 是地方（「file:周记/2026-W47.md」「folder:周记」「home」「inbox」……），
 * 读 PDF 那一套的对话是「read:<来源>」（PDF、HTML 路径或「web:<网址>」），以前全库只存一份的那段是 LEGACY。
 */
import { pageHead } from './read-along'

export interface ChatSummary {
  key: string
  /** 菜单里写的名字（文档标题、文件夹名、带扩展名的 PDF 文件名、网页标题） */
  label: string
  /** 问了几问 */
  asks: number
  /** 最后一次问答的时间（毫秒） */
  at: number
  /** 这段挂的那页（「这段 → 那页」表里有才有，ConvPages）；没有是挂在自己 key 那一页 */
  page?: string
  /** 这个 key 下面有几段对话（点「+」收起来的也算）；没有是 1 */
  n?: number
  /** 这段第一问的原话（一行、最多 40 字；对话菜单里同一页有几段时写它） */
  first?: string
}

/** 一页里点「+」收起来的一段（对话菜单里这一页下面的一行，点了切回） */
export interface OlderSummary {
  id: number
  /** 那段第一问的原话 */
  label: string
  /** 最后一次问答的时间 */
  at: number
  asks: number
}

/**
 * 「全部对话」里的一段（对话菜单按页归组、能搜，2026-11-24）：一个地方现在这段是一行，点「+」收起来的每段各一行（id 是收起来的编号）
 */
export interface ConvoRow {
  /** 那个地方（对话的 key） */
  key: string
  /** 收起来的那段的编号；现在这段没有 */
  id?: number
  /** 第一问的原话 */
  first: string
  /** 那个地方叫什么 */
  label: string
  at: number
  asks: number
  /** 搜的时候比的字：这段问过的每一句 */
  hay: string
}

/** 「不挂任何页」的对话在「这段 → 那页」表里挂的页 */
export const NO_PAGE = '-'
/** 从一页搬出来的对话（挂到别页、不挂任何页）的 key：conv:<编号> */
export const isMovedConvo = (key: string) => key.startsWith('conv:')

/** 第一问的原话（菜单、胶囊里写的）：第一行、最多 40 字 */
export const firstAsk = (msgs: readonly { role: string; text?: string }[]) => msgs.find((m) => m.role === 'user' && m.text?.trim())?.text?.trim().split('\n')[0]?.slice(0, 40)

/**
 * 「这段 → 那页」表（AI 对话绑页面方向 A，2026-11-24）：对话 key → 它挂的那一页的 key（页的 key 和那页自己那段对话的 key 同一种写法：
 * 「file:周记.md」「read:web:<网址>」……）。只记搬过家的：没在表里的对话挂在自己 key 那一页（「file:A.md」那段就是 A 那页的）。
 * 主进程按库存在 userData/ai/chats/<库>/pages.json；以前「留在这个对话」那张表（本机 localStorage cn.webStay：网页 → 那段）
 * 界面第一次读到时搬进来（网页 → 那段 倒成 那段 → read:web:<网页>），搬完删掉旧的。
 */
export type ConvPages = Record<string, { page: string; label: string; at: number }>
// label：挂的那页叫什么（对话菜单「别的页」的组头、「这是在《X》问的」）；page 是 NO_PAGE 时不用

/** 这段挂在哪页：表里记着的，没记就是它自己 */
export const pageOfConvo = (key: string, pages: ConvPages) => pages[key]?.page ?? key

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

/**
 * 读 PDF 那一套的对话叫什么：PDF、HTML 是文件名（带扩展名）；网页上问的是这一页叫什么（网页标题去掉「 — 书名」那截，
 * 「2.2. 数据预处理」，同「看得到」和空白提示，task-6cxtc 复审），还没有就是域名
 */
export function readLabel(src: string, webTitle?: string): string {
  if (src.startsWith('web:')) return (webTitle && pageHead(webTitle, src.slice(4))) || hostOf(src.slice(4))
  return src.split('/').pop() || src
}
